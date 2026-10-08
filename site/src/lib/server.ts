// Importar exclusivamente desde frontmatter, middleware o endpoints de servidor.
export const env = (name: string): string =>
  process.env[name] ?? import.meta.env[name] ?? "";
export const apiUrl = () => env("API_URL") || "http://localhost:8080";
export const publicPages = new Set([
  "/",
  "/planes",
  "/demo",
  "/blog",
  "/privacidad",
  "/condiciones",
  "/blog/organizar-agenda-clinica",
  "/blog/control-insumos-odontologia",
  "/blog/seguimiento-presupuestos",
]);
export const configuredContact = () =>
  !!env("SITE_CONTACT_EMAIL") && !!env("SITE_OWNER_NAME");
export async function submitDemo(data: unknown) {
  const key = env("SITE_PUBLIC_API_KEY");
  if (key.length < 32)
    return {
      ok: false,
      error: "El formulario todavía no está habilitado. Intenta más tarde.",
    };
  if (process.env.NODE_ENV === "production" && !configuredContact())
    return {
      ok: false,
      error:
        "Estamos preparando nuestro canal de contacto. Vuelve a intentarlo más tarde.",
    };
  try {
    const res = await fetch(`${apiUrl()}/api/public/demo-requests`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Occlus-Public-Key": key,
      },
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok)
      return {
        ok: false,
        error:
          res.status === 429
            ? "Hay muchas solicitudes. Intenta más tarde."
            : "No pudimos guardar tu solicitud. Intenta nuevamente.",
      };
    return { ok: true, error: "" };
  } catch {
    return {
      ok: false,
      error:
        "No pudimos confirmar tu solicitud. Intenta nuevamente; evitamos duplicados por correo.",
    };
  }
}

export const validOrigin = (request: Request, url: URL) => {
  const expected =
    process.env.NODE_ENV === "production" && env("SITE_URL")
      ? new URL(env("SITE_URL")).origin
      : url.origin;
  return request.headers.get("origin") === expected;
};
