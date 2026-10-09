import "server-only";
import { redirect } from "next/navigation";
import { getMe } from "./api";
import { hasModule, type ModuleKey } from "./types";

/**
 * Si la clínica no tiene el módulo, lleva a la pantalla que lo explica. Es solo comodidad de
 * navegación: lo que de verdad impide el acceso es el backend (403 MODULE_DISABLED).
 */
export async function requireModule(module: ModuleKey) {
  const me = await getMe();
  if (!hasModule(me, module)) redirect(`/app/modulo?m=${module}`);
  return me;
}

/** Solo el equipo de Occlus. El backend vuelve a comprobarlo en cada llamada a /api/platform. */
export async function requirePlatform() {
  const me = await getMe();
  if (!me.platformAdmin) redirect("/app");
  return me;
}
