"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/forms";

export type IssueResult = { ok: true; id: string } | { ok: false; error: string };

const schema = z.object({
  kind: z.enum(["DISABILITY", "REFERRAL", "ORDER", "CERTIFICATE"]),
  title: z.string().trim().min(2, "Escribe un título").max(150, "El título admite máximo 150 caracteres"),
  body: z.string().trim().min(2, "El documento no puede estar vacío").max(10000, "El texto es demasiado largo"),
});

/** Emite el documento firmado por el profesional que lo crea. Después no se puede editar. */
export async function issueDocument(patientId: string, input: z.input<typeof schema>): Promise<IssueResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  try {
    const doc = await api<{ id: string }>(`/api/patients/${z.uuid().parse(patientId)}/issued-documents`, {
      method: "POST",
      body: JSON.stringify(parsed.data),
    });
    revalidatePath(`/app/pacientes/${patientId}/documentos`);
    return { ok: true, id: doc.id };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}
