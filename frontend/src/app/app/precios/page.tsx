import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, ListTree, Stethoscope, TriangleAlert } from "lucide-react";
import { ReferenceArt } from "@/components/app/reference-art";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api, getMe } from "@/lib/api";
import { CUPS } from "@/lib/cups";
import { PROCEDURE_CATEGORIES, type Page, type Procedure, type ProcedureCategory, type TreatmentType } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ImportCups } from "./import-cups";
import { LoadExamples } from "./load-examples";
import { ProceduresTab } from "./procedures-tab";
import { TreatmentsTab } from "./treatments-tab";

export const metadata: Metadata = { title: "Lista de precios" };

const str = (v: unknown, max = 120) => (typeof v === "string" ? v.slice(0, max) : "");

export default async function PricesPage({ searchParams }: PageProps<"/app/precios">) {
  const sp = await searchParams;
  const view = sp.vista === "tratamientos" ? "tratamientos" : "procedimientos";
  const cups = str(sp.cups, 10);
  const initialCups = CUPS.find((entry) => entry.code === cups);
  const q = str(sp.q);
  const estado = sp.estado === "active" || sp.estado === "inactive" ? sp.estado : "";
  const page = Math.max(0, Math.trunc(Number(sp.page) || 0));
  const tratamiento = /^[0-9a-f-]{36}$/.test(str(sp.tratamiento)) ? str(sp.tratamiento) : "";
  const categoria = str(sp.categoria) in PROCEDURE_CATEGORIES ? (str(sp.categoria) as ProcedureCategory) : "";

  const me = await getMe();
  const isAdmin = me.role === "ADMIN";
  const params = new URLSearchParams({ q, status: estado || "all", page: String(page), size: "20" });
  if (view === "procedimientos" && tratamiento) params.set("treatmentId", tratamiento);
  if (view === "tratamientos" && categoria) params.set("category", categoria);

  const [treatments, all, procedures, treatmentPage] = await Promise.all([
    api<TreatmentType[]>("/api/treatment-types"),
    api<Procedure[]>(`/api/procedures?includeInactive=${isAdmin}`),
    view === "procedimientos" ? api<Page<Procedure>>(`/api/procedures/search?${params}`) : null,
    view === "tratamientos" ? api<Page<TreatmentType>>(`/api/treatment-types/search?${params}`) : null,
  ]);
  const missingCups = all.filter((p) => p.active && !p.cupsCode).length;
  const withoutTreatment = all.filter((p) => p.active && !p.treatment).length;

  return (
    <div className="grid max-w-6xl gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Lista de precios</h1>
          <p className="text-muted-foreground">
            Tratamientos y sus procedimientos (código CUPS y precio). Cambiar un precio no altera los planes ya presupuestados.
          </p>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          <Link href="/app/cups" className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm hover:bg-muted">
            <BookOpen className="size-4" /> Catálogo CUPS
          </Link>
          {isAdmin && <ImportCups existing={all.flatMap((p) => (p.cupsCode ? [p.cupsCode] : []))} treatments={treatments} />}
        </div>
      </div>

      {isAdmin && (missingCups > 0 || withoutTreatment > 0) && (
        <div
          role="note"
          className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-200"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <p>
            {missingCups > 0 && `${missingCups} ${missingCups === 1 ? "procedimiento activo no tiene" : "procedimientos activos no tienen"} código CUPS (obligatorio para los RIPS). `}
            {withoutTreatment > 0 && `${withoutTreatment} sin tratamiento asignado.`}
          </p>
        </div>
      )}

      {isAdmin && all.length === 0 && (
        <Card className="relative lg:pr-80">
          <ReferenceArt kind="prices" className="absolute top-6 right-6 hidden !w-72 lg:block" />
          <CardHeader>
            <CardTitle>Empieza con una lista de ejemplo</CardTitle>
            <CardDescription>Trae procedimientos comunes con precios orientativos. Ajústalos a tu clínica.</CardDescription>
          </CardHeader>
          <CardContent>
            <LoadExamples />
          </CardContent>
        </Card>
      )}

      <nav aria-label="Lista de precios" className="flex w-fit gap-1 rounded-lg bg-muted/60 p-1">
        {[
          { key: "procedimientos", label: "Procedimientos", icon: Stethoscope, count: all.length },
          { key: "tratamientos", label: "Tratamientos", icon: ListTree, count: treatments.length },
        ].map((t) => (
          <Link
            key={t.key}
            href={`/app/precios?vista=${t.key}`}
            aria-current={view === t.key ? "page" : undefined}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground",
              view === t.key && "bg-background font-medium text-foreground shadow-sm",
            )}
          >
            <t.icon className="size-4" /> {t.label} <span className="text-xs tabular-nums opacity-70">{t.count}</span>
          </Link>
        ))}
      </nav>

      <Card>
        <CardContent className="pt-6">
          {procedures && (
            <ProceduresTab
              key={`${q}|${estado}|${tratamiento}|${page}`}
              page={procedures}
              treatments={treatments}
              filters={{ q, estado, tratamiento }}
              isAdmin={isAdmin}
              initialCups={initialCups}
            />
          )}
          {treatmentPage && (
            <TreatmentsTab key={`${q}|${estado}|${categoria}|${page}`} page={treatmentPage} filters={{ q, estado, categoria }} isAdmin={isAdmin} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
