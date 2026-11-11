"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { api, ApiError } from "@/lib/api";

export async function setBirthdayEmails(enabled: boolean) {
  try {
    await api("/api/outreach/birthday-emails", { method: "PUT", body: JSON.stringify({ enabled }) });
  } catch (e) {
    if (e instanceof ApiError && e.status === 409) redirect("/app/seguimiento?correo=sin-configurar");
    throw e;
  }
  revalidatePath("/app/seguimiento");
}
