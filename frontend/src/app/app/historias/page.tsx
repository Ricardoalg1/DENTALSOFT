import { EmptyState } from "@/components/app/reference-art";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Search,
  FileText,
  ClipboardList,
  ArrowUpRight,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PaginationLinks } from "@/components/pagination-links";
import { api, getMe } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  canReadClinical,
  type ClinicalNoteSummary,
  type Page,
} from "@/lib/types";
export const metadata: Metadata = { title: "Historias clínicas" };

const SORTS = {
  patient: { label: "Paciente", firstDir: "asc" },
  dentist: { label: "Profesional", firstDir: "asc" },
  reason: { label: "Motivo", firstDir: "asc" },
  date: { label: "Fecha", firstDir: "desc" },
} as const;
type SortKey = keyof typeof SORTS;
const PAGE_SIZES = [10, 20, 50];
/** Encabezado y filas comparten columnas para que queden alineados. */
const ROW_COLUMNS = "md:grid-cols-[2.25rem_minmax(0,16rem)_minmax(0,1fr)_10.5rem_9rem_1rem] md:gap-x-4";

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
  const sort: SortKey = typeof sp.sort === "string" && sp.sort in SORTS ? (sp.sort as SortKey) : "date";
  const dir = sp.dir === "asc" || sp.dir === "desc" ? sp.dir : SORTS[sort].firstDir;
  const size = PAGE_SIZES.includes(Number(sp.size)) ? Number(sp.size) : PAGE_SIZES[0];
  const query = new URLSearchParams({
    q,
    scope,
    page: String(page),
    size: String(size),
    sort,
    dir,
  });
  const result = await api<Page<ClinicalNoteSummary>>(
    `/api/clinical-notes/search?${query}`,
  );
  const hrefWith = (changes: Record<string, string>) => {
    const qs = new URLSearchParams(query);
    for (const [key, value] of Object.entries(changes)) qs.set(key, value);
    return `/app/historias?${qs}`;
  };
  const href = (next: number) => hrefWith({ page: String(next) });
  /** Ordenar vuelve a la primera página; en la columna activa, invierte la dirección. */
  const sortLink = (key: SortKey) => {
    const active = sort === key;
    const nextDir = active ? (dir === "asc" ? "desc" : "asc") : SORTS[key].firstDir;
    const Icon = !active ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown;
    return (
      <Link
        href={hrefWith({ sort: key, dir: nextDir, page: "0" })}
        scroll={false}
        aria-label={`Ordenar por ${SORTS[key].label.toLowerCase()}${active ? `, orden actual ${dir === "asc" ? "ascendente" : "descendente"}` : ""}`}
        aria-current={active ? "true" : undefined}
        className={cn(
          "inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium transition-colors hover:bg-muted",
          active ? "bg-accent text-primary" : "text-muted-foreground",
        )}
      >
        {SORTS[key].label}
        <Icon className="size-3.5" aria-hidden="true" />
      </Link>
    );
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
        className="reference-search"
      >
        <input type="hidden" name="sort" value={sort} />
        <input type="hidden" name="dir" value={dir} />
        <input type="hidden" name="size" value={size} />
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
      {result.content.length > 0 && (
        <div
          role="group"
          aria-label="Ordenar resultados"
          className={cn("flex flex-wrap items-center gap-1 px-3 md:grid", ROW_COLUMNS)}
        >
          <span className="hidden md:block" />
          <span className="flex flex-wrap gap-1">
            {sortLink("patient")}
            {sortLink("dentist")}
          </span>
          <span>{sortLink("reason")}</span>
          <span>{sortLink("date")}</span>
        </div>
      )}
      <ul className="grid gap-2">
        {result.content.map((note) => (
          <li key={note.id}>
            <Link
              href={
                note.status === "DRAFT"
                  ? `/app/pacientes/${note.patient.id}/historia/${note.id}`
                  : `/app/historias/${note.id}`
              }
              data-hover-card
              className={cn(
                "group grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded-xl border bg-card px-3 py-2.5 shadow-sm",
                ROW_COLUMNS,
              )}
            >
              <span
                className="row-span-2 grid size-9 place-items-center rounded-lg bg-primary/10 text-primary md:col-start-1 md:row-span-1"
                aria-hidden="true"
              >
                <FileText className="size-5" />
              </span>
              <span className="min-w-0 md:col-start-2 md:row-start-1">
                <span className="block truncate text-sm font-semibold">{note.patient.name}</span>
                <span className="block truncate text-xs text-muted-foreground">{note.dentist.name}</span>
              </span>
              <span className="col-start-2 row-start-2 min-w-0 md:col-start-3 md:row-start-1">
                <span className="block truncate text-sm">{note.reason || "Sin motivo registrado"}</span>
                {note.diagnosisMain && (
                  <span className="block truncate text-xs text-muted-foreground">
                    {note.diagnosisMain.display} · {note.diagnosisMain.description}
                  </span>
                )}
              </span>
              <span className="col-span-2 col-start-2 whitespace-nowrap text-xs text-muted-foreground md:col-span-1 md:col-start-4 md:row-start-1">
                {formatDateTime(note.attendedAt)}
              </span>
              <Badge
                className="col-start-3 row-start-1 md:col-start-5 md:justify-self-start"
                variant={note.status === "SIGNED" ? "secondary" : "outline"}
              >
                {note.status === "SIGNED" ? "Firmada" : "Pendiente de firma"}
              </Badge>
              <ArrowUpRight
                className="hidden size-4 text-primary md:col-start-6 md:row-start-1 md:block"
                aria-label={note.status === "SIGNED" ? "Abrir documento" : "Continuar evolución"}
              />
            </Link>
          </li>
        ))}
      </ul>
      {result.content.length === 0 && (
        <div className="reference-panel"><EmptyState kind="history" title="No se encontraron documentos para estos filtros." /></div>
      )}
      <PaginationLinks
        page={result.page}
        pages={result.totalPages}
        total={result.totalElements}
        href={href}
      />
      {result.totalElements > PAGE_SIZES[0] && (
        <nav aria-label="Resultados por página" className="no-print flex items-center gap-1 text-xs text-muted-foreground">
          <span className="mr-1">Por página:</span>
          {PAGE_SIZES.map((option) => (
            <Link
              key={option}
              href={hrefWith({ size: String(option), page: "0" })}
              scroll={false}
              aria-current={option === size ? "true" : undefined}
              className={cn(
                "rounded-md px-2 py-1 font-medium transition-colors hover:bg-muted",
                option === size && "bg-accent text-primary",
              )}
            >
              {option}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}
