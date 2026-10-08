import type { APIRoute } from "astro";
// Liveness del sitio: la portada no depende de que la API de clínicas esté activa.
export const GET: APIRoute = () =>
  Response.json({ status: "UP" }, { headers: { "Cache-Control": "no-store" } });
