import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftRight, Boxes, Stethoscope } from "lucide-react";
import { api, getMe } from "@/lib/api";
import { EQUIPMENT_KINDS, EQUIPMENT_STATUS, type Equipment, type EquipmentKind, type EquipmentStatus, type InventoryOverview } from "@/lib/inventory";
import type { Page, Site } from "@/lib/types";
import { cn } from "@/lib/utils";
import { EquipmentTab } from "./equipment-tab";
import { InventoryPanel } from "./inventory-panel";

export const metadata: Metadata = { title: "Inventario" };

const str = (v: unknown, max = 120) => (typeof v === "string" ? v.slice(0, max) : "");

export default async function InventoryPage({ searchParams }: PageProps<"/app/inventario">) {
  const sp = await searchParams;
  const view = sp.vista === "equipos" ? "equipos" : sp.vista === "movimientos" ? "movimientos" : "insumos";
  const q = str(sp.q);
  const kind = str(sp.tipo) in EQUIPMENT_KINDS ? (str(sp.tipo) as EquipmentKind) : "";
  const status = str(sp.estado) in EQUIPMENT_STATUS ? (str(sp.estado) as EquipmentStatus) : "";
  const page = Math.max(0, Math.trunc(Number(sp.page) || 0));
  const params = new URLSearchParams({ page: String(page), size: "20" });
  if (q) params.set("q", q);
  if (kind) params.set("kind", kind);
  if (status) params.set("status", status);

  const [me, data, sites, equipment] = await Promise.all([
    getMe(),
    view === "equipos" ? null : api<InventoryOverview>("/api/inventory"),
    api<Site[]>("/api/sites"),
    view === "equipos" ? api<Page<Equipment>>(`/api/equipment?${params}`) : null,
  ]);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

  return (
    <div className="mx-auto grid max-w-6xl gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Inventario</h1>
        <p className="text-muted-foreground">Insumos y materiales con lotes y existencias por sede, y la hoja de vida de los equipos.</p>
      </header>
      <nav aria-label="Inventario" className="flex w-fit flex-wrap gap-1 rounded-lg bg-muted/60 p-1">
        {[
          { key: "insumos", label: "Insumos y materiales", icon: Boxes },
          { key: "equipos", label: "Equipos biomédicos y generales", icon: Stethoscope },
          { key: "movimientos", label: "Movimientos", icon: ArrowLeftRight },
        ].map((t) => (
          <Link
            key={t.key}
            href={`/app/inventario?vista=${t.key}`}
            aria-current={view === t.key ? "page" : undefined}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground",
              view === t.key && "bg-background font-medium text-foreground shadow-sm",
            )}
          >
            <t.icon className="size-4" /> {t.label}
          </Link>
        ))}
      </nav>
      {data && <InventoryPanel data={data} sites={sites} role={me.role} today={today} view={view === "movimientos" ? "movements" : "stock"} />}
      {equipment && (
        <EquipmentTab
          key={`${q}|${kind}|${status}|${page}`}
          page={equipment}
          sites={sites.filter((s) => s.active)}
          isAdmin={me.role === "ADMIN"}
          filters={{ q, tipo: kind, estado: status }}
          today={today}
        />
      )}
    </div>
  );
}
