"use client";
import { MODULE_COLORS, ROUTE_MODULES } from "@/lib/module-colors";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Biohazard,
  Building2,
  CalendarDays,
  ChartColumn,
  ChevronDown,
  ClipboardList,
  FileSignature,
  FileText,
  Flame,
  HandCoins,
  BookOpen,
  HeartHandshake,
  LayoutDashboard,
  LayoutGrid,
  MessageSquare,
  Package,
  Receipt,
  Settings,
  ShieldCheck,
  ShieldPlus,
  SprayCan,
  Tags,
  Thermometer,
  TriangleAlert,
  UserCog,
  UserRound,
  Users,
  Wallet,
  Wrench,
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
  /** Solo quienes administran la caja (administración y recepción). */
  manageCashOnly?: boolean;
  messagingOnly?: boolean;
  platformOnly?: boolean;
  /** Solo el equipo de Occlus (panel de plataforma). */
  platformAdminOnly?: boolean;
  /** Módulo que debe tener habilitada la clínica. */
  module?: ModuleKey;
  /** Submenú desplegable. */
  children?: Item[];
};

const ITEMS: Item[] = [
  { href: "/app/plataforma", label: "Plataforma", icon: ShieldCheck, platformAdminOnly: true },
  { href: "/app/comercial", label: "Comercial", icon: Users, platformOnly: true },
  { href: "/app", label: "Inicio", icon: LayoutDashboard },
  { href: "/app/pacientes", label: "Pacientes", icon: UserRound },
  { href: "/app/agenda", label: "Agenda", icon: CalendarDays },
  { href: "/app/historias", label: "Historias clínicas", icon: ClipboardList, clinicalOnly: true, module: "CLINICAL_RECORD" },
  { href: "/app/caja", label: "Recaudos", icon: Wallet, cashOnly: true, module: "TREATMENTS_CASH" },
  { href: "/app/financiamiento", label: "Financiamiento", icon: HandCoins, cashOnly: true, module: "TREATMENTS_CASH" },
  { href: "/app/gastos", label: "Gastos", icon: Receipt, manageCashOnly: true, module: "TREATMENTS_CASH" },
  { href: "/app/informes", label: "Informes", icon: ChartColumn, adminOnly: true, module: "REPORTS" },
  { href: "/app/facturacion", label: "Facturación y RIPS", icon: FileText, adminOnly: true, module: "BILLING_RIPS" },
  { href: "/app/inventario", label: "Inventario", icon: Package, module: "INVENTORY" },
  { href: "/app/mensajes", label: "Mensajes", icon: MessageSquare, messagingOnly: true, module: "MESSAGING" },
  { href: "/app/seguimiento", label: "Seguimiento", icon: HeartHandshake, messagingOnly: true },
  {
    href: "/app/bioseguridad",
    label: "Bioseguridad",
    icon: ShieldPlus,
    children: [
      { href: "/app/bioseguridad", label: "Resumen", icon: LayoutGrid },
      { href: "/app/bioseguridad/esterilizacion", label: "Esterilización", icon: Flame },
      { href: "/app/bioseguridad/limpieza", label: "Limpieza y desinfección", icon: SprayCan },
      { href: "/app/bioseguridad/residuos", label: "Residuos", icon: Biohazard },
      { href: "/app/bioseguridad/temperatura", label: "Temperatura y humedad", icon: Thermometer },
      { href: "/app/bioseguridad/mantenimiento", label: "Mantenimiento", icon: Wrench },
      { href: "/app/bioseguridad/accidentes", label: "Accidentes", icon: TriangleAlert },
    ],
  },
  {
    href: "/app/administracion",
    label: "Administración",
    icon: Settings,
    children: [
      { href: "/app/equipo", label: "Equipo", icon: Users, adminOnly: true },
      { href: "/app/sedes", label: "Sedes", icon: Building2 },
      { href: "/app/precios", label: "Lista de precios", icon: Tags, module: "TREATMENTS_CASH" },
      { href: "/app/cups", label: "Catálogo CUPS", icon: BookOpen },
      { href: "/app/historias/plantillas", label: "Plantillas de consentimiento", icon: FileSignature, adminOnly: true, module: "CLINICAL_RECORD" },
      { href: "/app/cuenta", label: "Mi cuenta", icon: UserCog },
    ],
  },
];

type Access = {
  isAdmin: boolean;
  clinical: boolean;
  cash: boolean;
  manageCash: boolean;
  messaging: boolean;
  platform: boolean;
  modules: ModuleKey[];
  platformAdmin: boolean;
};

const allowed = (i: Item, a: Access) =>
  (a.isAdmin || !i.adminOnly) &&
  (a.clinical || !i.clinicalOnly) &&
  (a.cash || !i.cashOnly) &&
  (a.manageCash || !i.manageCashOnly) &&
  (a.messaging || !i.messagingOnly) &&
  (a.platform || !i.platformOnly) &&
  (a.platformAdmin || !i.platformAdminOnly) &&
  (!i.module || a.modules.includes(i.module));

/** La ruta más específica gana: /app/historias/plantillas no marca también Historias clínicas. */
function activeHref(pathname: string, hrefs: string[]) {
  return hrefs
    .filter((h) => (h === "/app" ? pathname === "/app" : pathname === h || pathname.startsWith(`${h}/`)))
    .sort((a, b) => b.length - a.length)[0];
}

function IconBadge({ href, icon: Icon }: { href: string; icon: LucideIcon }) {
  const colors = MODULE_COLORS[ROUTE_MODULES[href.split("/")[2]]];
  return (
    <span
      className="grid size-7 shrink-0 place-items-center rounded-lg"
      style={colors ? { color: colors.color, background: colors.background } : undefined}
    >
      <Icon className="size-4" aria-hidden />
    </span>
  );
}

export function Nav(props: Access) {
  const pathname = usePathname();
  const items = ITEMS.filter((i) => allowed(i, props))
    .map((i) => (i.children ? { ...i, children: i.children.filter((c) => allowed(c, props)) } : i))
    .filter((i) => !i.children || i.children.length > 0);
  const flat = items.flatMap((i) => (i.children ? i.children.map((c) => c.href) : [i.href]));
  const current = activeHref(pathname, flat);

  return (
    <nav className="grid gap-0.5">
      {items.map((item) =>
        item.children ? (
          <Group key={item.href} item={item} current={current} />
        ) : (
          <NavLink key={item.href} item={item} active={current === item.href} />
        ),
      )}
    </nav>
  );
}

function NavLink({ item, active, nested }: { item: Item; active: boolean; nested?: boolean }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors hover:bg-muted",
        nested && "py-1 pl-4",
        active && "bg-primary/10 font-medium text-primary hover:bg-primary/15",
      )}
    >
      {nested ? <item.icon className="size-4 shrink-0 text-muted-foreground" aria-hidden /> : <IconBadge href={item.href} icon={item.icon} />}
      {item.label}
    </Link>
  );
}

function Group({ item, current }: { item: Item; current: string | undefined }) {
  const containsActive = item.children!.some((c) => c.href === current);
  const [open, setOpen] = useState(containsActive);
  const expanded = open || containsActive;
  return (
    <div>
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setOpen(!expanded)}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors hover:bg-muted",
          containsActive && "font-medium text-primary",
        )}
      >
        <IconBadge href={item.href} icon={item.icon} />
        {item.label}
        <ChevronDown className={cn("ml-auto size-4 text-muted-foreground transition-transform", expanded && "rotate-180")} aria-hidden />
      </button>
      {expanded && (
        <div className="ml-4 grid gap-0.5 border-l pl-1">
          {item.children!.map((c) => (
            <NavLink key={c.href} item={c} active={current === c.href} nested />
          ))}
        </div>
      )}
    </div>
  );
}
