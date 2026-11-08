/** Dictado en línea: el backend de Occlus envía la frase a Groq. Solo se usa si el equipo no transcribe bien solo. */

const SLOW_KEY = "occlus.dictado.equipo-lento";

let status: Promise<boolean> | null = null;

/** Se consulta una vez por página: depende de la clave configurada y del tope mensual de la clínica. */
export function remoteAvailable(): Promise<boolean> {
  status ??= fetch("/bff/dictation", { cache: "no-store" })
    .then(async (res) => res.ok && Boolean((await res.json()).remote))
    .catch(() => false);
  return status;
}

/** Recuerda en este navegador que el equipo es lento, para no volver a esperar la prueba del modelo local. */
export function markSlowDevice() {
  try {
    localStorage.setItem(SLOW_KEY, "1");
  } catch {}
}

export function isSlowDevice() {
  try {
    return localStorage.getItem(SLOW_KEY) === "1";
  } catch {
    return false;
  }
}

export async function hasWebGpu() {
  const nav = navigator as Navigator & { gpu?: { requestAdapter: () => Promise<unknown> } };
  return Boolean(await nav.gpu?.requestAdapter().catch(() => null));
}

/** PCM de 16 bits, mono, 16 kHz: el único formato que acepta el backend. */
function toWav(audio: Float32Array) {
  const out = new DataView(new ArrayBuffer(44 + audio.length * 2));
  const text = (at: number, s: string) => [...s].forEach((c, i) => out.setUint8(at + i, c.charCodeAt(0)));
  text(0, "RIFF");
  out.setUint32(4, 36 + audio.length * 2, true);
  text(8, "WAVE");
  text(12, "fmt ");
  out.setUint32(16, 16, true);
  out.setUint16(20, 1, true);
  out.setUint16(22, 1, true);
  out.setUint32(24, 16000, true);
  out.setUint32(28, 32000, true);
  out.setUint16(32, 2, true);
  out.setUint16(34, 16, true);
  text(36, "data");
  out.setUint32(40, audio.length * 2, true);
  audio.forEach((s, i) => out.setInt16(44 + i * 2, Math.max(-1, Math.min(1, s)) * 0x7fff, true));
  return out.buffer;
}

export async function transcribeRemote(audio: Float32Array): Promise<string> {
  const res = await fetch("/bff/dictation", { method: "POST", body: toWav(audio), headers: { "Content-Type": "audio/wav" } });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 429) status = Promise.resolve(false);
    throw new Error(body?.detail ?? "No se pudo transcribir la frase. Intenta de nuevo.");
  }
  return String(body?.text ?? "");
}
