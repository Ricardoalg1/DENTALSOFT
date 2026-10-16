"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { api } from "@/lib/api";
import { AGREEMENT_VERSION } from "@/lib/agreement";
import { errorMessage, type FormState } from "@/lib/forms";

/** Registra la aceptación del acuerdo con su evidencia (versión, dirección IP y navegador). */
export async function acceptAgreement(_: FormState, formData: FormData): Promise<FormState> {
  if (formData.get("accept") !== "on") return { error: "Marca la casilla para aceptar el acuerdo." };
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim().slice(0, 64);
  try {
    await api("/api/agreement/accept", {
      method: "POST",
      body: JSON.stringify({ version: AGREEMENT_VERSION, ip, userAgent: (h.get("user-agent") ?? "").slice(0, 300) }),
    });
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath("/app", "layout");
  redirect("/app");
}
