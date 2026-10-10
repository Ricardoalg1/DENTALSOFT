"use client";
import { MODULE_COLORS, ROUTE_MODULES } from "@/lib/module-colors";

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
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import type { ModuleKey } from "@/lib/types";
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
  /** Solo el equipo de Occlus (panel de plataforma). */
  platformAdminOnly?: boolean;
  /** Módulo que debe tener habilitada la clínica. */
  module?: ModuleKey;
};

const ITEMS: Item[] = [
  {
    href: "/app/plataforma",
    label: "Plataforma",
    icon: ShieldCheck,
    platformAdminOnly: true,
  },
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
    module: "MESSAGING",
  },
  {
    href: "/app/historias",
    label: "Historias clínicas",
    icon: ClipboardList,
    clinicalOnly: true,
    module: "CLINICAL_RECORD",
  },
  {
    href: "/app/caja",
    label: "Caja",
    icon: Wallet,
    cashOnly: true,
    module: "TREATMENTS_CASH",
  },
  {
    href: "/app/precios",
    label: "Lista de precios",
    icon: Tags,
    module: "TREATMENTS_CASH",
  },
  {
    href: "/app/facturacion",
    label: "Facturación y RIPS",
    icon: FileText,
    adminOnly: true,
    module: "BILLING_RIPS",
  },
  {
    href: "/app/inventario",
    label: "Inventario",
    icon: Package,
    module: "INVENTORY",
  },
  {
    href: "/app/reportes",
    label: "Reportes",
    icon: ChartColumn,
    adminOnly: true,
    module: "REPORTS",
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
  modules,
  platformAdmin,
}: {
  isAdmin: boolean;
  clinical: boolean;
  cash: boolean;
  messaging: boolean;
  platform: boolean;
  modules: ModuleKey[];
  platformAdmin: boolean;
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
          (platform || !i.platformOnly) &&
          (platformAdmin || !i.platformAdminOnly) &&
          (!i.module || modules.includes(i.module)),
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
              <span
                className="grid size-7 shrink-0 place-items-center rounded-lg"
                style={
                  MODULE_COLORS[ROUTE_MODULES[href.split("/")[2]]]
                    ? {
                        color:
                          MODULE_COLORS[ROUTE_MODULES[href.split("/")[2]]]
                            .color,
                        background:
                          MODULE_COLORS[ROUTE_MODULES[href.split("/")[2]]]
                            .background,
                      }
                    : undefined
                }
              >
                <Icon className="size-4" aria-hidden />
              </span>
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
            <span
              className="grid size-7 shrink-0 place-items-center rounded-lg"
              style={
                MODULE_COLORS[ROUTE_MODULES[href.split("/")[2]]]
                  ? {
                      color:
                        MODULE_COLORS[ROUTE_MODULES[href.split("/")[2]]].color,
                      background:
                        MODULE_COLORS[ROUTE_MODULES[href.split("/")[2]]]
                          .background,
                    }
                  : undefined
              }
            >
              <Icon className="size-4" aria-hidden />
            </span>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
