import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, getMe } from "@/lib/api";
import { ROLE_LABELS, type User } from "@/lib/types";
import { setUserActive } from "./actions";
import { CreateUserForm } from "./create-user-form";

export const metadata: Metadata = { title: "Equipo" };

export default async function TeamPage() {
  const me = await getMe();
  if (me.role !== "ADMIN") {
    return <p className="text-muted-foreground">Solo los administradores pueden gestionar el equipo.</p>;
  }
  const users = await api<User[]>("/api/users");

  return (
    <div className="grid max-w-5xl gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Equipo</h1>
        <p className="text-muted-foreground">Usuarios con acceso a tu clínica y su rol.</p>
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Rol</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div className="font-medium">{u.fullName}</div>
                      <div className="text-xs text-muted-foreground">{u.email}</div>
                    </TableCell>
                    <TableCell>{ROLE_LABELS[u.role]}</TableCell>
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
            </Table>
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
