import { EmptyState } from "@/components/app/reference-art";
import type { Metadata } from "next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, getMe } from "@/lib/api";
import type { Site } from "@/lib/types";
import { CreateSiteForm } from "./create-site-form";

export const metadata: Metadata = { title: "Sedes" };

export default async function SitesPage() {
  const [me, sites] = await Promise.all([getMe(), api<Site[]>("/api/sites")]);
  const isAdmin = me.role === "ADMIN";

  return (
    <div className="grid max-w-6xl gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Sedes</h1>
        <p className="text-muted-foreground">Consultorios o sucursales de tu clínica.</p>
      </div>
      <div className={isAdmin ? "grid items-start gap-6 lg:grid-cols-[minmax(0,1.8fr)_minmax(300px,1fr)]" : "grid gap-6"}>
        <Card>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Dirección</TableHead>
                  <TableHead>Ciudad</TableHead>
                  <TableHead>Teléfono</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sites.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell>{s.address ?? "—"}</TableCell>
                    <TableCell>{s.city ?? "—"}</TableCell>
                    <TableCell>{s.phone ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {sites.length === 0 && <EmptyState kind="sites" title="Aún no tienes sedes registradas" description="Agrega tu primera sede para comenzar a gestionar tu clínica." />}
          </CardContent>
        </Card>
        {isAdmin && (
          <Card>
            <CardHeader>
              <CardTitle>Nueva sede</CardTitle>
            </CardHeader>
            <CardContent>
              <CreateSiteForm />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
