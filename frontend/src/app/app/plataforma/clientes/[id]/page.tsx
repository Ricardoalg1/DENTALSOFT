import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { NativeSelect } from "@/components/native-select";
import { FormField } from "@/components/form-field";
import { ActionForm } from "@/components/platform/action-form";
import { ModulePicker } from "@/components/platform/module-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { formatCOP, formatDate, formatDateTime } from "@/lib/format";
import {
  AUDIT_ACTION_LABELS,
  CHARGE_STATUS_LABELS,
  CYCLE_LABELS,
  STATUS_LABELS,
  STATUS_VARIANT,
  formatBytes,
  type AuditRow,
  type ChargeView,
  type ClinicDetail,
  type ModuleInfo,
  type Overview,
  type PlanDto,
} from "@/lib/platform";
import type { Page } from "@/lib/types";
import {
  cancelClinic,
  changePlan,
  extendTrial,
  reactivateClinic,
  registerPayment,
  removePaymentMethod,
  resumeClinic,
  setModules,
  setPaymentMethod,
  suspendClinic,
  updateClient,
} from "../../actions";

export async function generateMetadata({ params }: PageProps<"/app/plataforma/clientes/[id]">): Promise<Metadata> {
  const { id } = await params;
  const c = await api<ClinicDetail>(`/api/platform/clinics/${id}`).catch(() => null);
  return { title: `${c?.name ?? "Cliente"} · Plataforma` };
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium tabular-nums">{children}</dd>
    </div>
  );
}

function Action({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="rounded-lg border p-3 open:bg-muted/30">
      <summary className="cursor-pointer text-sm font-medium">{title}</summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}

function Reason({ scope }: { scope: string }) {
  return <FormField name="reason" id={`reason-${scope}`} label="Motivo" required placeholder="Queda en la auditoría" />;
}

export default async function ClientDetailPage({ params }: PageProps<"/app/plataforma/clientes/[id]">) {
  const { id } = await params;
  const [c, charges, audit, plans, modules, overview] = await Promise.all([
    api<ClinicDetail>(`/api/platform/clinics/${id}`),
    api<ChargeView[]>(`/api/platform/clinics/${id}/charges`),
    api<Page<AuditRow>>(`/api/platform/audit?clinicId=${id}&size=8`),
    api<PlanDto[]>("/api/platform/plans"),
    api<ModuleInfo[]>("/api/platform/modules"),
    api<Overview>("/api/platform/overview"),
  ]);
  const s = c.subscription;
  const internal = s.planCode === "INTERNAL";
  const open = charges.filter((x) => x.status === "PENDING" || x.status === "FAILED");
  const canExtend = s.status === "TRIAL" || (s.currentPeriodEnd === null && s.trialEndsAt !== null && (s.status === "PAST_DUE" || s.status === "SUSPENDED"));
  const canReactivate = s.status === "SUSPENDED" || s.status === "CANCELLED" || s.status === "PAST_DUE";
  const canSuspend = s.status !== "SUSPENDED" && s.status !== "CANCELLED";

  return (
    <div className="grid gap-6">
      <Link href="/app/plataforma/clientes" className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Clientes
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-2xl font-semibold tracking-tight">{c.name}</h2>
        <Badge variant={STATUS_VARIANT[s.status]}>{STATUS_LABELS[s.status]}</Badge>
        {s.cancelAtPeriodEnd && <Badge variant="outline">Cancelación programada</Badge>}
        <span className="text-sm text-muted-foreground">Cliente desde {formatDate(c.createdAt)}</span>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_340px]">
        <div className="grid gap-6">
          {/* ---------- Suscripción ---------- */}
          <Card>
            <CardHeader>
              <CardTitle>Suscripción</CardTitle>
              <CardDescription>
                {s.accessAllowed
                  ? s.inGrace
                    ? `En gracia: tiene acceso hasta el ${s.accessUntil ? formatDate(s.accessUntil) : "—"}.`
                    : "La clínica puede usar la aplicación."
                  : "La clínica NO tiene acceso en este momento."}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5">
              <dl className="grid gap-4 sm:grid-cols-3">
                <Fact label="Plan">{s.planName}</Fact>
                <Fact label="Ciclo">{CYCLE_LABELS[s.billingCycle]}</Fact>
                <Fact label="Precio">{internal ? "Sin cobro" : formatCOP(s.price)}</Fact>
                <Fact label="Usuarios incluidos">{s.maxUsers ?? "Sin límite"}</Fact>
                {s.status === "TRIAL" && s.trialEndsAt && <Fact label="La prueba termina">{formatDate(s.trialEndsAt)}</Fact>}
                {s.currentPeriodEnd && <Fact label="Periodo hasta">{formatDate(s.currentPeriodEnd)}</Fact>}
                {s.pastDueSince && <Fact label="En mora desde">{formatDate(s.pastDueSince)}</Fact>}
                {s.suspendedAt && <Fact label="Suspendida">{formatDateTime(s.suspendedAt)}</Fact>}
                {s.cancelledAt && <Fact label="Cancelada">{formatDateTime(s.cancelledAt)}</Fact>}
              </dl>

              <div className="grid gap-2">
                <Action title="Cambiar de plan o precio">
                  <ActionForm action={changePlan} submit="Cambiar plan" resetOnSuccess={false}>
                    <input type="hidden" name="id" value={id} />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <NativeSelect
                        name="planCode"
                        label="Plan"
                        defaultValue={s.planCode}
                        options={Object.fromEntries(plans.filter((p) => (p.active || p.code === s.planCode) && (p.code === "INTERNAL") === internal).map((p) => [p.code, p.name]))}
                      />
                      <NativeSelect name="billingCycle" label="Ciclo" defaultValue={s.billingCycle} options={CYCLE_LABELS} />
                      <FormField name="price" label="Precio pactado (COP)" type="number" min={0} step="1" placeholder="Vacío = precio de lista" />
                      <FormField name="maxUsers" label="Usuarios incluidos" type="number" min={1} step="1" placeholder="Vacío = los del plan" />
                    </div>
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="resetModules" className="size-4 accent-[var(--color-primary)]" />
                      Reemplazar los módulos por los del plan nuevo
                    </label>
                    <p className="text-xs text-muted-foreground">El nuevo precio rige desde la próxima renovación. No se puede bajar por debajo de los usuarios activos.</p>
                  </ActionForm>
                </Action>

                {canExtend && (
                  <Action title="Extender la prueba">
                    <ActionForm action={extendTrial} submit="Extender" successMessage="Prueba extendida.">
                      <input type="hidden" name="id" value={id} />
                      <FormField name="days" label="Días a sumar" type="number" min={1} max={90} step="1" required defaultValue="7" />
                      <Reason scope="extend" />
                    </ActionForm>
                  </Action>
                )}

                {canReactivate && (
                  <Action title="Reactivar por cortesía">
                    <ActionForm action={reactivateClinic} submit="Reactivar">
                      <input type="hidden" name="id" value={id} />
                      <p className="text-xs text-muted-foreground">
                        Devuelve el acceso por unos días y anula los cobros pendientes. Si el cliente ya pagó, mejor registra el pago: eso reactiva solo.
                      </p>
                      <FormField name="courtesyDays" label="Días de acceso" type="number" min={1} max={60} step="1" required defaultValue="7" />
                      <Reason scope="reactivate" />
                    </ActionForm>
                  </Action>
                )}

                {canSuspend && (
                  <Action title="Suspender el acceso">
                    <ActionForm action={suspendClinic} submit="Suspender" variant="destructive" confirm={`¿Suspender a ${c.name}? Perderá el acceso de inmediato, también quienes tienen la sesión abierta.`}>
                      <input type="hidden" name="id" value={id} />
                      <Reason scope="suspend" />
                    </ActionForm>
                  </Action>
                )}

                {s.status !== "CANCELLED" && (
                  <Action title="Cancelar la suscripción">
                    <ActionForm action={cancelClinic} submit="Cancelar suscripción" variant="destructive" confirm={`¿Cancelar la suscripción de ${c.name}?`}>
                      <input type="hidden" name="id" value={id} />
                      <NativeSelect
                        name="when"
                        label="¿Cuándo?"
                        defaultValue="period-end"
                        options={{ "period-end": "Al final del periodo (conserva el acceso hasta entonces)", now: "Ahora mismo (pierde el acceso de inmediato)" }}
                      />
                      <Reason scope="cancel" />
                    </ActionForm>
                  </Action>
                )}

                {s.cancelAtPeriodEnd && (
                  <form action={resumeClinic.bind(null, id)}>
                    <Button type="submit" variant="outline" size="sm">
                      Deshacer la cancelación programada
                    </Button>
                  </form>
                )}
              </div>
            </CardContent>
          </Card>

          {/* ---------- Módulos ---------- */}
          <Card>
            <CardHeader>
              <CardTitle>Módulos</CardTitle>
              <CardDescription>El backend rechaza cualquier llamada a un módulo no habilitado, aunque la persona ya haya iniciado sesión.</CardDescription>
            </CardHeader>
            <CardContent>
              <ActionForm action={setModules} submit="Guardar módulos" resetOnSuccess={false}>
                <input type="hidden" name="id" value={id} />
                <ModulePicker key={s.modules.join(",")} modules={modules} defaultValue={s.modules} />
                <FormField name="reason" id="reason-modules" label="Motivo (opcional)" placeholder="Queda en la auditoría" />
              </ActionForm>
            </CardContent>
          </Card>

          {/* ---------- Cobros ---------- */}
          <Card>
            <CardHeader>
              <CardTitle>Cobros y pagos</CardTitle>
              <CardDescription>
                {c.paymentMethod ? `Cobro automático con ${c.paymentMethod.label}.` : "Sin medio de pago registrado: los pagos se registran a mano."}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5">
              {charges.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Periodo</TableHead>
                        <TableHead>Valor</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead>Detalle</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {charges.map((x) => (
                        <TableRow key={x.id}>
                          <TableCell className="text-sm tabular-nums">
                            {formatDate(x.periodStart)} – {formatDate(x.periodEnd)}
                          </TableCell>
                          <TableCell className="tabular-nums">{formatCOP(x.amount)}</TableCell>
                          <TableCell>
                            <Badge variant={x.status === "PAID" ? "default" : x.status === "FAILED" ? "destructive" : "outline"}>{CHARGE_STATUS_LABELS[x.status] ?? x.status}</Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {x.status === "PAID" && `${x.method === "GATEWAY" ? "Pasarela" : "Manual"}${x.reference ? ` · ${x.reference}` : ""}${x.paidAt ? ` · ${formatDate(x.paidAt)}` : ""}`}
                            {(x.status === "PENDING" || x.status === "FAILED") && (
                              <>
                                {x.attempts > 0 && `${x.attempts} intento(s)`}
                                {x.failureReason && ` · ${x.failureReason}`}
                                {x.status === "PENDING" && x.nextAttemptAt && c.paymentMethod && ` · próximo intento ${formatDate(x.nextAttemptAt)}`}
                              </>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Aún no hay cobros.</p>
              )}

              {!internal && (
                <div className="grid gap-2">
                  <Action title="Registrar un pago recibido (transferencia, consignación)">
                    <ActionForm action={registerPayment} submit="Registrar pago">
                      <input type="hidden" name="id" value={id} />
                      <FormField name="reference" label="Referencia del pago" required placeholder="Número de transferencia, comprobante…" />
                      {open.length > 0 && (
                        <NativeSelect
                          name="chargeId"
                          label="¿Qué cobro paga?"
                          defaultValue=""
                          placeholder="El más antiguo pendiente"
                          options={Object.fromEntries(open.map((x) => [x.id, `${formatDate(x.periodStart)} – ${formatDate(x.periodEnd)} · ${formatCOP(x.amount)}`]))}
                        />
                      )}
                      <p className="text-xs text-muted-foreground">
                        Si el cliente estaba suspendido, el periodo empieza hoy. Sin cobros pendientes, se registra como pago adelantado del siguiente periodo. Cada referencia se acepta una sola vez.
                      </p>
                    </ActionForm>
                  </Action>

                  <Action title="Medio de pago para el cobro automático">
                    <div className="grid gap-3">
                      {c.paymentMethod && (
                        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                          <span>
                            {c.paymentMethod.label} <span className="text-muted-foreground">({c.paymentMethod.provider})</span>
                          </span>
                          <form action={removePaymentMethod.bind(null, id)}>
                            <Button type="submit" variant="outline" size="sm">
                              Quitar
                            </Button>
                          </form>
                        </div>
                      )}
                      <ActionForm action={setPaymentMethod} submit={c.paymentMethod ? "Reemplazar" : "Guardar medio de pago"}>
                        <input type="hidden" name="id" value={id} />
                        <FormField name="tokenRef" label="Token de la pasarela" required autoComplete="off" />
                        <FormField name="label" label="Etiqueta para reconocerlo" required placeholder="Visa ···· 4242" />
                        <p className="text-xs text-muted-foreground">
                          Solo se guarda el token que entrega la pasarela, nunca datos de tarjeta. El token no vuelve a mostrarse.
                          {overview.gatewayMode === "simulated" && " En modo simulado, un token que contenga «fail» hace que el cobro sea rechazado (útil para probar)."}
                        </p>
                      </ActionForm>
                    </div>
                  </Action>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6">
          {/* ---------- Datos del cliente ---------- */}
          <Card>
            <CardHeader>
              <CardTitle>Datos del cliente</CardTitle>
            </CardHeader>
            <CardContent>
              <ActionForm action={updateClient} submit="Guardar datos" resetOnSuccess={false}>
                <input type="hidden" name="id" value={id} />
                <FormField name="clinicName" label="Nombre de la clínica" required defaultValue={c.name} />
                <FormField name="nit" label="NIT" defaultValue={c.nit ?? ""} />
                <FormField name="legalName" label="Razón social" defaultValue={c.client.legalName ?? ""} />
                <FormField name="city" label="Ciudad" defaultValue={c.client.city ?? ""} />
                <FormField name="contactName" label="Contacto" defaultValue={c.client.contactName ?? ""} />
                <FormField name="contactEmail" label="Correo de contacto" type="email" defaultValue={c.client.contactEmail ?? ""} />
                <FormField name="contactPhone" label="Teléfono" defaultValue={c.client.contactPhone ?? ""} />
                <div className="grid gap-1.5">
                  <Label htmlFor="internalNotes">Notas internas</Label>
                  <Textarea key={c.client.internalNotes ?? ""} id="internalNotes" name="internalNotes" rows={4} defaultValue={c.client.internalNotes ?? ""} />
                  <p className="text-xs text-muted-foreground">Solo las ve el equipo de Occlus. Origen: {c.client.source === "MANUAL" ? "alta manual" : c.client.source}.</p>
                </div>
              </ActionForm>
            </CardContent>
          </Card>

          {/* ---------- Uso ---------- */}
          <Card size="sm">
            <CardHeader>
              <CardTitle>Uso</CardTitle>
              <CardDescription>Solo conteos: el panel no ve datos de pacientes.</CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-3">
                <Fact label="Usuarios activos">
                  {c.usage.usersActive}
                  {s.maxUsers ? ` / ${s.maxUsers}` : ""}
                </Fact>
                <Fact label="Sedes">{c.usage.sites}</Fact>
                <Fact label="Pacientes">{c.usage.patients}</Fact>
                <Fact label="Citas (30 días)">{c.usage.appointments30d}</Fact>
                <Fact label="Archivos">{formatBytes(c.usage.storageBytes)}</Fact>
                <Fact label="Última actividad">{c.usage.lastActivityAt ? formatDate(c.usage.lastActivityAt) : "—"}</Fact>
              </dl>
            </CardContent>
          </Card>

          <Card size="sm">
            <CardHeader>
              <CardTitle>Administradores</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="grid gap-2 text-sm">
                {c.admins.map((a) => (
                  <li key={a.id}>
                    <span className="font-medium">{a.fullName}</span> {!a.active && <Badge variant="outline">Inactivo</Badge>}
                    <div className="text-xs text-muted-foreground">{a.email}</div>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-muted-foreground">Por seguridad el panel no restablece contraseñas ni entra como el cliente.</p>
            </CardContent>
          </Card>

          <Card size="sm">
            <CardHeader>
              <CardTitle>Actividad reciente</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              {audit.content.length === 0 && <p className="text-sm text-muted-foreground">Sin movimientos.</p>}
              <ul className="grid gap-2 text-sm">
                {audit.content.map((a) => (
                  <li key={a.id}>
                    <span className="font-medium">{AUDIT_ACTION_LABELS[a.action] ?? a.action}</span>
                    <div className="text-xs text-muted-foreground">
                      {a.actorName ?? "Sistema"} · {formatDateTime(a.at)}
                    </div>
                  </li>
                ))}
              </ul>
              <Link href={`/app/plataforma/auditoria?clinicId=${id}`} className="text-sm text-primary hover:underline">
                Ver toda la auditoría
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
