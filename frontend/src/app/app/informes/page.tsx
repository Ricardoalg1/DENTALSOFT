import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChartColumn, FileSpreadsheet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { getMe } from "@/lib/api";
import { REPORT_SECTIONS } from "@/lib/reports-catalog";

export const metadata: Metadata = { title: "Informes" };

export default async function ReportsCenterPage() {
  const me = await getMe();
  if (me.role !== "ADMIN") redirect("/app");
  return (
    <div className="mx-auto grid max-w-6xl gap-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Centro de informes</h1>
          <p className="text-muted-foreground">Informes financieros, operativos, de inventario e IPS, con exportación a Excel (CSV).</p>
        </div>
        <Link href="/app/reportes" className={buttonVariants({ variant: "outline" })}>
          <ChartColumn /> Tablero de indicadores
        </Link>
      </header>
      {REPORT_SECTIONS.map((section) => (
        <section key={section.title} className="grid gap-3">
          <h2 className="text-lg font-semibold">{section.title}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {section.reports.map((r) =>
              r.soon ? (
                <div key={r.key} className="rounded-xl border border-dashed p-4 text-muted-foreground" title={r.soon}>
                  <div className="flex items-center justify-between gap-2 font-medium">
                    <span className="flex items-center gap-2">
                      <FileSpreadsheet className="size-4" /> {r.label}
                    </span>
                    <Badge variant="outline">Próximamente</Badge>
                  </div>
                  <p className="mt-1 text-sm">{r.description}</p>
                  <p className="mt-2 text-xs">{r.soon}</p>
                </div>
              ) : (
                <Link key={r.key} href={`/app/informes/${r.key}`} className="rounded-xl border bg-card p-4 transition-colors hover:bg-muted/40">
                  <div className="flex items-center gap-2 font-medium">
                    <FileSpreadsheet className="size-4 text-primary" /> {r.label}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{r.description}</p>
                </Link>
              ),
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
