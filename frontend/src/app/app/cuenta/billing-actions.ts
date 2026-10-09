"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/forms";
import type { CheckoutResult, CheckoutStarted, WompiSetup } from "@/lib/platform";

type Outcome<T> = { data: T; error?: undefined } | { data?: undefined; error: string };

async function run<T>(fn: () => Promise<T>): Promise<Outcome<T>> {
  try {
    return { data: await fn() };
  } catch (e) {
    unstable_rethrow(e);
    return { error: errorMessage(e) };
  }
}

const provider = z.enum(["WOMPI", "EPAYCO"]);

/** Crea el intento de pago y devuelve a dónde enviar a la persona. Solo el administrador de la clínica puede. */
export async function startCheckout(p: string) {
  const parsed = provider.safeParse(p);
  if (!parsed.success) return { error: "Forma de pago no disponible" } as Outcome<CheckoutStarted>;
  return run(() => api<CheckoutStarted>("/api/subscription/checkout", { method: "POST", body: JSON.stringify({ provider: parsed.data }) }));
}

/** Pregunta a la pasarela (a través de nuestro backend) cómo quedó un pago. */
export async function refreshCheckout(id: string, providerRef?: string) {
  const parsedId = z.uuid().safeParse(id);
  if (!parsedId.success) return { error: "Pago no encontrado" } as Outcome<CheckoutResult>;
  const out = await run(() =>
    api<CheckoutResult>(`/api/subscription/checkout/${parsedId.data}/refresh`, {
      method: "POST",
      body: JSON.stringify({ providerRef: providerRef?.slice(0, 120) }),
    }),
  );
  if (out.data?.status === "APPROVED") revalidatePath("/app", "layout");
  return out;
}

export async function getWompiSetup() {
  return run(() => api<WompiSetup>("/api/subscription/wompi/setup"));
}

const cardSchema = z.object({
  cardToken: z.string().min(3).max(200),
  acceptanceToken: z.string().min(3).max(4000),
  personalAuthToken: z.string().min(3).max(4000),
  label: z.string().min(2).max(40),
});

/** Recibe SOLO el token que el navegador obtuvo directamente de Wompi: nunca datos de tarjeta. */
export async function saveCard(input: z.infer<typeof cardSchema>) {
  const parsed = cardSchema.safeParse(input);
  if (!parsed.success) return { error: "Datos de la tarjeta incompletos" } as Outcome<null>;
  const out = await run(() => api<void>("/api/subscription/payment-method", { method: "PUT", body: JSON.stringify(parsed.data) }));
  revalidatePath("/app/cuenta");
  return out.error ? { error: out.error } : ({ data: null } as Outcome<null>);
}

export async function removeCard() {
  await api("/api/subscription/payment-method", { method: "DELETE" });
  revalidatePath("/app/cuenta");
}

// ---------- Sesiones ----------

export async function revokeSession(id: string) {
  await api(`/api/auth/sessions/${z.uuid().parse(id)}`, { method: "DELETE" });
  revalidatePath("/app/cuenta");
}

export async function revokeOtherSessions() {
  await api("/api/auth/sessions/revoke-others", { method: "POST" });
  revalidatePath("/app/cuenta");
}
