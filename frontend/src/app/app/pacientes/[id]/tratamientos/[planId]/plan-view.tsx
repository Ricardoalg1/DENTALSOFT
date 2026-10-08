"use client";

import { useState, useTransition } from "react";
import { Check, Lightbulb, Printer, RotateCcw, Trash2, X } from "lucide-react";
import { FormError } from "@/components/form-error";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCOP } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  ITEM_STATUS,
  ODONTOGRAM_CONDITIONS,
  type Procedure,
  type TreatmentItem,
  type TreatmentPlan,
  type TreatmentSuggestion,
} from "@/lib/types";
import { addPlanItems, changePlanStatus, removePlanItem, setItemStatus, type ActionResult } from "../actions";

type Props = {
  patientId: string;
  plan: TreatmentPlan;
  procedures: Procedure[];
  suggestions: TreatmentSuggestion[];
  /** Profesional activo: edita el presupuesto y marca lo realizado. */
  professional: boolean;
  isAdmin: boolean;
};

export function PlanView({ patientId, plan, procedures, suggestions, professional, isAdmin }: Props) {
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const draft = plan.status === "DRAFT";
  const accepted = plan.status === "ACCEPTED";

  /** Ejecuta una acción del servidor y muestra su error, si lo hay. */
  function act(fn: () => Promise<ActionResult<unknown>>, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    setError(undefined);
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <div className="grid gap-6">
      <FormError message={error} />

      <Card>
        <CardContent className="overflow-x-auto">
          {plan.items.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">Agrega procedimientos al presupuesto.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Procedimiento</TableHead>
                  <TableHead>Diente</TableHead>
                  <TableHead className="text-right">Cant.</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="text-right">Desc.</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="no-print" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {plan.items.map((item) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    pending={pending}
                    canRemove={draft && professional}
                    canProgress={accepted && professional}
                    canReopen={(accepted || plan.status === "COMPLETED") && professional}
                    onRemove={() => act(() => removePlanItem(patientId, plan.id, item.id))}
                    onStatus={(s) => act(() => setItemStatus(patientId, plan.id, item.id, s))}
                  />
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={5} className="text-right">
                    Total
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{formatCOP(plan.totals.total)}</TableCell>
                  <TableCell colSpan={2} className="text-xs text-muted-foreground">
                    Realizado {formatCOP(plan.totals.done)}
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          )}
        </CardContent>
      </Card>

      {draft && professional && suggestions.length > 0 && (
        <Suggestions suggestions={suggestions} pending={pending} onAdd={(items) => act(() => addPlanItems(patientId, plan.id, items))} />
      )}

      {draft && professional && (
        <AddItemForm procedures={procedures} pending={pending} onAdd={(item) => act(() => addPlanItems(patientId, plan.id, [item]))} />
      )}

      <div className="no-print flex flex-wrap gap-2">
        {draft && (
          <>
            <Button
              disabled={pending || plan.items.length === 0}
              onClick={() =>
                act(
                  () => changePlanStatus(patientId, plan.id, "accept"),
                  "¿El paciente aceptó el presupuesto? Después no se podrán cambiar los precios.",
                )
              }
            >
              <Check /> Paciente aceptó
            </Button>
            <Button variant="outline" disabled={pending} onClick={() => act(() => changePlanStatus(patientId, plan.id, "reject"))}>
              <X /> Paciente no aceptó
            </Button>
          </>
        )}
        {accepted && (professional || isAdmin) && (
          <Button
            variant="destructive"
            disabled={pending}
            onClick={() =>
              act(
                () => changePlanStatus(patientId, plan.id, "cancel"),
                "¿Cancelar el plan? Los procedimientos pendientes quedarán cancelados.",
              )
            }
          >
            Cancelar plan
          </Button>
        )}
        <Button variant="outline" onClick={() => window.print()}>
          <Printer /> Imprimir presupuesto
        </Button>
      </div>
    </div>
  );
}

function ItemRow({
  item,
  pending,
  canRemove,
  canProgress,
  canReopen,
  onRemove,
  onStatus,
}: {
  item: TreatmentItem;
  pending: boolean;
  canRemove: boolean;
  canProgress: boolean;
  canReopen: boolean;
  onRemove: () => void;
  onStatus: (s: "PENDING" | "DONE" | "CANCELLED") => void;
}) {
  const cancelled = item.status === "CANCELLED";
  return (
    <TableRow className={cn(cancelled && "text-muted-foreground line-through")}>
      <TableCell className="whitespace-normal">
        {item.description}
        {item.cupsCode && <span className="block text-xs text-muted-foreground">CUPS {item.cupsCode}</span>}
      </TableCell>
      <TableCell className="tabular-nums">
        {item.tooth ?? "—"}
        {item.surfaces && <span className="text-muted-foreground"> {item.surfaces}</span>}
      </TableCell>
      <TableCell className="text-right tabular-nums">{item.quantity}</TableCell>
      <TableCell className="text-right tabular-nums">{formatCOP(item.unitPrice)}</TableCell>
      <TableCell className="text-right tabular-nums">{item.discount > 0 ? formatCOP(item.discount) : "—"}</TableCell>
      <TableCell className="text-right tabular-nums">{formatCOP(item.total)}</TableCell>
      <TableCell>
        <span className={cn("text-xs", item.status === "DONE" && "font-medium text-primary")}>{ITEM_STATUS[item.status]}</span>
        {item.doneBy && <span className="block text-xs text-muted-foreground">{item.doneBy.name}</span>}
      </TableCell>
      <TableCell className="no-print text-right whitespace-nowrap">
        {canRemove && (
          <Button variant="ghost" size="icon-sm" aria-label={`Quitar ${item.description}`} disabled={pending} onClick={onRemove}>
            <Trash2 />
          </Button>
        )}
        {canProgress && item.status === "PENDING" && (
          <>
            <Button variant="ghost" size="sm" disabled={pending} onClick={() => onStatus("DONE")}>
              <Check /> Realizado
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Cancelar ${item.description}`}
              disabled={pending}
              onClick={() => onStatus("CANCELLED")}
            >
              <X />
            </Button>
          </>
        )}
        {canReopen && item.status !== "PENDING" && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Volver a pendiente ${item.description}`}
            title="Volver a pendiente"
            disabled={pending}
            onClick={() => onStatus("PENDING")}
          >
            <RotateCcw />
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}

type NewItem = { procedureId: string; tooth?: number; surfaces?: string; quantity?: number; discount?: number };

function Suggestions({
  suggestions,
  pending,
  onAdd,
}: {
  suggestions: TreatmentSuggestion[];
  pending: boolean;
  onAdd: (items: NewItem[]) => void;
}) {
  const key = (s: TreatmentSuggestion) => `${s.procedureId}-${s.tooth}`;
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(suggestions.map(key)));
  return (
    <Card className="no-print">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Lightbulb className="size-4 text-primary" /> Sugerencias del odontograma
        </CardTitle>
        <CardDescription>Hallazgos sin tratamiento presupuestado. Marca los que quieras agregar.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <ul className="grid gap-1.5 text-sm">
          {suggestions.map((s) => (
            <li key={key(s)}>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={chosen.has(key(s))}
                  onChange={(e) => {
                    const next = new Set(chosen);
                    if (e.target.checked) next.add(key(s));
                    else next.delete(key(s));
                    setChosen(next);
                  }}
                />
                <span>
                  <strong className="tabular-nums">Diente {s.tooth}</strong>
                  {s.surfaces && ` (${s.surfaces})`} · {ODONTOGRAM_CONDITIONS[s.condition].label.toLowerCase()} →{" "}
                  {s.procedureName} <span className="text-muted-foreground tabular-nums">{formatCOP(s.price)}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
        <Button
          variant="secondary"
          className="w-fit"
          disabled={pending || chosen.size === 0}
          onClick={() =>
            onAdd(
              suggestions
                .filter((s) => chosen.has(key(s)))
                .map((s) => ({ procedureId: s.procedureId, tooth: s.tooth, surfaces: s.surfaces ?? undefined })),
            )
          }
        >
          Agregar {chosen.size} al presupuesto
        </Button>
      </CardContent>
    </Card>
  );
}

function AddItemForm({ procedures, pending, onAdd }: { procedures: Procedure[]; pending: boolean; onAdd: (item: NewItem) => void }) {
  const [procedureId, setProcedureId] = useState(procedures[0]?.id ?? "");
  const procedure = procedures.find((p) => p.id === procedureId);

  if (procedures.length === 0) {
    return <p className="text-sm text-muted-foreground">La lista de precios está vacía: un administrador debe cargarla en Lista de precios.</p>;
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const num = (name: string) => {
      const v = String(form.get(name) ?? "").trim();
      return v ? Number(v) : undefined;
    };
    onAdd({
      procedureId,
      tooth: procedure?.perTooth ? num("tooth") : undefined,
      surfaces: procedure?.perTooth ? String(form.get("surfaces") ?? "").toUpperCase() || undefined : undefined,
      quantity: num("quantity"),
      discount: num("discount"),
    });
  }

  return (
    <Card className="no-print">
      <CardHeader>
        <CardTitle>Agregar procedimiento</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="grid gap-3">
          <NativeSelect
            name="procedureId"
            id="item-procedure"
            label="Procedimiento"
            options={Object.fromEntries(procedures.map((p) => [p.id, `${p.name} · ${formatCOP(p.price)}`]))}
            value={procedureId}
            onChange={(e) => setProcedureId(e.target.value)}
          />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {procedure?.perTooth && (
              <>
                <div className="grid gap-1.5">
                  <Label htmlFor="item-tooth">Diente (FDI)</Label>
                  <Input id="item-tooth" name="tooth" required inputMode="numeric" maxLength={2} placeholder="36" />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="item-surfaces">Superficies</Label>
                  <Input id="item-surfaces" name="surfaces" maxLength={5} placeholder="OM" className="uppercase" />
                </div>
              </>
            )}
            <div className="grid gap-1.5">
              <Label htmlFor="item-qty">Cantidad</Label>
              <Input id="item-qty" name="quantity" type="number" min="1" max="99" step="1" defaultValue="1" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="item-discount">Descuento (COP)</Label>
              <Input id="item-discount" name="discount" type="number" min="0" step="0.01" placeholder="0" />
            </div>
          </div>
          <Button type="submit" disabled={pending} className="w-fit">
            Agregar
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
