import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api";
import { REGIMES, type Page, type PatientSummary } from "@/lib/types";

export const metadata: Metadata = { title: "Pacientes" };

const PAGE_SIZE = 20;

export default async function PatientsPage({ searchParams }: PageProps<"/app/pacientes">) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim() : "";
  const page = Math.max(Number(params.page) || 0, 0);

  const query = new URLSearchParams({ page: String(page), size: String(PAGE_SIZE) });
  if (q) query.set("q", q);
  const result = await api<Page<PatientSummary>>(`/api/patients?${query}`);

  const pageHref = (p: number) => {
    const sp = new URLSearchParams({ page: String(p) });
    if (q) sp.set("q", q);
    return `/app/pacientes?${sp}`;
  };

  return (
    <div className="grid max-w-6xl gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Pacientes</h1>
          <p className="text-muted-foreground">
            {result.totalElements} {result.totalElements === 1 ? "paciente" : "pacientes"}
            {q && ` para “${q}”`}
          </p>
        </div>
        <Link href="/app/pacientes/nuevo" className={buttonVariants()}>
          <Plus /> Nuevo paciente
        </Link>
      </div>

      {/* Formulario GET: la búsqueda queda en la URL (se puede compartir o recargar). */}
      <form className="flex max-w-md gap-2" role="search">
        <Input name="q" defaultValue={q} placeholder="Buscar por nombre o documento" aria-label="Buscar pacientes" />
        <Button type="submit" variant="outline">
          <Search /> Buscar
        </Button>
      </form>

      <Card>
        <CardContent className="overflow-x-auto">
          {result.content.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {q ? "No hay pacientes que coincidan con la búsqueda." : "Aún no hay pacientes registrados."}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Paciente</TableHead>
                  <TableHead>Documento</TableHead>
                  <TableHead>Edad</TableHead>
                  <TableHead>Teléfono</TableHead>
                  <TableHead>Afiliación</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.content.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <Link href={`/app/pacientes/${p.id}`} className="font-medium hover:text-primary hover:underline">
                        {p.fullName}
                      </Link>
                      {!p.active && (
                        <Badge variant="outline" className="ml-2">
                          Inactivo
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {p.documentType} {p.documentNumber}
                    </TableCell>
                    <TableCell className="tabular-nums">{p.age} años</TableCell>
                    <TableCell className="tabular-nums">{p.phone ?? "—"}</TableCell>
                    <TableCell>
                      {REGIMES[p.regime]}
                      {p.insurer && <span className="text-muted-foreground"> · {p.insurer}</span>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {result.totalPages > 1 && (
        <nav className="flex items-center gap-3 text-sm" aria-label="Paginación">
          {page > 0 ? (
            <Link href={pageHref(page - 1)} className={buttonVariants({ variant: "outline", size: "sm" })}>
              Anterior
            </Link>
          ) : null}
          <span className="text-muted-foreground">
            Página {page + 1} de {result.totalPages}
          </span>
          {page + 1 < result.totalPages ? (
            <Link href={pageHref(page + 1)} className={buttonVariants({ variant: "outline", size: "sm" })}>
              Siguiente
            </Link>
          ) : null}
        </nav>
      )}
    </div>
  );
}
