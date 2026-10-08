import type { APIRoute } from "astro";
import { env } from "../../lib/server";
export const GET: APIRoute = () =>
  Response.json(
    { analyticsEnabled: env("SITE_ANALYTICS_ENABLED") === "true" },
    { headers: { "Cache-Control": "no-store" } },
  );
