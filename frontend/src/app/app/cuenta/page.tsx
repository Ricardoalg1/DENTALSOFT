import type { Metadata } from "next";
import { ChangePasswordForm } from "@/components/app/change-password-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getMe } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { MODULE_LABELS, STATUS_LABELS, STATUS_VARIANT } from "@/lib/platform";
import { ROLE_LABELS } from "@/lib/types";

export const metadata: Metadata = { title: "Mi cuenta" };

export default async function AccountPage({ searchParams }: PageProps<"/app/cuenta">) {
  const me = await getMe();
  const changed = (await searchParams).cambiada === "1";
  const sub = me.subscription;
  return (
    <div className="grid max-w-3xl gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Mi cuenta</h1>
        <p className="text-muted-foreground">
          {me.fullName} · {me.email} · {ROLE_LABELS[me.role]}
        </p>
      </div>

      {sub && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Plan {sub.planName}
              <Badge variant={STATUS_VARIANT[sub.status]}>{STATUS_LABELS[sub.status]}</Badge>
            </CardTitle>
            <CardDescription>
              {sub.status === "TRIAL" && sub.trialEndsAt && `La prueba termina el ${formatDate(sub.trialEndsAt)}.`}
              {sub.status !== "TRIAL" && sub.currentPeriodEnd && `Periodo vigente hasta el ${formatDate(sub.currentPeriodEnd)}.`}
              {sub.cancelAtPeriodEnd && " La suscripción no se renovará."}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            <p className="font-medium">Módulos incluidos</p>
            <ul className="flex flex-wrap gap-2">
              {me.modules.length ? (
                me.modules.map((m) => (
                  <li key={m}>
                    <Badge variant="outline">{MODULE_LABELS[m]}</Badge>
                  </li>
                ))
              ) : (
                <li className="text-muted-foreground">Solo las funciones básicas (pacientes y agenda).</li>
              )}
            </ul>
            <p className="text-muted-foreground">Para cambiar de plan o agregar módulos, escribe al equipo de Occlus.</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Cambiar contraseña</CardTitle>
          <CardDescription>Usa al menos 8 caracteres. No la compartas con nadie del equipo.</CardDescription>
        </CardHeader>
        <CardContent>
          {changed && (
            <p role="status" className="mb-4 text-sm text-primary">
              Contraseña actualizada.
            </p>
          )}
          <ChangePasswordForm />
        </CardContent>
      </Card>
    </div>
  );
}
