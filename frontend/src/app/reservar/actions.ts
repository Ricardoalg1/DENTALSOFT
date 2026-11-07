"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { api } from "@/lib/api";
import type { BookingSlot, ManageView } from "@/lib/booking";
import { errorMessage } from "@/lib/forms";

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

async function run<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

const slugSchema = z.string().regex(/^[a-z0-9-]{3,60}$/);
const dateSchema = z.iso.date();
const INVALID: Result<never> = { ok: false, error: "Revisa los datos e inténtalo de nuevo." };
const path = (slug: string, tail: string) => `/api/public/booking/${encodeURIComponent(slug)}${tail}`;
const post = <T,>(url: string, body: unknown, extra?: HeadersInit) =>
  api<T>(url, { method: "POST", body: JSON.stringify(body), auth: false, headers: extra });

export async function loadSlots(slug: string, dentistId: string, from: string): Promise<Result<BookingSlot[]>> {
  if (!slugSchema.safeParse(slug).success || !z.uuid().safeParse(dentistId).success || !dateSchema.safeParse(from).success) return INVALID;
  return run(() => api<BookingSlot[]>(path(slug, `/slots?dentistId=${dentistId}&from=${from}`), { auth: false }));
}

const holdSchema = z.object({
  dentistId: z.uuid(),
  siteId: z.uuid(),
  startsAt: z.iso.datetime({ offset: true }),
  visitType: z.enum(["FIRST_VISIT", "CONTROL", "TREATMENT", "PREVENTION"]),
  captchaToken: z.string().max(4096),
});

export async function holdSlot(slug: string, input: z.input<typeof holdSchema>): Promise<Result<{ holdToken: string; expiresAt: string }>> {
  const parsed = holdSchema.safeParse(input);
  if (!parsed.success || !slugSchema.safeParse(slug).success) return INVALID;
  // Nginx escribe esta cabecera con la IP real; el backend solo se alcanza desde aquí.
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0].trim();
  return run(() => post(path(slug, "/hold"), parsed.data, ip ? { "X-Occlus-Client-Ip": ip } : undefined));
}

const detailsSchema = z.object({
  holdToken: z.string().min(1).max(100),
  fullName: z.string().trim().min(3, "Escribe tu nombre completo").max(120),
  phone: z.string().trim().regex(/^[0-9 +()-]{7,20}$/, "Escribe un teléfono válido"),
  email: z.email("Escribe un correo válido").max(160),
  channel: z.enum(["EMAIL", "WHATSAPP"]),
  consentVersion: z.string().max(30),
  consentAccepted: z.boolean(),
});

export async function sendDetails(slug: string, input: z.input<typeof detailsSchema>): Promise<Result<null>> {
  const parsed = detailsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  if (!slugSchema.safeParse(slug).success) return INVALID;
  return run(async () => {
    await post<void>(path(slug, "/details"), parsed.data);
    return null;
  });
}

export async function verifyCode(slug: string, holdToken: string, code: string): Promise<Result<{ manageToken: string }>> {
  if (!slugSchema.safeParse(slug).success || !/^\d{6}$/.test(code.trim())) return { ok: false, error: "Escribe los 6 dígitos del código." };
  return run(() => post(path(slug, "/verify"), { holdToken, code: code.trim() }));
}

const tokenSchema = z.string().min(1).max(100);

export async function inspectBooking(token: string): Promise<Result<ManageView>> {
  if (!tokenSchema.safeParse(token).success) return INVALID;
  return run(() => post("/api/public/booking/manage/inspect", { token }));
}

export async function loadManageSlots(token: string, from: string): Promise<Result<BookingSlot[]>> {
  if (!tokenSchema.safeParse(token).success || !dateSchema.safeParse(from).success) return INVALID;
  return run(() => post("/api/public/booking/manage/slots", { token, from }));
}

export async function cancelBooking(token: string): Promise<Result<null>> {
  if (!tokenSchema.safeParse(token).success) return INVALID;
  return run(async () => {
    await post<void>("/api/public/booking/manage/cancel", { token });
    return null;
  });
}

export async function rescheduleBooking(token: string, siteId: string, startsAt: string): Promise<Result<null>> {
  if (!tokenSchema.safeParse(token).success || !z.uuid().safeParse(siteId).success || !z.iso.datetime({ offset: true }).safeParse(startsAt).success) return INVALID;
  return run(async () => {
    await post<void>("/api/public/booking/manage/reschedule", { token, siteId, startsAt });
    return null;
  });
}
