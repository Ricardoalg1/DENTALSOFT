"use server";
import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { api } from "@/lib/api";
export async function updateLead(
  _state: { ok?: boolean; error?: string },
  data: FormData,
): Promise<{ ok?: boolean; error?: string }> {
  const parsed = z
    .object({
      id: z.uuid(),
      status: z.enum(["NEW", "CONTACTED", "DEMO_SCHEDULED", "WON", "LOST"]),
      note: z.string().trim().min(3).max(1000),
      followUpOn: z
        .union([z.iso.date(), z.literal("")])
        .transform((v) => v || null),
    })
    .safeParse(Object.fromEntries(data));
  if (!parsed.success)
    return {
      error:
        "Selecciona un estado y describe la gestión (3 a 1.000 caracteres).",
    };
  try {
    const { id, ...body } = parsed.data;
    await api<void>(`/api/marketing/leads/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
    revalidatePath("/app/comercial");
    return { ok: true };
  } catch (e) {
    unstable_rethrow(e);
    return {
      error:
        "No pudimos guardar la gestión. Revisa tu acceso e intenta de nuevo.",
    };
  }
}

export async function eraseLead(
  _state: { error?: string },
  data: FormData,
): Promise<{ error?: string }> {
  const parsed = z
    .object({
      id: z.uuid(),
      confirmation: z.literal("ELIMINAR"),
      verified: z.literal("on"),
    })
    .safeParse(Object.fromEntries(data));
  if (!parsed.success)
    return { error: "Verifica la petición y escribe ELIMINAR para confirmar." };
  try {
    await api<void>(`/api/marketing/leads/${parsed.data.id}`, {
      method: "DELETE",
      body: JSON.stringify({ confirmed: true }),
    });
  } catch (e) {
    unstable_rethrow(e);
    return {
      error:
        "No pudimos eliminar la solicitud. Revisa el acceso e intenta nuevamente.",
    };
  }
  revalidatePath("/app/comercial");
  redirect("/app/comercial?erased=1");
}
