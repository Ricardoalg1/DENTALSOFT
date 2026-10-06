"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { api } from "@/lib/api";
import { errorMessage, keepValues, type FormState } from "@/lib/forms";

const createUserSchema = z.object({
  fullName: z.string().trim().min(2, "Nombre requerido").max(150),
  email: z.email("Correo inválido"),
  role: z.enum(["ADMIN", "DENTIST", "RECEPTION", "ASSISTANT"], "Selecciona un rol"),
  password: z.string().min(8, "Mínimo 8 caracteres").max(72),
});

export async function createUser(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = createUserSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { fieldErrors: z.flattenError(parsed.error).fieldErrors, values: keepValues(formData) };
  }
  try {
    await api("/api/users", { method: "POST", body: JSON.stringify(parsed.data) });
  } catch (e) {
    return { error: errorMessage(e), values: keepValues(formData) };
  }
  revalidatePath("/app/equipo");
  return { ok: true };
}

export async function setUserActive(userId: string, active: boolean) {
  await api(`/api/users/${userId}`, { method: "PATCH", body: JSON.stringify({ active }) });
  revalidatePath("/app/equipo");
}
