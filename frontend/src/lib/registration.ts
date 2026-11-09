import "server-only";
import { connection } from "next/server";

/**
 * El registro abierto se apaga en producción: las clínicas las crea el equipo de Occlus desde el panel.
 * Se lee en cada petición (connection): si se leyera al compilar, la página quedaría prerenderizada con el
 * formulario aunque el servidor tenga SELF_REGISTRATION=false.
 */
export async function isSelfRegistrationEnabled() {
  await connection();
  return process.env.SELF_REGISTRATION !== "false";
}
