import "server-only";
import { notFound } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import type { Patient } from "@/lib/types";

/** Carga un paciente; 404 del backend (inexistente o de otra clínica) → página 404. */
export async function loadPatient(id: string) {
  try {
    return await api<Patient>(`/api/patients/${encodeURIComponent(id)}`);
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 400)) notFound();
    throw e;
  }
}
