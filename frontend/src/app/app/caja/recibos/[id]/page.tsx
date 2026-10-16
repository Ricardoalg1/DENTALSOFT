import { ClinicDocumentHeader } from "@/components/app/document-identity";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { api, ApiError, getMe } from "@/lib/api";
import { formatCOP, formatDate, formatDateTime, formatReceipt } from "@/lib/format";
import { PAYMENT_KINDS, PAYMENT_METHODS, PAYMENT_TERMS, RIPS_PURPOSES, type Payment } from "@/lib/types";
import { VoidPayment } from "./void-payment";
import { PrintButton } from "../../print-button";

export const metadata: Metadata = { title: "Recibo de pago" };

export default async function ReceiptPage({ params }: PageProps<"/app/caja/recibos/[id]">) {
  const { id } = await params;
  const me = await getMe();
  let payment: Payment;
  try { payment = await api<Payment>(`/api/payments/${encodeURIComponent(id)}`); }
  catch (e) { if (e instanceof ApiError && (e.status === 404 || e.status === 400)) notFound(); throw e; }
  return <div className="mx-auto grid max-w-2xl gap-5">
    <Link href="/app/caja" className="no-print inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Recaudos</Link>
    <ClinicDocumentHeader />
    <article className="clinical-paper grid gap-5 rounded-xl border p-6 print:border-0 print:p-0">
      <header className="border-b pb-4 text-center"><p className="text-sm uppercase tracking-wide">{payment.kind === "SALE" ? "Recibo de caja" : "Recibo de abono"}</p><p className="text-lg font-semibold">N.º {formatReceipt(payment.receiptNumber)}</p></header>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm"><dt className="text-muted-foreground">Fecha</dt><dd>{formatDate(payment.incomeDate)} <span className="text-muted-foreground">(registrado {formatDateTime(payment.receivedAt)})</span></dd><dt className="text-muted-foreground">Paciente</dt><dd>{payment.patient.name}</dd><dt className="text-muted-foreground">Documento</dt><dd>{payment.patientDocument}</dd>{payment.payerName && <><dt className="text-muted-foreground">A nombre de</dt><dd>{payment.payerName} · {payment.payerDocument}</dd></>}<dt className="text-muted-foreground">Sede</dt><dd>{payment.site.name}</dd>{payment.dentist && <><dt className="text-muted-foreground">Doctor</dt><dd>{payment.dentist.name}</dd></>}<dt className="text-muted-foreground">Tipo</dt><dd>{PAYMENT_KINDS[payment.kind]} · {PAYMENT_TERMS[payment.paymentTerm]}</dd><dt className="text-muted-foreground">Concepto</dt><dd>{payment.concept ?? payment.plan?.name ?? (payment.kind === "SALE" ? "Procedimientos" : "Abono a cuenta")}</dd><dt className="text-muted-foreground">Medio de pago</dt><dd>{PAYMENT_METHODS[payment.method]}</dd>{payment.reference && <><dt className="text-muted-foreground">Referencia</dt><dd>{payment.reference}</dd></>}<dt className="text-muted-foreground">Recibió</dt><dd>{payment.receivedBy?.name ?? "—"}</dd></dl>
      {payment.items.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b text-xs text-muted-foreground">
              <tr className="[&>th]:py-1.5 [&>th]:text-left [&>th]:font-medium">
                <th>Descripción</th><th className="text-right">Cant.</th><th className="text-right">Precio</th><th className="text-right">Desc.</th><th className="text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {payment.items.map((i) => (
                <tr key={i.position} className="border-b align-top [&>td]:py-1.5">
                  <td>
                    {i.description}
                    <span className="block text-xs text-muted-foreground">
                      {[i.cupsCode && `CUPS ${i.cupsCode}`, i.purpose && `Finalidad ${i.purpose}${i.purpose in RIPS_PURPOSES ? ` (${RIPS_PURPOSES[i.purpose as keyof typeof RIPS_PURPOSES].toLowerCase()})` : ""}`, i.diagnosisMain && `Dx ${i.diagnosisMain}`, i.diagnosisRelated && `Dx rel. ${i.diagnosisRelated}`].filter(Boolean).join(" · ")}
                    </span>
                  </td>
                  <td className="text-right tabular-nums">{i.quantity}</td>
                  <td className="text-right tabular-nums">{formatCOP(i.unitPrice)}</td>
                  <td className="text-right tabular-nums">{i.discount ? formatCOP(i.discount) : "—"}</td>
                  <td className="text-right tabular-nums">{formatCOP(i.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex justify-between border-t pt-4 text-lg font-semibold"><span>Total recibido</span><span>{formatCOP(payment.amount)}</span></div>
      {payment.notes && <p className="text-sm">Nota: {payment.notes}</p>}
      {payment.voidedAt && <p className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm font-medium text-destructive">ANULADO · {payment.voidReason} · {formatDateTime(payment.voidedAt)}</p>}
      <p className="text-center text-xs text-muted-foreground">Comprobante interno de pago. No es factura electrónica.</p>
    </article>
    <div className="no-print flex flex-wrap gap-2"><PrintButton />{me.role === "ADMIN" && !payment.voidedAt && <VoidPayment paymentId={payment.id} />}</div>
  </div>;
}
