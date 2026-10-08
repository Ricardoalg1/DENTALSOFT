import type { APIRoute } from "astro";
import { articles } from "../../../shared/site-content";
export const prerender = true;
export const GET: APIRoute = ({ site }) => {
  const paths = [
    "/",
    "/planes",
    "/demo",
    "/blog",
    "/privacidad",
    "/condiciones",
    ...articles.map((a) => `/blog/${a.slug}`),
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map((path) => `<url><loc>${new URL(path, site ?? "https://occlus.lat").href.replaceAll("&", "&amp;")}</loc></url>`).join("")}</urlset>`;
  return new Response(xml, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
};
