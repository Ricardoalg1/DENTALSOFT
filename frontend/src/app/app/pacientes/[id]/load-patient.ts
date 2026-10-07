import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import type { Patient } from "@/lib/types";

/**
 * Carga un paciente; 404 del backend (inexistente o de otra clínica) → página 404.
 * `cache`: el layout y la página lo piden en el mismo render y solo se llama una vez al backend.
 */
export const loadPatient = cache(async (id: string) => {
  try {
    return await api<Patient>(`/api/patients/${encodeURIComponent(id)}`);
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 400)) notFound();
    throw e;
  }
});
