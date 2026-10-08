import { API_URL } from "@/lib/api";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const response = await fetch(`${API_URL}/actuator/health/readiness`, {
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
    return Response.json(
      { status: response.ok ? "UP" : "DOWN" },
      {
        status: response.ok ? 200 : 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch {
    return Response.json(
      { status: "DOWN" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
