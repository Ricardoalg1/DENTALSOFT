import "server-only";

/** El registro abierto se apaga en producción: las clínicas las crea el equipo de Occlus desde el panel. */
export const selfRegistrationEnabled = process.env.SELF_REGISTRATION !== "false";
