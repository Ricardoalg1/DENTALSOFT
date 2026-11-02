import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardList, FolderInput, History, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, getMe } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { MIGRATION_KINDS, type MigrationBatch } from "@/lib/migration";
import { hasModule } from "@/lib/types";
import { cn } from "@/lib/utils";
import { DocumentsImporter } from "./documents-importer";
import { SheetImporter } from "./sheet-importer";
import { VoidBatchButton } from "./void-batch-button";

export const metadata: Metadata = { title: "Migración de datos" };

const VIEWS = {
  pacientes: { label: "Pacientes", icon: UserRound, clinical: false },
  historia: { label: "Historia clínica", icon: ClipboardList, clinical: true },
  documentos: { label: "Documentos", icon: FolderInput, clinical: true },
  historial: { label: "Historial", icon: History, clinical: false },
} as const;
type View = keyof typeof VIEWS;

export default async function MigrationPage({ searchParams }: PageProps<"/app/migracion">) {
  const me = await getMe();
  if (me.role !== "ADMIN") {
    return <p className="text-muted-foreground">Solo los administradores pueden importar datos de otros programas.</p>;
  }
  const clinical = hasModule(me, "CLINICAL_RECORD");
  const sp = await searchParams;
  const requested = typeof sp.vista === "string" && sp.vista in VIEWS ? (sp.vista as View) : "pacientes";
  const view: View = VIEWS[requested].clinical && !clinical ? "pacientes" : requested;
  const batches = view === "historial" ? await api<MigrationBatch[]>("/api/migration/batches") : [];

  return (
    <div className="grid max-w-6xl gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Migración de datos</h1>
        <p className="text-muted-foreground">
          Trae los pacientes, la historia clínica y los documentos desde el programa que usabas antes. Exporta desde
          allá a Excel o CSV y sigue los pasos; puedes validar sin guardar nada y repetir sin duplicar.
        </p>
      </div>

      <nav aria-label="Migración de datos" className="flex w-fit flex-wrap gap-1 rounded-lg bg-muted/60 p-1">
        {(Object.entries(VIEWS) as [View, (typeof VIEWS)[View]][])
          .filter(([, v]) => clinical || !v.clinical)
          .map(([key, v]) => (
            <Link
              key={key}
              href={`/app/migracion?vista=${key}`}
              aria-current={view === key ? "page" : undefined}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground",
                view === key && "bg-background font-medium text-foreground shadow-sm",
              )}
            >
              <v.icon className="size-4" /> {v.label}
            </Link>
          ))}
      </nav>

      {view === "pacientes" && (
        <Card>
          <CardHeader>
            <CardTitle>Pacientes</CardTitle>
            <CardDescription>
              Datos de identificación, contacto y afiliación{clinical && ", y si vienen en el mismo archivo, alergias, medicamentos y antecedentes"}.
              Es el primer paso: la historia y los documentos se vinculan por número de documento.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SheetImporter key="PATIENTS" kind="PATIENTS" clinicalEnabled={clinical} />
          </CardContent>
        </Card>
      )}
      {view === "historia" && (
        <Card>
          <CardHeader>
            <CardTitle>Historia clínica anterior</CardTitle>
            <CardDescription>Evoluciones, consultas o notas exportadas en Excel/CSV, una fila por atención.</CardDescription>
          </CardHeader>
          <CardContent>
            <SheetImporter key="CLINICAL_RECORDS" kind="CLINICAL_RECORDS" clinicalEnabled />
          </CardContent>
        </Card>
      )}
      {view === "documentos" && (
        <Card>
          <CardHeader>
            <CardTitle>Documentos</CardTitle>
            <CardDescription>
              Historias en PDF, radiografías, fotos y consentimientos escaneados. Útil cuando el programa anterior solo
              exporta la historia en PDF por paciente.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DocumentsImporter />
          </CardContent>
        </Card>
      )}
      {view === "historial" && (
        <Card>
          <CardHeader>
            <CardTitle>Importaciones realizadas</CardTitle>
            <CardDescription>Registro de cada importación: quién la hizo, de qué programa y con qué resultado.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {batches.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aún no se ha importado nada.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Origen</TableHead>
                    <TableHead className="text-right">Creados</TableHead>
                    <TableHead className="text-right">Actualizados</TableHead>
                    <TableHead className="text-right">Omitidos</TableHead>
                    <TableHead className="text-right">Errores</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {batches.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell>
                        <div>{formatDateTime(b.createdAt)}</div>
                        <div className="text-xs text-muted-foreground">{b.createdBy?.name}</div>
                      </TableCell>
                      <TableCell>
                        {MIGRATION_KINDS[b.kind]}
                        {b.voidedAt && (
                          <Badge variant="destructive" className="ml-2" title={b.voidReason ?? undefined}>
                            Anulada
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div>{b.sourceSystem}</div>
                        {b.fileName && <div className="max-w-56 truncate text-xs text-muted-foreground" title={b.fileName}>{b.fileName}</div>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{b.created.toLocaleString("es-CO")}</TableCell>
                      <TableCell className="text-right tabular-nums">{b.updated.toLocaleString("es-CO")}</TableCell>
                      <TableCell className="text-right tabular-nums">{b.skipped.toLocaleString("es-CO")}</TableCell>
                      <TableCell className="text-right tabular-nums">{b.errors.toLocaleString("es-CO")}</TableCell>
                      <TableCell className="text-right">
                        {b.kind === "CLINICAL_RECORDS" && !b.voidedAt && clinical && (
                          <VoidBatchButton batchId={b.id} created={b.created} />
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
