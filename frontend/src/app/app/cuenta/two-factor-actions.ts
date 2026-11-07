"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/forms";

type Outcome<T> = { data: T; error?: undefined } | { data?: undefined; error: string };

async function run<T>(fn: () => Promise<T>): Promise<Outcome<T>> {
  try {
    const data = await fn();
    revalidatePath("/app/cuenta");
    return { data };
  } catch (e) {
    unstable_rethrow(e);
    return { error: errorMessage(e) };
  }
}

const post = <T,>(path: string, body: object) => api<T>(`/api/auth/2fa/${path}`, { method: "POST", body: JSON.stringify(body) });

export async function startTwoFactorSetup(password: string) {
  return run(() => post<{ secret: string; otpauthUri: string }>("setup", { password }));
}

export async function enableTwoFactor(code: string) {
  return run(() => post<{ codes: string[] }>("enable", { code }));
}

export async function disableTwoFactor(password: string, code: string) {
  return run(() => post<void>("disable", { password, code }));
}

export async function regenerateRecoveryCodes(password: string, code: string) {
  return run(() => post<{ codes: string[] }>("recovery-codes", { password, code }));
}
