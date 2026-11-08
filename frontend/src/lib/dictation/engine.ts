import type { WorkerRequest, WorkerResponse } from "./whisper.worker";

/** Sin dictar durante este tiempo se libera la memoria; el modelo sigue en la caché del navegador. */
const IDLE_MS = 10 * 60 * 1000;

let worker: Worker | null = null;
let loading: Promise<number> | null = null;
let idleTimer: ReturnType<typeof setTimeout> | undefined;
let nextId = 1;
const progressListeners = new Set<(value: number) => void>();
const pending = new Map<number, { resolve: (text: string) => void; reject: (error: Error) => void }>();

function send(message: WorkerRequest, transfer: Transferable[] = []) {
  worker!.postMessage(message, transfer);
}

function shutdown() {
  worker?.terminate();
  worker = null;
  loading = null;
  for (const request of pending.values()) request.reject(new Error("Dictado detenido"));
  pending.clear();
}

/** Descarta el modelo local que no terminó de prepararse: libera la memoria y la tarjeta gráfica. */
export function abandon() {
  shutdown();
}

/** Mientras haya una sesión de dictado no se libera nada. */
export function keepAlive(active: boolean) {
  clearTimeout(idleTimer);
  if (!active) idleTimer = setTimeout(shutdown, IDLE_MS);
}

/** Prepara el modelo: lo descarga la primera vez y después lo toma de la caché. Devuelve cuánto tardó la prueba inicial. */
export function prepare(onProgress: (value: number) => void): Promise<number> {
  progressListeners.add(onProgress);
  loading ??= new Promise<number>((resolve, reject) => {
    worker = new Worker(new URL("./whisper.worker.ts", import.meta.url), { type: "module" });
    worker.onerror = () => {
      shutdown();
      reject(new Error("No se pudo iniciar el dictado"));
    };
    worker.onmessage = ({ data }: MessageEvent<WorkerResponse>) => {
      if (data.type === "progress") progressListeners.forEach((listen) => listen(data.value));
      else if (data.type === "ready") resolve(data.warmupMs);
      else if (data.type === "failed") {
        shutdown();
        reject(new Error(`No se pudo preparar el dictado: ${data.reason}`));
      } else {
        const request = pending.get(data.id);
        pending.delete(data.id);
        if (data.type === "text") request?.resolve(data.text);
        else request?.reject(new Error("No se pudo transcribir"));
      }
    };
    send({ type: "load" });
  });
  return loading.finally(() => progressListeners.delete(onProgress));
}

export function transcribe(audio: Float32Array): Promise<string> {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    send({ type: "transcribe", id, audio }, [audio.buffer]);
  });
}
