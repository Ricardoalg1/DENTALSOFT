import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pager, pageParam } from "@/components/platform/pager";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { EVENT_KIND_LABELS, SEVERITY_LABELS, SEVERITY_VARIANT, type NotificationRow } from "@/lib/platform";
import type { Page } from "@/lib/types";
import { cn } from "@/lib/utils";
import { markAllRead, markRead } from "../actions";

export const metadata: Metadata = { title: "Notificaciones · Plataforma" };

export default async function NotificationsPage({ searchParams }: PageProps<"/app/plataforma/notificaciones">) {
  const sp = await searchParams;
  const unread = sp.todas !== "1";
  const page = pageParam(sp.page);
  const data = await api<Page<NotificationRow>>(`/api/platform/notifications?unread=${unread}&page=${page}&size=30`);
  const hrefFor = (p1: number) => `/app/plataforma/notificaciones?${new URLSearchParams({ page: String(p1), ...(unread ? {} : { todas: "1" }) })}`;
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Lo que requiere atención del equipo. Cada persona del equipo tiene su propia bandeja.</p>
        <div className="flex items-center gap-3">
          <Link href={unread ? "/app/plataforma/notificaciones?todas=1" : "/app/plataforma/notificaciones"} className="text-sm text-primary hover:underline">
            {unread ? "Ver también las leídas" : "Ver solo sin leer"}
          </Link>
          {data.totalElements > 0 && unread && (
            <form action={markAllRead}>
              <Button type="submit" variant="outline" size="sm">
                Marcar todas como leídas
              </Button>
            </form>
          )}
        </div>
      </div>

      {data.content.length === 0 ? (
        <p className="py-6 text-sm text-muted-foreground">{unread ? "No tienes notificaciones sin leer." : "Sin notificaciones."}</p>
      ) : (
        <ul className="divide-y rounded-xl border">
          {data.content.map((n) => (
            <li key={n.id} className={cn("flex flex-wrap items-start gap-3 p-3 text-sm", !n.readAt && "bg-primary/5")}>
              <Badge variant={SEVERITY_VARIANT[n.event.severity]}>{SEVERITY_LABELS[n.event.severity]}</Badge>
              <div className="min-w-0 flex-1">
                <p className={cn(!n.readAt && "font-medium")}>{n.event.title}</p>
                <p className="text-xs text-muted-foreground">
                  {EVENT_KIND_LABELS[n.event.kind] ?? n.event.kind} · {formatDateTime(n.createdAt)}
                  {n.event.clinicId && (
                    <>
                      {" · "}
                      <Link href={`/app/plataforma/clientes/${n.event.clinicId}`} className="text-primary hover:underline">
                        Ver cliente
                      </Link>
                    </>
                  )}
                </p>
              </div>
              {!n.readAt && (
                <form action={markRead.bind(null, n.id)}>
                  <Button type="submit" variant="ghost" size="sm">
                    Marcar leída
                  </Button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
      <Pager page={data.page} totalPages={data.totalPages} hrefFor={hrefFor} />
    </div>
  );
}
