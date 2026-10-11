import type { APIRoute } from "astro";
import { z } from "zod";
import { submitDemo, validOrigin } from "../../lib/server";
export const prerender = false;

const schema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().max(160).pipe(z.email()),
  phone: z.string().trim().max(30),
  clinicName: z.string().trim().min(2).max(150),
  teamSize: z.enum(["SOLO", "TWO_TO_FIVE", "SIX_TO_FIFTEEN", "MORE"]),
  plan: z.enum(["ESTANDAR", "CRECIMIENTO", "EXPANSION", "INTERNACIONAL", "UNDECIDED"]),
  message: z.string().trim().max(800),
});

// Recibe los datos que Occlu reunió en la conversación y los envía como una solicitud de demo.
export const POST: APIRoute = async ({ request, url }) => {
  const json = (status: number, body: object) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  if (!validOrigin(request, url)) return json(403, { ok: false });
  try {
    const text = await request.text();
    if (text.length > 4000) return json(413, { ok: false });
    const parsed = schema.safeParse(JSON.parse(text));
    if (!parsed.success) return json(400, { ok: false });
    const result = await submitDemo({ ...parsed.data, consent: true });
    return json(result.ok ? 200 : 503, { ok: result.ok });
  } catch {
    return json(400, { ok: false });
  }
};
