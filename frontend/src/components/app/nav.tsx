"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  CalendarDays,
  ClipboardList,
  FileText,
  LayoutDashboard,
  Package,
  ChartColumn,
  Users,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Item = { href: string; label: string; icon: LucideIcon; soon?: boolean; adminOnly?: boolean; clinicalOnly?: boolean };

const ITEMS: Item[] = [
  { href: "/app", label: "Inicio", icon: LayoutDashboard },
  { href: "/app/pacientes", label: "Pacientes", icon: UserRound },
  { href: "/app/agenda", label: "Agenda", icon: CalendarDays },
  { href: "/app/historias", label: "Historias clínicas", icon: ClipboardList, clinicalOnly: true },
  { href: "/app/facturacion", label: "Facturación y RIPS", icon: FileText, soon: true },
  { href: "/app/inventario", label: "Inventario", icon: Package, soon: true },
  { href: "/app/reportes", label: "Reportes", icon: ChartColumn, soon: true },
  { href: "/app/equipo", label: "Equipo", icon: Users, adminOnly: true },
  { href: "/app/sedes", label: "Sedes", icon: Building2 },
];

export function Nav({ isAdmin, clinical }: { isAdmin: boolean; clinical: boolean }) {
  const pathname = usePathname();
  return (
    <nav className="grid gap-0.5">
      {ITEMS.filter((i) => (isAdmin || !i.adminOnly) && (clinical || !i.clinicalOnly)).map(({ href, label, icon: Icon, soon }) => {
        const active = href === "/app" ? pathname === "/app" : pathname.startsWith(href);
        if (soon) {
          return (
            <span
              key={href}
              className="flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground/60"
              title="Próximamente"
            >
              <Icon className="size-4" />
              {label}
              <span className="ml-auto text-[10px] uppercase tracking-wide">Pronto</span>
            </span>
          );
        }
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors hover:bg-muted",
              active && "bg-primary/10 font-medium text-primary hover:bg-primary/15",
            )}
          >
            <Icon className="size-4" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
