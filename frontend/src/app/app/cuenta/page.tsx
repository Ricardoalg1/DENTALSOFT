import { BrandHeader } from "@/components/app/document-identity";
import { DocumentSettings } from "@/components/app/document-settings";
import type { DocumentBranding, DocumentProfile } from "@/lib/documents";
import type { Metadata } from "next";
import { ChangePasswordForm } from "@/components/app/change-password-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SessionsCard } from "@/components/app/sessions-card";
import { TwoFactorPanel, type TwoFactorStatus } from "@/components/app/two-factor-panel";
import { SubscriptionCard } from "@/components/app/subscription-card";
import { api, getMe } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { MODULE_LABELS, STATUS_LABELS, STATUS_VARIANT, type SubscriptionState } from "@/lib/platform";
import { ROLE_LABELS } from "@/lib/types";

export const metadata: Metadata = { title: "Mi cuenta" };

export default async function AccountPage({ searchParams }: PageProps<"/app/cuenta">) {
  const me = await getMe();
  const params = await searchParams;
  const changed = params.cambiada === "1";
  const twoFactorNeeded = params["dos-pasos"] === "requerida";
  const sub = me.subscription;
  const billing = me.role === "ADMIN" ? await api<SubscriptionState>("/api/subscription") : null;
  const [brand, profile, twoFactor] = await Promise.all([api<DocumentBranding>("/api/clinic/document-branding"),api<DocumentProfile>("/api/users/me/document-profile"),api<TwoFactorStatus>("/api/auth/2fa")]);
  return (
    <div className="grid max-w-3xl gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Mi cuenta</h1>
        <p className="text-muted-foreground">
          {me.fullName} · {me.email} · {ROLE_LABELS[me.role]}
        </p>
      </div>

      {billing && <SubscriptionCard state={billing} modules={me.modules} />}

      {sub && !billing && (
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

      <DocumentSettings brand={brand} profile={profile} admin={me.role === "ADMIN"} preview={<BrandHeader brand={brand} />} />
      {twoFactor.eligible && <Card id="dos-pasos">
        <CardHeader>
          <CardTitle>Verificación en dos pasos</CardTitle>
          <CardDescription>Exclusiva del administrador de la plataforma. Además de tu contraseña, se te pedirá un código de tu teléfono al ingresar.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {twoFactorNeeded && !twoFactor.enabled && (
            <p role="status" className="text-sm font-medium text-destructive">Actívala para poder usar el panel de plataforma.</p>
          )}
          <TwoFactorPanel status={twoFactor} />
        </CardContent>
      </Card>}

      <SessionsCard />

      <Card>
        <CardHeader>
          <CardTitle>Cambiar contraseña</CardTitle>
          <CardDescription>Usa al menos 10 caracteres. No la compartas con nadie del equipo.</CardDescription>
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
