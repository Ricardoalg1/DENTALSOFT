import { bffGet } from "@/lib/bff";

/** Mensajes del equipo de Occlus para la campanita (consulta periódica desde el navegador). */
export function GET() {
  return bffGet("/api/announcements");
}
