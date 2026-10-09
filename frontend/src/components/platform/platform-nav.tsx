"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/app/plataforma", label: "Resumen", exact: true },
  { href: "/app/plataforma/clientes", label: "Clientes" },
  { href: "/app/plataforma/notificaciones", label: "Notificaciones", badge: true },
  { href: "/app/plataforma/eventos", label: "Eventos" },
  { href: "/app/plataforma/auditoria", label: "Auditoría" },
  { href: "/app/plataforma/planes", label: "Planes" },
  { href: "/app/plataforma/avisos", label: "Avisos" },
];

export function PlatformNav({ unread }: { unread: number }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Secciones de plataforma" className="-mb-2 flex gap-1 overflow-x-auto border-b">
      {TABS.map((t) => {
        const active = t.exact ? pathname === t.href : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px flex shrink-0 items-center gap-1.5 border-b-2 border-transparent px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground",
              active && "border-primary font-medium text-foreground",
            )}
          >
            {t.label}
            {t.badge && unread > 0 && <Badge variant="destructive">{unread > 99 ? "99+" : unread}</Badge>}
          </Link>
        );
      })}
    </nav>
  );
}
