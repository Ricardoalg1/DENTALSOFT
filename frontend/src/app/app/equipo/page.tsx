import { Search, UsersRound } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, getMe } from "@/lib/api";
import { ROLE_LABELS, type User } from "@/lib/types";
import { setUserActive, setUserProfessional } from "./actions";
import { CreateUserForm } from "./create-user-form";

export const metadata: Metadata = { title: "Equipo" };

export default async function TeamPage({ searchParams }: PageProps<"/app/equipo">) {
  const me = await getMe();
  if (me.role !== "ADMIN") {
    return <p className="text-muted-foreground">Solo los administradores pueden gestionar el equipo.</p>;
  }
  const query = await searchParams;
  const q = typeof query.q === "string" ? query.q.trim().slice(0, 160) : "";
  const allUsers = await api<User[]>("/api/users");
  const users = allUsers.filter(user => `${user.fullName} ${user.email} ${ROLE_LABELS[user.role]}`.toLocaleLowerCase("es").includes(q.toLocaleLowerCase("es")));

  return (
    <div className="grid max-w-6xl gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Equipo</h1>
        <p className="text-muted-foreground">Usuarios con acceso a tu clínica y su rol.</p>
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.8fr)_minmax(300px,1fr)]">
        <Card>
          <CardContent className="overflow-x-auto">
            <form className="mb-6 flex items-center gap-3" role="search"><Search className="size-5 text-muted-foreground" aria-hidden="true" /><Input name="q" defaultValue={q} aria-label="Buscar en el equipo" placeholder="Buscar por nombre, correo o rol…" /><Button type="submit" variant="outline">Buscar</Button></form>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Rol</TableHead>
                  <TableHead>Agenda</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div className="flex items-center gap-2 font-medium"><span className="reference-icon reference-icon-blue !size-9"><UsersRound className="!size-4" aria-hidden="true" /></span>{u.fullName}</div>
                      <div className="text-xs text-muted-foreground">{u.email}</div>
                    </TableCell>
                    <TableCell>{ROLE_LABELS[u.role]}</TableCell>
                    <TableCell>
                      <form action={setUserProfessional.bind(null, u.id, !u.professional)}>
                        <Button
                          type="submit"
                          variant="ghost"
                          size="sm"
                          title={u.professional ? "Quitar de la agenda" : "Mostrar en la agenda"}
                        >
                          {u.professional ? "Atiende pacientes" : "No atiende"}
                        </Button>
                      </form>
                    </TableCell>
                    <TableCell>
                      <Badge variant={u.active ? "secondary" : "outline"}>{u.active ? "Activo" : "Inactivo"}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {u.id !== me.id && (
                        <form action={setUserActive.bind(null, u.id, !u.active)}>
                          <Button type="submit" variant="ghost" size="sm">
                            {u.active ? "Desactivar" : "Activar"}
                          </Button>
                        </form>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>{users.length === 0 && <p className="py-8 text-center text-muted-foreground">No hay usuarios que coincidan con la búsqueda.</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Nuevo usuario</CardTitle>
          </CardHeader>
          <CardContent>
            <CreateUserForm />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
