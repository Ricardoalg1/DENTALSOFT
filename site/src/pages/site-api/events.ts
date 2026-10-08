import type { APIRoute } from "astro";
import { env, apiUrl, publicPages, validOrigin } from "../../lib/server";
export const POST: APIRoute = async ({ request, url }) => {
  if (!validOrigin(request, url)) return new Response(null, { status: 403 });
  if (env("SITE_ANALYTICS_ENABLED") !== "true")
    return new Response(null, { status: 204 });
  try {
    const text = await request.text();
    if (text.length > 512) return new Response(null, { status: 413 });
    const body = JSON.parse(text);
    if (!publicPages.has(body.path)) return new Response(null, { status: 400 });
    const key = env("SITE_PUBLIC_API_KEY");
    if (key.length < 32) return new Response(null, { status: 503 });
    const res = await fetch(`${apiUrl()}/api/public/site-events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Occlus-Public-Key": key,
      },
      body: JSON.stringify({ path: body.path }),
      signal: AbortSignal.timeout(3000),
    });
    return new Response(null, { status: res.ok ? 204 : 503 });
  } catch {
    return new Response(null, { status: 400 });
  }
};
