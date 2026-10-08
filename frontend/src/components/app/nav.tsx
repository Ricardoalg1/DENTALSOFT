"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  CalendarDays,
  Wallet,
  Tags,
  ClipboardList,
  FileText,
  LayoutDashboard,
  Package,
  ChartColumn,
  Users,
  UserRound,
  MessageSquare,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Item = {
  href: string;
  label: string;
  icon: LucideIcon;
  soon?: boolean;
  adminOnly?: boolean;
  clinicalOnly?: boolean;
  /** Solo quienes cobran (todos menos el auxiliar). */
  cashOnly?: boolean;
  messagingOnly?: boolean;
  platformOnly?: boolean;
};

const ITEMS: Item[] = [
  {
    href: "/app/comercial",
    label: "Comercial",
    icon: Users,
    platformOnly: true,
  },
  { href: "/app", label: "Inicio", icon: LayoutDashboard },
  { href: "/app/pacientes", label: "Pacientes", icon: UserRound },
  { href: "/app/agenda", label: "Agenda", icon: CalendarDays },
  {
    href: "/app/mensajes",
    label: "Mensajes",
    icon: MessageSquare,
    messagingOnly: true,
  },
  {
    href: "/app/historias",
    label: "Historias clínicas",
    icon: ClipboardList,
    clinicalOnly: true,
  },
  { href: "/app/caja", label: "Caja", icon: Wallet, cashOnly: true },
  { href: "/app/precios", label: "Lista de precios", icon: Tags },
  {
    href: "/app/facturacion",
    label: "Facturación y RIPS",
    icon: FileText,
    adminOnly: true,
  },
  { href: "/app/inventario", label: "Inventario", icon: Package },
  {
    href: "/app/reportes",
    label: "Reportes",
    icon: ChartColumn,
    adminOnly: true,
  },
  { href: "/app/equipo", label: "Equipo", icon: Users, adminOnly: true },
  { href: "/app/sedes", label: "Sedes", icon: Building2 },
];

export function Nav({
  isAdmin,
  clinical,
  cash,
  messaging,
  platform,
}: {
  isAdmin: boolean;
  clinical: boolean;
  cash: boolean;
  messaging: boolean;
  platform: boolean;
}) {
  const pathname = usePathname();
  return (
    <nav className="grid gap-0.5">
      {ITEMS.filter(
        (i) =>
          (isAdmin || !i.adminOnly) &&
          (clinical || !i.clinicalOnly) &&
          (cash || !i.cashOnly) &&
          (messaging || !i.messagingOnly) &&
          (platform || !i.platformOnly),
      ).map(({ href, label, icon: Icon, soon }) => {
        const active =
          href === "/app" ? pathname === "/app" : pathname.startsWith(href);
        if (soon) {
          return (
            <span
              key={href}
              className="flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground/60"
              title="Próximamente"
            >
              <Icon className="size-4" />
              {label}
              <span className="ml-auto text-[10px] uppercase tracking-wide">
                Pronto
              </span>
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
              active &&
                "bg-primary/10 font-medium text-primary hover:bg-primary/15",
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
