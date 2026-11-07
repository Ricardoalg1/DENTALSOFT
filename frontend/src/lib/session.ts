import "server-only";
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "./session-cookie";

const CHALLENGE_COOKIE = "occlus_login_challenge";

// El JWT vive en una cookie httpOnly: el JavaScript del navegador nunca lo ve.
export async function setSession(token: string, expiresAt: string) {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(expiresAt),
  });
}

export async function getToken() {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

export async function clearSession() {
  (await cookies()).delete(SESSION_COOKIE);
}

/** Reto entre la contraseña y el código: dura lo que el reto en el backend y solo viaja a /ingresar. */
export async function setChallenge(token: string) {
  (await cookies()).set(CHALLENGE_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/ingresar",
    maxAge: 300,
  });
}

export async function getChallenge() {
  return (await cookies()).get(CHALLENGE_COOKIE)?.value;
}

export async function clearChallenge() {
  (await cookies()).set(CHALLENGE_COOKIE, "", { path: "/ingresar", maxAge: 0 });
}
