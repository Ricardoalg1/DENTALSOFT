"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { api } from "@/lib/api";
import { errorMessage, keepValues, type FormState } from "@/lib/forms";

const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((s) => s || undefined);

const siteSchema = z.object({
  name: z.string().trim().min(2, "Nombre requerido").max(120),
  address: optional(200),
  city: optional(80),
  phone: optional(30),
});

export async function createSite(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = siteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { fieldErrors: z.flattenError(parsed.error).fieldErrors, values: keepValues(formData) };
  }
  try {
    await api("/api/sites", { method: "POST", body: JSON.stringify(parsed.data) });
  } catch (e) {
    return { error: errorMessage(e), values: keepValues(formData) };
  }
  revalidatePath("/app/sedes");
  return { ok: true };
}
