import catalog from "./catalog.json";
import type { ProcedureCategory } from "@/lib/types";

export type CupsEntry = { code: string; description: string; category: string };
export const CUPS: CupsEntry[] = catalog;
export const CUPS_SOURCE = "https://www.minsalud.gov.co/sites/rid/Lists/BibliotecaDigital/RIDE/DE/DIJ/resolucion-2706-de-2025.zip";
export const CUPS_CATEGORIES = [...new Set(CUPS.map((entry) => entry.category))];
export const normalizeCupsSearch = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
export function searchCups(query: string, category = "Todos") {
  const terms = normalizeCupsSearch(query.replace(/\./g, "")).trim().split(/\s+/).filter(Boolean);
  return CUPS.filter((entry) => (category === "Todos" || entry.category === category) && terms.every((term) => normalizeCupsSearch(`${entry.code} ${entry.description} ${entry.category}`).includes(term)));
}
export const CUPS_PROCEDURE_CATEGORY: Record<string, ProcedureCategory> = {
  Consulta: "DIAGNOSIS", Diagnóstica: "DIAGNOSIS", Preventiva: "PREVENTION",
  "Cirugía oral": "SURGERY", Restauradora: "RESTORATIVE", Rehabilitación: "PROSTHODONTICS",
  Endodoncia: "ENDODONTICS", Periodoncia: "PERIODONTICS", Ortodoncia: "ORTHODONTICS", "Educación en salud": "OTHER",
};
