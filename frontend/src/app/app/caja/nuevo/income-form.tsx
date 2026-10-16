"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { BookOpen, Info, Plus, Save, Trash2 } from "lucide-react";
import { PatientPicker, type PickedPatient } from "@/app/app/agenda/patient-picker";
import { CupsDialog } from "@/components/cups-dialog";
import { FormError } from "@/components/form-error";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatCOP } from "@/lib/format";
import {
  DISCOUNT_TYPES,
  PAYMENT_KINDS,
  PAYMENT_METHODS,
  PAYMENT_TERMS,
  RIPS_PURPOSES,
  type DiscountType,
  type PaymentKind,
  type PaymentMethod,
  type PaymentTerm,
  type Procedure,
  type Professional,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { registerIncome } from "../actions";

type Line = {
  key: string;
  procedureId?: string;
  description: string;
  cupsCode: string;
  quantity: number;
  purpose: string;
  unitPrice: number;
  discountType: DiscountType | "";
  discountValue: number;
  diagnosisMain: string;
  diagnosisRelated: string;
};

type Props = {
  sites: { id: string; name: string; open: boolean }[];
  professionals: Professional[];
  procedures: Procedure[];
  today: string;
  defaultDentistId?: string;
};

const selectClass =
  "h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";
const cellInput = "h-8 w-full min-w-0 rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50";
let nextKey = 0;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Subtotal, descuento y total de una línea (misma regla que el backend). */
function totals(l: Line) {
  const subtotal = round2(l.quantity * l.unitPrice);
  const discount =
    l.discountType === "PERCENT" ? round2((subtotal * l.discountValue) / 100) : l.discountType === "AMOUNT" ? l.discountValue : 0;
  return { subtotal, discount, total: round2(subtotal - discount) };
}

const blankLine = (patch: Partial<Line> = {}): Line => ({
  key: String(nextKey++),
  description: "",
  cupsCode: "",
  quantity: 1,
  purpose: "16",
  unitPrice: 0,
  discountType: "",
  discountValue: 0,
  diagnosisMain: "",
  diagnosisRelated: "",
  ...patch,
});

/** Nuevo ingreso: recibo de venta con detalle de procedimientos o abono a la cuenta del paciente. */
export function IncomeForm({ sites, professionals, procedures, today, defaultDentistId }: Props) {
  const router = useRouter();
  const [kind, setKind] = useState<PaymentKind>("SALE");
  const [incomeDate, setIncomeDate] = useState(today);
  const [patient, setPatient] = useState<PickedPatient | null>(null);
  const [payer, setPayer] = useState<"PATIENT" | "THIRD">("PATIENT");
  const [payerName, setPayerName] = useState("");
  const [payerDocument, setPayerDocument] = useState("");
  const [dentistId, setDentistId] = useState(defaultDentistId ?? "");
  const [siteId, setSiteId] = useState(sites.find((s) => s.open)?.id ?? "");
  const [method, setMethod] = useState<PaymentMethod | "">("");
  const [term, setTerm] = useState<PaymentTerm>("CASH");
  const [reference, setReference] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [concept, setConcept] = useState("");
  const [notes, setNotes] = useState("");
  const [amount, setAmount] = useState("");
  const [cupsOpen, setCupsOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const site = sites.find((s) => s.id === siteId);
  const computed = round2(lines.reduce((sum, l) => sum + totals(l).total, 0));
  const value = kind === "SALE" ? computed : Number(amount) || 0;
  const setLine = (key: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  function addProcedure(id: string) {
    const p = procedures.find((x) => x.id === id);
    if (!p) return;
    setLines((ls) => [...ls, blankLine({ procedureId: p.id, description: p.name, cupsCode: p.cupsCode ?? "", unitPrice: p.price })]);
  }

  function submit() {
    setError(undefined);
    if (!patient) return setError("Elige el paciente");
    if (!method) return setError("Elige el medio de pago");
    startTransition(async () => {
      const result = await registerIncome(patient.id, {
        siteId,
        kind,
        incomeDate,
        method: method as PaymentMethod,
        paymentTerm: term,
        dentistId: dentistId || undefined,
        payerName: payer === "THIRD" ? payerName : undefined,
        payerDocument: payer === "THIRD" ? payerDocument : undefined,
        concept: concept || undefined,
        notes: notes || undefined,
        reference: reference || undefined,
        amount: kind === "ACCOUNT" ? Number(amount) : undefined,
        items:
          kind === "SALE"
            ? lines.map((l) => ({
                procedureId: l.procedureId,
                description: l.description,
                cupsCode: l.cupsCode || undefined,
                quantity: l.quantity,
                purpose: l.purpose || undefined,
                unitPrice: l.unitPrice,
                discountType: l.discountType || undefined,
                discountValue: l.discountType ? l.discountValue : undefined,
                diagnosisMain: l.diagnosisMain || undefined,
                diagnosisRelated: l.diagnosisRelated || undefined,
              }))
            : [],
      });
      if (!result.ok) return setError(result.error);
      router.push(`/app/caja/recibos/${result.data.id}`);
    });
  }

  return (
    <div className="grid gap-6">
      <p
        role="note"
        className={cn(
          "flex items-start gap-2 rounded-lg border px-3 py-2 text-sm",
          kind === "SALE" ? "border-sky-500/40 bg-sky-500/10" : "border-amber-500/40 bg-amber-500/10",
        )}
      >
        <Info className="mt-0.5 size-4 shrink-0" />
        {kind === "SALE" ? (
          <span>
            Este recibo de caja <strong>NO</strong> afectará el estado de cuenta del paciente: los procedimientos se cobran y se pagan en
            este mismo acto.
          </span>
        ) : (
          <span>
            Este abono <strong>SÍ</strong> se descuenta del estado de cuenta del paciente (lo realizado en sus planes de tratamiento).
          </span>
        )}
      </p>

      <Card>
        <CardHeader>
          <CardTitle>Información básica</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="kind">Tipo de ingreso *</Label>
            <select id="kind" value={kind} onChange={(e) => setKind(e.target.value as PaymentKind)} className={selectClass}>
              {Object.entries(PAYMENT_KINDS).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="incomeDate">Fecha *</Label>
            <Input id="incomeDate" type="date" max={today} value={incomeDate} onChange={(e) => setIncomeDate(e.target.value)} />
          </div>
          <div className="grid gap-1.5 sm:col-span-2">
            <Label>Buscar paciente *</Label>
            <PatientPicker value={patient} onChange={setPatient} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="payer">Factura a nombre de</Label>
            <select id="payer" value={payer} onChange={(e) => setPayer(e.target.value as "PATIENT" | "THIRD")} className={selectClass}>
              <option value="PATIENT">Paciente</option>
              <option value="THIRD">Otra persona o empresa</option>
            </select>
          </div>
          {payer === "THIRD" && (
            <div className="grid gap-4 sm:col-span-2 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="payerName">Nombre o razón social *</Label>
                <Input id="payerName" maxLength={200} value={payerName} onChange={(e) => setPayerName(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="payerDocument">Documento o NIT *</Label>
                <Input id="payerDocument" maxLength={40} value={payerDocument} onChange={(e) => setPayerDocument(e.target.value)} />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Información de atención</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="grid gap-1.5">
            <Label htmlFor="dentist">Doctor</Label>
            <select id="dentist" value={dentistId} onChange={(e) => setDentistId(e.target.value)} className={selectClass}>
              <option value="">Seleccionar…</option>
              {professionals.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.fullName}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="site">Sede *</Label>
            <select id="site" value={siteId} onChange={(e) => setSiteId(e.target.value)} className={selectClass}>
              <option value="">Seleccione…</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.open ? "" : " (caja cerrada)"}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="method">Medio de pago *</Label>
            <select id="method" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)} className={selectClass}>
              <option value="">Seleccionar…</option>
              {Object.entries(PAYMENT_METHODS).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="term">Forma de pago</Label>
            <select id="term" value={term} onChange={(e) => setTerm(e.target.value as PaymentTerm)} className={selectClass}>
              {Object.entries(PAYMENT_TERMS).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          {method && method !== "CASH" && (
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="reference">Referencia / autorización</Label>
              <Input id="reference" maxLength={100} value={reference} onChange={(e) => setReference(e.target.value)} />
            </div>
          )}
          {site && !site.open && (
            <p className="text-sm text-destructive sm:col-span-2 lg:col-span-4">
              La caja de {site.name} está cerrada: ábrela en Recaudos para registrar el ingreso.
            </p>
          )}
          {term === "CREDIT" && (
            <p className="text-sm text-muted-foreground sm:col-span-2 lg:col-span-4">
              Para vender a crédito registra la financiación en{" "}
              <Link href="/app/financiamiento" className="text-primary hover:underline">
                Financiamiento
              </Link>
              : allí se definen las cuotas y la cuota inicial se recauda aquí como abono.
            </p>
          )}
        </CardContent>
      </Card>

      {kind === "SALE" && (
        <Card>
          <CardHeader>
            <CardTitle>Procedimientos / Detalle del ingreso</CardTitle>
            <CardDescription>Los datos de CUPS, finalidad y diagnósticos se usan luego para los RIPS.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label="Agregar procedimiento de la lista de precios"
                value=""
                onChange={(e) => addProcedure(e.target.value)}
                className={cn(selectClass, "w-auto min-w-64")}
              >
                <option value="">Agregar procedimientos…</option>
                {procedures.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {formatCOP(p.price)}
                  </option>
                ))}
              </select>
              <Button type="button" variant="outline" size="sm" onClick={() => setCupsOpen(true)}>
                <BookOpen /> Desde CUPS
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setLines((ls) => [...ls, blankLine()])}>
                <Plus /> Línea libre
              </Button>
            </div>

            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[1100px] text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr className="[&>th]:px-2 [&>th]:py-2 [&>th]:text-left [&>th]:font-medium">
                    <th className="w-[22%]">Descripción</th>
                    <th className="w-16">Cant.</th>
                    <th className="w-36">Finalidad</th>
                    <th className="w-28">Precio ($)</th>
                    <th className="w-24 text-right">Subtotal ($)</th>
                    <th className="w-16">Tipo desc</th>
                    <th className="w-24">Desc</th>
                    <th className="w-24 text-right">Total ($)</th>
                    <th className="w-20">Diag. ppal.</th>
                    <th className="w-20">Diag. rel.</th>
                    <th className="w-10">
                      <span className="sr-only">Quitar</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {lines.length === 0 && (
                    <tr>
                      <td colSpan={11} className="px-2 py-6 text-center text-muted-foreground">
                        Agrega procedimientos de la lista de precios, desde el catálogo CUPS o una línea libre.
                      </td>
                    </tr>
                  )}
                  {lines.map((l, i) => {
                    const t = totals(l);
                    return (
                      <tr key={l.key} className="border-t align-top [&>td]:px-2 [&>td]:py-1.5">
                        <td>
                          <input
                            aria-label={`Descripción de la línea ${i + 1}`}
                            className={cellInput}
                            maxLength={200}
                            value={l.description}
                            onChange={(e) => setLine(l.key, { description: e.target.value })}
                          />
                          <input
                            aria-label={`CUPS de la línea ${i + 1}`}
                            placeholder="CUPS"
                            className={cn(cellInput, "mt-1 h-7 text-xs")}
                            maxLength={10}
                            value={l.cupsCode}
                            onChange={(e) => setLine(l.key, { cupsCode: e.target.value })}
                          />
                        </td>
                        <td>
                          <input
                            aria-label={`Cantidad de la línea ${i + 1}`}
                            type="number"
                            min={1}
                            max={999}
                            className={cellInput}
                            value={l.quantity}
                            onChange={(e) => setLine(l.key, { quantity: Math.max(1, Math.trunc(Number(e.target.value) || 1)) })}
                          />
                        </td>
                        <td>
                          <select
                            aria-label={`Finalidad de la línea ${i + 1}`}
                            className={cellInput}
                            value={l.purpose}
                            onChange={(e) => setLine(l.key, { purpose: e.target.value })}
                          >
                            {Object.entries(RIPS_PURPOSES).map(([code, label]) => (
                              <option key={code} value={code}>
                                {code} · {label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <input
                            aria-label={`Precio de la línea ${i + 1}`}
                            type="number"
                            min={0}
                            step="0.01"
                            className={cellInput}
                            value={l.unitPrice}
                            onChange={(e) => setLine(l.key, { unitPrice: Math.max(0, Number(e.target.value) || 0) })}
                          />
                        </td>
                        <td className="pt-3 text-right tabular-nums">{formatCOP(t.subtotal)}</td>
                        <td>
                          <select
                            aria-label={`Tipo de descuento de la línea ${i + 1}`}
                            className={cellInput}
                            value={l.discountType}
                            onChange={(e) => setLine(l.key, { discountType: e.target.value as DiscountType | "", discountValue: 0 })}
                          >
                            <option value="">—</option>
                            {Object.entries(DISCOUNT_TYPES).map(([k, label]) => (
                              <option key={k} value={k}>
                                {label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <input
                            aria-label={`Descuento de la línea ${i + 1}`}
                            type="number"
                            min={0}
                            max={l.discountType === "PERCENT" ? 100 : undefined}
                            step="0.01"
                            disabled={!l.discountType}
                            className={cellInput}
                            value={l.discountValue}
                            onChange={(e) => setLine(l.key, { discountValue: Math.max(0, Number(e.target.value) || 0) })}
                          />
                        </td>
                        <td className={cn("pt-3 text-right font-medium tabular-nums", t.total < 0 && "text-destructive")}>{formatCOP(t.total)}</td>
                        <td>
                          <input
                            aria-label={`Diagnóstico principal de la línea ${i + 1}`}
                            placeholder="K021"
                            className={cn(cellInput, "uppercase")}
                            maxLength={5}
                            value={l.diagnosisMain}
                            onChange={(e) => setLine(l.key, { diagnosisMain: e.target.value })}
                          />
                        </td>
                        <td>
                          <input
                            aria-label={`Diagnóstico relacionado de la línea ${i + 1}`}
                            className={cn(cellInput, "uppercase")}
                            maxLength={5}
                            value={l.diagnosisRelated}
                            onChange={(e) => setLine(l.key, { diagnosisRelated: e.target.value })}
                          />
                        </td>
                        <td>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Quitar la línea ${i + 1}`}
                            onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                          >
                            <Trash2 />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground">Diagnósticos: código CIE-10 (p. ej. K02.1 o K021).</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="grid gap-4 pt-6 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="concept">Concepto</Label>
            <Input id="concept" maxLength={200} value={concept} onChange={(e) => setConcept(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="amount">Valor ($) *</Label>
            <Input
              id="amount"
              type="number"
              min={0}
              step="0.01"
              readOnly={kind === "SALE"}
              value={kind === "SALE" ? computed : amount}
              onChange={(e) => setAmount(e.target.value)}
              className={cn(kind === "SALE" && "bg-muted font-semibold")}
            />
            {kind === "SALE" && <p className="text-xs text-muted-foreground">Total calculado automáticamente a partir de los procedimientos del ingreso.</p>}
          </div>
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="notes">Observaciones</Label>
            <Textarea id="notes" rows={2} maxLength={300} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <FormError message={error} />
      <div className="flex flex-wrap items-center justify-end gap-2">
        <span className="mr-auto text-lg font-semibold tabular-nums">Total: {formatCOP(value)}</span>
        <Link href="/app/caja" className={buttonVariants({ variant: "outline" })}>
          Cancelar
        </Link>
        <Button disabled={pending || value <= 0 || term === "CREDIT"} onClick={submit}>
          <Save /> {pending ? "Registrando…" : "Registrar ingreso"}
        </Button>
      </div>

      {cupsOpen && (
        <CupsDialog
          open
          onOpenChange={setCupsOpen}
          mode="single"
          onPick={(entry) => setLines((ls) => [...ls, blankLine({ description: entry.description.slice(0, 200), cupsCode: entry.code })])}
        />
      )}
    </div>
  );
}
