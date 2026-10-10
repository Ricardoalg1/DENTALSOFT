import { Laptop, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import type { SessionInfo } from "@/lib/platform";
import { revokeOtherSessions, revokeSession } from "@/app/app/cuenta/billing-actions";

/** «Chrome en macOS»: lo justo para que la persona reconozca el dispositivo. */
function device(ua: string | null) {
  if (!ua) return "Dispositivo desconocido";
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Navegador";
  const os = /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Mac OS X/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "otro sistema";
  return `${browser} en ${os}`;
}

export async function SessionsCard() {
  const sessions = await api<SessionInfo[]>("/api/auth/sessions");
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sesiones abiertas</CardTitle>
        <CardDescription>Si no reconoces alguna, ciérrala y cambia tu contraseña.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <ul className="divide-y rounded-lg border text-sm">
          {sessions.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 p-2.5">
              <span className="flex flex-wrap items-center gap-2">
                <Laptop className="size-4 text-primary" aria-hidden="true" />{device(s.userAgent)} <span className="text-muted-foreground">· desde {formatDateTime(s.createdAt)}</span>
              </span>
              {s.current ? (
                <Badge variant="secondary">Esta sesión</Badge>
              ) : (
                <form action={revokeSession.bind(null, s.id)}>
                  <Button type="submit" variant="outline" size="sm">
                    Cerrar
                  </Button>
                </form>
              )}
            </li>
          ))}
        </ul>
        {sessions.length > 1 && (
          <form action={revokeOtherSessions}>
            <Button type="submit" variant="outline" size="sm">
              <Trash2 aria-hidden="true" />Cerrar todas las demás
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
