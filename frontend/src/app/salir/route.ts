import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/session-cookie";

/** Cierra una sesión vencida: borra la cookie y redirige al login. */
export function GET(request: NextRequest) {
  const res = NextResponse.redirect(new URL("/ingresar?expirada=1", request.url));
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
