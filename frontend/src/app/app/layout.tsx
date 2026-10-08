import { LogOut } from "lucide-react";
import { logout } from "@/app/(auth)/actions";
import { Nav } from "@/components/app/nav";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { getMe } from "@/lib/api";
import { ROLE_LABELS, canCollect, canReadClinical } from "@/lib/types";

export default async function AppLayout({ children }: LayoutProps<"/app">) {
  const me = await getMe();
  return (
    <div className="flex min-h-svh flex-col md:flex-row">
      <aside className="flex shrink-0 flex-col gap-6 border-b bg-sidebar p-4 md:w-60 md:border-r md:border-b-0">
        <div>
          <Logo />
          <p className="mt-1 truncate text-xs text-muted-foreground">{me.clinicName}</p>
        </div>
        <Nav isAdmin={me.role === "ADMIN"} clinical={canReadClinical(me)} cash={canCollect(me)} messaging={me.role === "ADMIN" || me.role === "RECEPTION"} />
        <div className="mt-auto grid gap-2 border-t pt-4">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{me.fullName}</p>
            <p className="text-xs text-muted-foreground">{ROLE_LABELS[me.role]}</p>
          </div>
          <form action={logout}>
            <Button type="submit" variant="ghost" size="sm" className="w-full justify-start">
              <LogOut /> Cerrar sesión
            </Button>
          </form>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-4 md:p-8">{children}</main>
    </div>
  );
}
