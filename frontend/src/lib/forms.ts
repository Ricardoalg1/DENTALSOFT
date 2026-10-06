import { ApiError } from "./api";

/** Estado que devuelven las Server Actions de formularios a useActionState. */
export type FormState =
  | {
      error?: string;
      fieldErrors?: Record<string, string[] | undefined>;
      values?: Record<string, string>;
      ok?: boolean;
    }
  | undefined;

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  return "No se pudo conectar con el servidor. Intenta de nuevo.";
}

/** Valores del formulario para volver a llenarlo si hay error (sin contraseñas). */
export function keepValues(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  formData.forEach((v, k) => {
    if (typeof v === "string" && !k.toLowerCase().includes("password") && !k.startsWith("$")) values[k] = v;
  });
  return values;
}
