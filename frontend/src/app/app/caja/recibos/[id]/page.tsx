import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { api, ApiError, getMe } from "@/lib/api";
import { formatCOP, formatDateTime, formatReceipt } from "@/lib/format";
import { PAYMENT_METHODS, type Payment } from "@/lib/types";
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
    <Link href="/app/caja" className="no-print inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Caja</Link>
    <article className="grid gap-5 rounded-xl border p-6 print:border-0 print:p-0">
      <header className="border-b pb-4 text-center"><p className="text-xl font-semibold">{payment.clinicName}</p>{payment.clinicNit && <p className="text-sm">NIT {payment.clinicNit}</p>}<p className="mt-3 text-sm uppercase tracking-wide">Recibo de pago</p><p className="text-lg font-semibold">N.º {formatReceipt(payment.receiptNumber)}</p></header>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm"><dt className="text-muted-foreground">Fecha</dt><dd>{formatDateTime(payment.receivedAt)}</dd><dt className="text-muted-foreground">Paciente</dt><dd>{payment.patient.name}</dd><dt className="text-muted-foreground">Documento</dt><dd>{payment.patientDocument}</dd><dt className="text-muted-foreground">Sede</dt><dd>{payment.site.name}</dd><dt className="text-muted-foreground">Concepto</dt><dd>{payment.plan?.name ?? "Abono a cuenta"}</dd><dt className="text-muted-foreground">Medio de pago</dt><dd>{PAYMENT_METHODS[payment.method]}</dd>{payment.reference && <><dt className="text-muted-foreground">Referencia</dt><dd>{payment.reference}</dd></>}<dt className="text-muted-foreground">Recibió</dt><dd>{payment.receivedBy?.name ?? "—"}</dd></dl>
      <div className="flex justify-between border-t pt-4 text-lg font-semibold"><span>Total recibido</span><span>{formatCOP(payment.amount)}</span></div>
      {payment.notes && <p className="text-sm">Nota: {payment.notes}</p>}
      {payment.voidedAt && <p className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm font-medium text-destructive">ANULADO · {payment.voidReason} · {formatDateTime(payment.voidedAt)}</p>}
      <p className="text-center text-xs text-muted-foreground">Comprobante interno de pago. No es factura electrónica.</p>
    </article>
    <div className="no-print flex flex-wrap gap-2"><PrintButton />{me.role === "ADMIN" && !payment.voidedAt && <VoidPayment paymentId={payment.id} />}</div>
  </div>;
}
