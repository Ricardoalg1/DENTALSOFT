import type { APIRoute } from "astro";
export const prerender = true;
export const GET: APIRoute = ({ site }) =>
  new Response(
    `User-agent: *
Allow: /
Disallow: /app
Disallow: /bff
Disallow: /site-api
Disallow: /ingresar
Disallow: /registro
Disallow: /salir
Disallow: /demo-recibida
Sitemap: ${new URL("/sitemap.xml", site ?? "https://occlus.lat").href}
`,
    { headers: { "Content-Type": "text/plain; charset=utf-8" } },
  );
