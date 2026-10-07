"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/forms";

export type ActionResult = { ok: true } | { ok: false; error: string };

const templateSchema = z.object({
  title: z.string().trim().min(3, "Escribe un título").max(150),
  body: z.string().trim().min(20, "El texto es muy corto").max(20000),
  active: z.boolean(),
});

/** Crea (id = null) o edita una plantilla de consentimiento. */
export async function saveTemplate(id: string | null, input: z.input<typeof templateSchema>): Promise<ActionResult> {
  const parsed = templateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  try {
    await api(id ? `/api/consent-templates/${id}` : "/api/consent-templates", {
      method: id ? "PUT" : "POST",
      body: JSON.stringify(parsed.data),
    });
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
  revalidatePath("/app/historias/plantillas");
  return { ok: true };
}

export async function loadExampleTemplates(): Promise<ActionResult> {
  try {
    await api("/api/consent-templates/examples", { method: "POST" });
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
  revalidatePath("/app/historias/plantillas");
  return { ok: true };
}
