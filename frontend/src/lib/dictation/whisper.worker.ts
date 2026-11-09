import { env, pipeline } from "@huggingface/transformers";
import { hasHardwareGpu } from "./gpu";

/** El modelo lo sirve Occlus (scripts/preparar-dictado.mjs fija la versión): el navegador no llama a sitios externos. */
const MODEL = "whisper-small";

export type WorkerRequest = { type: "load" } | { type: "transcribe"; id: number; audio: Float32Array };
export type WorkerResponse =
  | { type: "progress"; value: number }
  | { type: "ready"; warmupMs: number }
  | { type: "failed"; reason: string }
  | { type: "text"; id: number; text: string }
  | { type: "text-failed"; id: number };

env.allowLocalModels = true;
env.allowRemoteModels = false;
env.localModelPath = "/dictado/modelos/";
env.backends.onnx.wasm!.wasmPaths = {
  mjs: "/dictado/ort/ort-wasm-simd-threaded.asyncify.mjs",
  wasm: "/dictado/ort/ort-wasm-simd-threaded.asyncify.wasm",
};

const post = (message: WorkerResponse) => self.postMessage(message);
const reason = (error: unknown) => (error instanceof Error ? error.message : String(error));
const OPTIONS = { language: "spanish", task: "transcribe" } as const;

type Transcriber = (audio: Float32Array, options: typeof OPTIONS) => Promise<{ text: string } | { text: string }[]>;
let transcriber: Transcriber | null = null;
let warmupMs = 0;

function trackProgress() {
  const files = new Map<string, { loaded: number; total: number }>();
  return (p: { status: string; file?: string; loaded?: number; total?: number }) => {
    if (p.status !== "progress" || !p.file || !p.total) return;
    files.set(p.file, { loaded: p.loaded ?? 0, total: p.total });
    const totals = [...files.values()];
    const total = totals.reduce((n, f) => n + f.total, 0);
    post({ type: "progress", value: totals.reduce((n, f) => n + f.loaded, 0) / total });
  };
}

async function create(device: "webgpu" | "wasm") {
  const created = await pipeline("automatic-speech-recognition", MODEL, {
    device,
    // Medido en Chrome: 1 s por frase con WebGPU y unos 19 s con WebAssembly, que solo es el respaldo.
    dtype: { encoder_model: "q4", decoder_model_merged: "q4" },
    progress_callback: trackProgress(),
  });
  return created as unknown as Transcriber;
}

async function load() {
  const hasGpu = await hasHardwareGpu(self.navigator as Parameters<typeof hasHardwareGpu>[0]);
  console.info(`Dictado: preparando el modelo con ${hasGpu ? "WebGPU" : "WebAssembly"}`);
  let created: Transcriber;
  try {
    created = await create(hasGpu ? "webgpu" : "wasm");
    // La primera ejecución prepara el motor: mejor aquí que en la primera frase dictada. Whisper siempre procesa
    // 30 s, así que su duración anticipa lo que tardará cada frase en este equipo.
    const started = performance.now();
    await created(new Float32Array(16000), OPTIONS);
    warmupMs = performance.now() - started;
    console.info(`Dictado: listo; la prueba inicial tardó ${Math.round(warmupMs)} ms`);
  } catch (error) {
    if (!hasGpu) throw error;
    console.warn("WebGPU falló; se usa WebAssembly", error);
    try {
      created = await create("wasm");
      const started = performance.now();
      await created(new Float32Array(16000), OPTIONS);
      warmupMs = performance.now() - started;
    } catch (fallback) {
      throw new Error(`WebGPU: ${reason(error)} / WebAssembly: ${reason(fallback)}`);
    }
  }
  transcriber = created;
}

self.onmessage = async ({ data }: MessageEvent<WorkerRequest>) => {
  if (data.type === "load") {
    try {
      if (!transcriber) await load();
      post({ type: "ready", warmupMs });
    } catch (error) {
      post({ type: "failed", reason: reason(error) });
    }
    return;
  }
  try {
    const result = await transcriber!(data.audio, OPTIONS);
    const text = (Array.isArray(result) ? result.map((r) => r.text).join(" ") : result.text).trim();
    post({ type: "text", id: data.id, text });
  } catch (error) {
    console.error(error);
    post({ type: "text-failed", id: data.id });
  }
};
