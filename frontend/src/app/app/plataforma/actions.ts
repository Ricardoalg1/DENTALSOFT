"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/forms";
import type { CreatedClient, PlatformState } from "@/lib/platform";

// ---------- utilidades ----------

const reason = z.string().trim().min(3, "Indica el motivo (mínimo 3 letras)").max(300, "El motivo es muy largo");
const optional = (max: number) => z.string().trim().max(max).optional().transform((v) => (v ? v : undefined));
const optionalNumber = z.preprocess(
  (v) => (v === "" || v == null ? undefined : Number(v)),
  z.number("Debe ser un número").min(0, "No puede ser negativo").optional(),
);
const optionalInt = z.preprocess(
  (v) => (v === "" || v == null ? undefined : Number(v)),
  z.number("Debe ser un número").int("Debe ser un número entero").positive("Debe ser mayor que cero").optional(),
);
const uuid = z.uuid();
const MODULE_KEYS = ["CLINICAL_RECORD", "TREATMENTS_CASH", "BILLING_RIPS", "INVENTORY", "REPORTS", "MESSAGING"] as const;
const modules = z.array(z.enum(MODULE_KEYS));

function parse<T extends z.ZodType>(schema: T, data: Record<string, unknown>): { data: z.infer<T> } | { state: PlatformState } {
  const r = schema.safeParse(data);
  if (r.success) return { data: r.data };
  const flat = z.flattenError(r.error as z.ZodError<Record<string, unknown>>);
  return { state: { fieldErrors: flat.fieldErrors as Record<string, string[]>, error: flat.formErrors[0] } };
}

function fields(formData: FormData, multi: string[] = []) {
  const out: Record<string, unknown> = {};
  formData.forEach((_, k) => {
    out[k] = multi.includes(k) ? formData.getAll(k).map(String) : formData.get(k);
  });
  for (const k of multi) out[k] ??= [];
  return out;
}

async function run(fn: () => Promise<unknown>, paths: string[], message?: string): Promise<PlatformState> {
  try {
    await fn();
  } catch (e) {
    unstable_rethrow(e);
    return { error: errorMessage(e) };
  }
  for (const p of paths) revalidatePath(p);
  return { ok: true, message };
}

const post = (path: string, body?: unknown) =>
  api(path, { method: "POST", ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const put = (path: string, body: unknown) => api(path, { method: "PUT", body: JSON.stringify(body) });

const clinicPaths = (id: string) => [`/app/plataforma/clientes/${id}`, "/app/plataforma/clientes", "/app/plataforma"];

// ---------- clientes ----------

const createSchema = z.object({
  clinicName: z.string().trim().min(2, "Nombre de la clínica requerido").max(150),
  nit: optional(20),
  legalName: optional(150),
  contactName: optional(150),
  contactEmail: z.email("Correo de contacto inválido").optional().or(z.literal("").transform(() => undefined)),
  contactPhone: optional(30),
  city: optional(80),
  notes: optional(2000),
  adminName: z.string().trim().min(2, "Nombre del administrador requerido").max(150),
  adminEmail: z.email("Correo del administrador inválido"),
  planCode: z.string().min(1, "Elige un plan"),
  billingCycle: z.enum(["MONTHLY", "ANNUAL"]),
  price: optionalNumber,
  maxUsers: optionalInt,
  customModules: z.string().optional(),
  modules,
  trialDays: z.preprocess((v) => Number(v), z.number("Días de prueba inválidos").int().min(0).max(90, "Máximo 90 días")),
  paymentReference: optional(200),
  leadId: z.preprocess((v) => (v === "" ? undefined : v), uuid.optional()),
});

export async function createClient(_: PlatformState, formData: FormData): Promise<PlatformState> {
  const p = parse(createSchema, fields(formData, ["modules"]));
  if ("state" in p) return p.state;
  const { customModules, modules: mods, ...rest } = p.data;
  if (rest.trialDays === 0 && !rest.paymentReference) {
    return { fieldErrors: { paymentReference: ["Sin prueba, indica la referencia del primer pago recibido"] } };
  }
  try {
    const created = await api<CreatedClient>("/api/platform/clinics", {
      method: "POST",
      body: JSON.stringify({ ...rest, modules: customModules ? mods : undefined }),
    });
    revalidatePath("/app/plataforma/clientes");
    revalidatePath("/app/plataforma");
    return { ok: true, created };
  } catch (e) {
    unstable_rethrow(e);
    return { error: errorMessage(e) };
  }
}

const profileSchema = z.object({
  id: uuid,
  clinicName: z.string().trim().min(2, "Nombre de la clínica requerido").max(150),
  nit: optional(20),
  legalName: optional(150),
  contactName: optional(150),
  contactEmail: z.email("Correo de contacto inválido").optional().or(z.literal("").transform(() => undefined)),
  contactPhone: optional(30),
  city: optional(80),
  internalNotes: optional(2000),
});

export async function updateClient(_: PlatformState, formData: FormData): Promise<PlatformState> {
  const p = parse(profileSchema, fields(formData));
  if ("state" in p) return p.state;
  const { id, ...body } = p.data;
  return run(() => put(`/api/platform/clinics/${id}/client`, body), clinicPaths(id), "Datos del cliente guardados.");
}

const modulesSchema = z.object({ id: uuid, modules, reason: optional(300) });

export async function setModules(_: PlatformState, formData: FormData): Promise<PlatformState> {
  const p = parse(modulesSchema, fields(formData, ["modules"]));
  if ("state" in p) return p.state;
  const { id, ...body } = p.data;
  return run(() => put(`/api/platform/clinics/${id}/modules`, body), clinicPaths(id), "Módulos actualizados. Ya rigen para la clínica.");
}

const planChangeSchema = z.object({
  id: uuid,
  planCode: z.string().min(1, "Elige un plan"),
  billingCycle: z.enum(["MONTHLY", "ANNUAL"]),
  price: optionalNumber,
  maxUsers: optionalInt,
  resetModules: z.string().optional(),
});

export async function changePlan(_: PlatformState, formData: FormData): Promise<PlatformState> {
  const p = parse(planChangeSchema, fields(formData));
  if ("state" in p) return p.state;
  const { id, resetModules, ...body } = p.data;
  return run(
    () => post(`/api/platform/clinics/${id}/subscription/plan`, { ...body, resetModules: !!resetModules }),
    clinicPaths(id),
    "Plan actualizado. El nuevo precio rige desde la próxima renovación.",
  );
}

const extendSchema = z.object({
  id: uuid,
  days: z.preprocess((v) => Number(v), z.number("Indica los días").int().min(1, "Mínimo 1 día").max(90, "Máximo 90 días")),
  reason,
});

export async function extendTrial(_: PlatformState, formData: FormData): Promise<PlatformState> {
  const p = parse(extendSchema, fields(formData));
  if ("state" in p) return p.state;
  const { id, ...body } = p.data;
  return run(() => post(`/api/platform/clinics/${id}/subscription/extend-trial`, body), clinicPaths(id), "Prueba extendida.");
}

const reasonSchema = z.object({ id: uuid, reason });

export async function suspendClinic(_: PlatformState, formData: FormData): Promise<PlatformState> {
  const p = parse(reasonSchema, fields(formData));
  if ("state" in p) return p.state;
  const { id, ...body } = p.data;
  return run(() => post(`/api/platform/clinics/${id}/subscription/suspend`, body), clinicPaths(id), "Cliente suspendido. Perdió el acceso de inmediato.");
}

const reactivateSchema = z.object({
  id: uuid,
  courtesyDays: z.preprocess((v) => Number(v), z.number("Indica los días").int().min(1, "Mínimo 1 día").max(60, "Máximo 60 días")),
  reason,
});

export async function reactivateClinic(_: PlatformState, formData: FormData): Promise<PlatformState> {
  const p = parse(reactivateSchema, fields(formData));
  if ("state" in p) return p.state;
  const { id, ...body } = p.data;
  return run(() => post(`/api/platform/clinics/${id}/subscription/reactivate`, body), clinicPaths(id), "Cliente reactivado.");
}

const cancelSchema = z.object({ id: uuid, when: z.enum(["now", "period-end"]), reason });

export async function cancelClinic(_: PlatformState, formData: FormData): Promise<PlatformState> {
  const p = parse(cancelSchema, fields(formData));
  if ("state" in p) return p.state;
  const { id, when, reason: why } = p.data;
  return run(
    () => post(`/api/platform/clinics/${id}/subscription/cancel`, { immediately: when === "now", reason: why }),
    clinicPaths(id),
    when === "now" ? "Suscripción cancelada." : "Cancelación programada para el fin del periodo.",
  );
}

export async function resumeClinic(id: string) {
  await post(`/api/platform/clinics/${uuid.parse(id)}/subscription/resume`);
  clinicPaths(id).forEach((p) => revalidatePath(p));
}

// ---------- cobros ----------

const methodSchema = z.object({
  id: uuid,
  provider: z.enum(["WOMPI", "SIMULATED"]).optional(),
  tokenRef: z.string().trim().min(3, "Pega el token que entregó la pasarela").max(200),
  label: z.string().trim().min(2, "Escribe una etiqueta (ej. Visa ···· 4242)").max(80),
});

export async function setPaymentMethod(_: PlatformState, formData: FormData): Promise<PlatformState> {
  const p = parse(methodSchema, fields(formData));
  if ("state" in p) return p.state;
  const { id, ...body } = p.data;
  return run(() => put(`/api/platform/clinics/${id}/payment-method`, body), clinicPaths(id), "Medio de pago guardado.");
}

export async function removePaymentMethod(id: string) {
  await api(`/api/platform/clinics/${uuid.parse(id)}/payment-method`, { method: "DELETE" });
  clinicPaths(id).forEach((p) => revalidatePath(p));
}

const paymentSchema = z.object({
  id: uuid,
  reference: z.string().trim().min(3, "Indica la referencia del pago (mínimo 3 caracteres)").max(200),
  chargeId: z.preprocess((v) => (v === "" ? undefined : v), uuid.optional()),
});

export async function registerPayment(_: PlatformState, formData: FormData): Promise<PlatformState> {
  const p = parse(paymentSchema, fields(formData));
  if ("state" in p) return p.state;
  const { id, ...body } = p.data;
  return run(() => post(`/api/platform/clinics/${id}/payments`, body), clinicPaths(id), "Pago registrado.");
}

export async function runEngine(): Promise<PlatformState> {
  try {
    const r = await api<{ clinics: number; attempts: number; paid: number; failed: number }>("/api/platform/engine/run", { method: "POST" });
    revalidatePath("/app/plataforma", "layout");
    return {
      ok: true,
      message: `Revisé ${r.clinics} cliente(s): ${r.attempts} cobro(s) intentado(s), ${r.paid} aprobado(s), ${r.failed} rechazado(s).`,
    };
  } catch (e) {
    unstable_rethrow(e);
    return { error: errorMessage(e) };
  }
}

// ---------- notificaciones ----------

export async function markRead(id: string) {
  await post(`/api/platform/notifications/${uuid.parse(id)}/read`);
  revalidatePath("/app/plataforma", "layout");
}

export async function markAllRead() {
  await post("/api/platform/notifications/read-all");
  revalidatePath("/app/plataforma", "layout");
}

// ---------- planes ----------

const planSchema = z.object({
  code: z.string().min(1).max(20),
  name: z.string().trim().min(2, "Nombre requerido").max(60),
  maxUsers: optionalInt,
  priceMonthly: optionalNumber,
  priceAnnual: optionalNumber,
  modules,
  active: z.string().optional(),
});

export async function updatePlan(_: PlatformState, formData: FormData): Promise<PlatformState> {
  const p = parse(planSchema, fields(formData, ["modules"]));
  if ("state" in p) return p.state;
  const { code, active, ...body } = p.data;
  return run(
    () => put(`/api/platform/plans/${encodeURIComponent(code)}`, { ...body, active: !!active }),
    ["/app/plataforma/planes"],
    "Plan actualizado. Aplica a clientes nuevos; los actuales conservan su precio y módulos.",
  );
}

// ---------- avisos ----------

const announceSchema = z.object({
  clinicId: z.preprocess((v) => (v === "" ? undefined : v), uuid.optional()),
  title: z.string().trim().min(2, "Título requerido").max(120),
  body: z.string().trim().min(2, "Mensaje requerido").max(1000),
  level: z.enum(["INFO", "WARNING", "CRITICAL"]),
  endsOn: optional(10),
});

export async function createAnnouncement(_: PlatformState, formData: FormData): Promise<PlatformState> {
  const p = parse(announceSchema, fields(formData));
  if ("state" in p) return p.state;
  const { endsOn, ...body } = p.data;
  // La fecha de cierre se interpreta al final del día en Colombia (UTC-5).
  const endsAt = endsOn ? new Date(`${endsOn}T23:59:59-05:00`).toISOString() : undefined;
  if (endsOn && Number.isNaN(Date.parse(`${endsOn}T23:59:59-05:00`))) return { fieldErrors: { endsOn: ["Fecha inválida"] } };
  return run(() => post("/api/platform/announcements", { ...body, endsAt }), ["/app/plataforma/avisos"], "Aviso publicado.");
}

export async function archiveAnnouncement(id: string) {
  await post(`/api/platform/announcements/${uuid.parse(id)}/archive`);
  revalidatePath("/app/plataforma/avisos");
}
