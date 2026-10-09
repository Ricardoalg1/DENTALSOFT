import { LockKeyhole, LogOut } from "lucide-react";
import { logout } from "@/app/(auth)/actions";
import { Logo } from "@/components/logo";
import { ChangePasswordForm } from "@/components/app/change-password-form";
import { Button } from "@/components/ui/button";

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-svh place-items-center p-4">
      <div className="grid w-full max-w-md gap-6 rounded-2xl border bg-card p-8">
        <Logo />
        {children}
        <form action={logout}>
          <Button type="submit" variant="ghost" size="sm" className="w-full">
            <LogOut /> Cerrar sesión
          </Button>
        </form>
      </div>
    </main>
  );
}

/** Suscripción suspendida, cancelada o vencida: no se muestra nada de la aplicación. */
export function SuspendedScreen({ clinicName, message }: { clinicName: string; message: string | null }) {
  return (
    <Frame>
      <div className="grid gap-3">
        <LockKeyhole className="size-8 text-muted-foreground" aria-hidden />
        <h1 className="text-xl font-semibold tracking-tight">El acceso de {clinicName} está pausado</h1>
        <p className="text-sm text-muted-foreground">
          {message ?? "Tu clínica no tiene una suscripción activa. Comunícate con Occlus."}
        </p>
        <p className="text-sm text-muted-foreground">
          Tus datos están seguros y no se pierden. Cuando se regularice, todo estará tal como lo dejaste.
        </p>
      </div>
    </Frame>
  );
}

/** Primer ingreso con la contraseña temporal que entregó el equipo de Occlus. */
export function ForcedPasswordScreen({ name }: { name: string }) {
  return (
    <Frame>
      <div className="grid gap-1">
        <h1 className="text-xl font-semibold tracking-tight">Hola, {name.split(" ")[0]}</h1>
        <p className="text-sm text-muted-foreground">
          Entraste con una contraseña temporal. Elige una propia para continuar: nadie más la conocerá.
        </p>
      </div>
      <ChangePasswordForm forced />
    </Frame>
  );
}
