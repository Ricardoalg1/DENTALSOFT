import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Search,
  FileText,
  FilePenLine,
  ShieldCheck,
  ClipboardList,
  ArrowUpRight,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PaginationLinks } from "@/components/pagination-links";
import { api, getMe } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import {
  canReadClinical,
  type ClinicalNoteSummary,
  type Page,
} from "@/lib/types";
export const metadata: Metadata = { title: "Historias clínicas" };
export default async function ClinicalNotesPage({
  searchParams,
}: PageProps<"/app/historias">) {
  const me = await getMe();
  if (!canReadClinical(me)) redirect("/app");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 160) : "";
  const scope =
    sp.scope === "my-drafts" && me.professional ? "my-drafts" : "signed";
  const page = Math.min(1000000, Math.max(0, Math.trunc(Number(sp.page) || 0)));
  const query = new URLSearchParams({
    q,
    scope,
    page: String(page),
    size: "20",
  });
  const result = await api<Page<ClinicalNoteSummary>>(
    `/api/clinical-notes/search?${query}`,
  );
  const href = (next: number) => {
    const qs = new URLSearchParams(query);
    qs.set("page", String(next));
    return `/app/historias?${qs}`;
  };
  return (
    <div className="grid max-w-6xl gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-3 text-3xl font-semibold">
            <FileText className="size-7 text-primary" />
            Historias clínicas
          </h1>
          <p className="mt-2 text-muted-foreground">
            Busca documentos por paciente, identificación, profesional, motivo o
            código de diagnóstico.
          </p>
        </div>
        {me.role === "ADMIN" && (
          <Link
            href="/app/historias/plantillas"
            className={buttonVariants({ variant: "outline" })}
          >
            <ClipboardList />
            Plantillas de consentimiento
          </Link>
        )}
      </header>
      <form
        role="search"
        className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4"
      >
        <Search className="size-5 text-muted-foreground" />
        <Input
          name="q"
          defaultValue={q}
          placeholder="Buscar en las historias de tu clínica"
          aria-label="Buscar historias"
          className="max-w-lg"
        />
        <select
          name="scope"
          defaultValue={scope}
          className="rounded-lg border bg-background px-3 py-2 text-sm"
        >
          <option value="signed">Evoluciones firmadas</option>
          {me.professional && (
            <option value="my-drafts">Mis borradores pendientes</option>
          )}
        </select>
        <Button type="submit">
          <Search />
          Buscar
        </Button>
      </form>
      <div className="grid gap-4 md:grid-cols-2">
        {result.content.map((note) => (
          <Link
            key={note.id}
            href={
              note.status === "DRAFT"
                ? `/app/pacientes/${note.patient.id}/historia/${note.id}`
                : `/app/historias/${note.id}`
            }
            data-hover-card
            className="group grid gap-4 rounded-2xl border bg-card p-5 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                {note.status === "SIGNED" ? (
                  <ShieldCheck className="size-4 text-primary" />
                ) : (
                  <FilePenLine className="size-4" />
                )}
                {formatDateTime(note.attendedAt)}
              </span>
              <Badge
                variant={note.status === "SIGNED" ? "secondary" : "outline"}
              >
                {note.status === "SIGNED" ? "Firmada" : "Pendiente de firma"}
              </Badge>
            </div>
            <div className="border-l-2 border-primary/30 pl-4">
              <h2 className="font-semibold">{note.patient.name}</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {note.dentist.name}
              </p>
              <p className="mt-3 line-clamp-2 text-sm">
                {note.reason || "Sin motivo registrado"}
              </p>
              {note.diagnosisMain && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {note.diagnosisMain.display} ·{" "}
                  {note.diagnosisMain.description}
                </p>
              )}
            </div>
            <p className="flex items-center justify-between border-t pt-3 text-xs font-medium text-primary">
              {note.status === "SIGNED"
                ? "Abrir documento"
                : "Continuar evolución"}
              <ArrowUpRight className="size-4" />
            </p>
          </Link>
        ))}
      </div>
      {result.content.length === 0 && (
        <p className="rounded-xl border border-dashed p-12 text-center text-muted-foreground">
          No se encontraron documentos para estos filtros.
        </p>
      )}
      <PaginationLinks
        page={result.page}
        pages={result.totalPages}
        total={result.totalElements}
        href={href}
      />
    </div>
  );
}
