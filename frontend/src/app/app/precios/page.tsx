import type { Metadata } from "next";
import { TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, getMe } from "@/lib/api";
import { formatCOP } from "@/lib/format";
import { ODONTOGRAM_CONDITIONS, PROCEDURE_CATEGORIES, type Procedure } from "@/lib/types";
import { LoadExamples } from "./load-examples";
import { ProcedureForm } from "./procedure-form";

export const metadata: Metadata = { title: "Lista de precios" };

export default async function PricesPage() {
  const me = await getMe();
  const isAdmin = me.role === "ADMIN";
  const procedures = await api<Procedure[]>(`/api/procedures?includeInactive=${isAdmin}`);
  const missingCups = procedures.filter((p) => p.active && !p.cupsCode).length;

  return (
    <div className="grid max-w-5xl gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Lista de precios</h1>
        <p className="text-muted-foreground">
          Procedimientos que se usan en los presupuestos. Cambiar un precio no altera los planes ya presupuestados.
        </p>
      </div>

      {isAdmin && missingCups > 0 && (
        <div
          role="note"
          className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-200"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <p>
            {missingCups} {missingCups === 1 ? "procedimiento no tiene" : "procedimientos no tienen"} código CUPS. Complétalos con la
            tabla oficial vigente: serán obligatorios para generar los RIPS.
          </p>
        </div>
      )}

      {isAdmin && procedures.length === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Empieza con una lista de ejemplo</CardTitle>
            <CardDescription>
              Trae procedimientos comunes con precios orientativos y sin códigos CUPS. Ajústalos a tu clínica.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LoadExamples />
          </CardContent>
        </Card>
      )}

      {procedures.length > 0 && (
        <Card>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Procedimiento</TableHead>
                  <TableHead>Categoría</TableHead>
                  <TableHead>CUPS</TableHead>
                  <TableHead className="text-right">Precio</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {procedures.map((p) => (
                  <TableRow key={p.id} className={p.active ? undefined : "opacity-60"}>
                    <TableCell className="align-top whitespace-normal">
                      <div className="font-medium">
                        {p.name} {!p.active && <Badge variant="outline">Inactivo</Badge>}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {p.perTooth ? "Por diente" : "Por atención"}
                        {p.treatsCondition && ` · resuelve: ${ODONTOGRAM_CONDITIONS[p.treatsCondition].label.toLowerCase()}`}
                      </div>
                      {isAdmin && (
                        <details className="mt-2">
                          <summary className="cursor-pointer text-xs text-primary">Editar</summary>
                          <div className="max-w-2xl pt-3">
                            <ProcedureForm procedure={p} />
                          </div>
                        </details>
                      )}
                    </TableCell>
                    <TableCell className="align-top">{PROCEDURE_CATEGORIES[p.category]}</TableCell>
                    <TableCell className="align-top tabular-nums">{p.cupsCode ?? "—"}</TableCell>
                    <TableCell className="text-right align-top tabular-nums">{formatCOP(p.price)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>Nuevo procedimiento</CardTitle>
          </CardHeader>
          <CardContent>
            <ProcedureForm />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
