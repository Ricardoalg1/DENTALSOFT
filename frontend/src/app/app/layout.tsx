import Link from "next/link";
import { LogOut, UserCog, Search, Bell, ChevronDown } from "lucide-react";
import { logout } from "@/app/(auth)/actions";
import { ForcedPasswordScreen, SuspendedScreen } from "@/components/app/blocked-screen";
import { Nav } from "@/components/app/nav";
import { SubscriptionBanners } from "@/components/app/subscription-banners";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { platformAccess } from "@/lib/marketing";
import { unstable_rethrow } from "next/navigation";
import { api, getMe } from "@/lib/api";
import type { SubscriptionState } from "@/lib/platform";
import { ROLE_LABELS, canCollect, canReadClinical } from "@/lib/types";

export default async function AppLayout({ children }: LayoutProps<"/app">) {
  const me = await getMe();
  if (me.mustChangePassword) return <ForcedPasswordScreen name={me.fullName} />;
  if (!me.subscription || !me.subscription.accessAllowed) {
    // El administrador puede pagar desde aquí mismo y reactivarse sin ayuda de nadie.
    const payment =
      me.role === "ADMIN"
        ? await api<SubscriptionState>("/api/subscription").catch((e) => {
            unstable_rethrow(e);
            return null;
          })
        : null;
    return <SuspendedScreen clinicName={me.clinicName} message={me.subscription?.inactiveMessage ?? null} payment={payment} />;
  }
  return (
    <div className="reference-app flex min-h-svh flex-col md:flex-row">
      <aside className="reference-sidebar flex shrink-0 flex-col gap-6 bg-sidebar p-4 md:w-60">
        <div>
          <Logo />
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {me.clinicName}
          </p>
        </div>
        <Nav
          isAdmin={me.role === "ADMIN"}
          clinical={canReadClinical(me)}
          cash={canCollect(me)}
          platform={me.role === "ADMIN" && (await platformAccess())}
          messaging={me.role === "ADMIN" || me.role === "RECEPTION"}
          modules={me.modules}
          platformAdmin={me.platformAdmin}
        />
        <div className="mt-auto grid gap-2 border-t pt-4">
          <ThemeToggle />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{me.fullName}</p>
            <p className="text-xs text-muted-foreground">
              {ROLE_LABELS[me.role]}
            </p>
          </div>
          <Link
            href="/app/cuenta"
            className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <UserCog className="size-4" /> Mi cuenta
          </Link>
          <form action={logout}>
            <Button
              type="submit"
              variant="ghost"
              size="sm"
              className="w-full justify-start"
            >
              <LogOut /> Cerrar sesión
            </Button>
          </form>
        </div>
      </aside>
      <main className="reference-main min-w-0 flex-1 p-4 md:p-8">
        <div className="reference-topbar mb-7 flex flex-wrap items-center justify-between gap-4">
          <form action="/app/pacientes" role="search" className="flex max-w-lg flex-1 items-center gap-3 rounded-xl border bg-card px-4 py-2 shadow-sm"><Search className="size-4 text-muted-foreground" aria-hidden="true" /><input name="q" aria-label="Buscar pacientes" placeholder="Buscar pacientes por nombre o documento…" className="min-w-0 flex-1 border-0 bg-transparent text-sm outline-none" /><button type="submit" className="text-xs font-medium text-primary">Buscar</button></form>
          <div className="flex items-center gap-4">{me.platformAdmin && <Link href="/app/plataforma/notificaciones" aria-label="Notificaciones de plataforma" className="rounded-full border bg-card p-3"><Bell className="size-5" aria-hidden="true" /></Link>}<Link href="/app/cuenta" className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-full bg-foreground font-medium text-background">{me.fullName.trim().slice(0,1)}</span><span className="hidden text-sm sm:block"><span className="block font-medium">{me.fullName}</span><span className="text-xs text-muted-foreground">{ROLE_LABELS[me.role]}</span></span><ChevronDown className="size-4" aria-hidden="true" /></Link></div>
        </div>
        <SubscriptionBanners me={me} />
        {children}
      </main>
    </div>
  );
}
