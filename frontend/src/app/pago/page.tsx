import type { Metadata } from "next";
import { Logo } from "@/components/logo";
import { PaymentResult } from "./payment-result";

export const metadata: Metadata = { title: "Resultado del pago", robots: { index: false, follow: false } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v.slice(0, 120) : undefined);

/**
 * Aquí vuelve la persona desde la pasarela. Wompi agrega ?id=<transacción>; ePayco, ?ref_payco=<referencia>.
 * Esos datos solo sirven para preguntar a la pasarela: el resultado lo decide la consulta, no la URL.
 */
export default async function PaymentReturnPage({ searchParams }: PageProps<"/pago">) {
  const sp = await searchParams;
  const checkout = one(sp.c);
  return (
    <main className="grid min-h-svh place-items-center p-4">
      <div className="grid w-full max-w-md gap-6 rounded-2xl border bg-card p-8">
        <Logo />
        {checkout && UUID.test(checkout) ? (
          <PaymentResult checkoutId={checkout} providerRef={one(sp.id) ?? one(sp.ref_payco)} />
        ) : (
          <p className="text-sm text-muted-foreground">No encontramos el pago. Si ya pagaste, tu suscripción se actualizará sola en unos minutos.</p>
        )}
      </div>
    </main>
  );
}
