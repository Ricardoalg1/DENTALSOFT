import { LogOut } from "lucide-react";
import { logout } from "@/app/(auth)/actions";
import { AgreementForm } from "@/components/app/agreement-form";
import { AgreementText } from "@/components/app/agreement-text";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";

/** Primer ingreso de una clínica (o nueva versión del texto): el administrador debe aceptar el acuerdo. */
export function AgreementScreen({ clinicName, canAccept }: { clinicName: string; canAccept: boolean }) {
  return (
    <main className="grid min-h-svh place-items-center p-4">
      <div className="grid w-full max-w-2xl gap-5 rounded-2xl border bg-card p-6 sm:p-8">
        <Logo />
        <div className="grid gap-1">
          <h1 className="text-xl font-semibold tracking-tight">Antes de empezar, {clinicName}</h1>
          <p className="text-sm text-muted-foreground">
            {canAccept
              ? "Occlus tratará los datos de tus pacientes por cuenta de tu clínica. Lee y acepta este acuerdo para continuar."
              : "El administrador de la clínica debe aceptar el acuerdo de tratamiento de datos antes de que el equipo pueda usar Occlus. Avísale para que ingrese y lo acepte."}
          </p>
        </div>
        <div className="max-h-[50vh] overflow-y-auto rounded-lg border p-4">
          <AgreementText />
        </div>
        {canAccept && <AgreementForm />}
        <form action={logout}>
          <Button type="submit" variant="ghost" size="sm" className="w-full">
            <LogOut /> Cerrar sesión
          </Button>
        </form>
      </div>
    </main>
  );
}
