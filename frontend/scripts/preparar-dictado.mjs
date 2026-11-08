// Deja en public/dictado lo que el dictado necesita en el navegador: el motor WebAssembly y el modelo Whisper.
// Todo se sirve desde Occlus: así ninguna red ni extensión que bloquee sitios externos impide dictar, y no se
// ejecuta código de una CDN ajena. El modelo se descarga una vez, de una versión fija, y se verifica con SHA-256.
import { createHash } from "node:crypto";
import { copyFileSync, createReadStream, createWriteStream, existsSync, mkdirSync, renameSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const publicDir = new URL("../public/dictado/", import.meta.url).pathname;

const fromFrontend = createRequire(new URL("../package.json", import.meta.url));
const fromTransformers = createRequire(fromFrontend.resolve("@huggingface/transformers"));
const ortDist = dirname(fromTransformers.resolve("onnxruntime-web"));
mkdirSync(join(publicDir, "ort"), { recursive: true });
for (const file of ["ort-wasm-simd-threaded.asyncify.mjs", "ort-wasm-simd-threaded.asyncify.wasm"]) {
  copyFileSync(join(ortDist, file), join(publicDir, "ort", file));
}

const SOURCE = "https://huggingface.co/onnx-community/whisper-small/resolve/36050c46d777d46dc4b5f43f6d90574fc38f8732/";
const MODEL_FILES = {
  "config.json": "457854d452f17661e197d74aee12b8e74fb75ba30ebfaa7426d0d61ea1e08a18",
  "generation_config.json": "f538b28220c6a6d6f1af1458d4141cacb4ef4963df3de98a19490440c412ddf0",
  "preprocessor_config.json": "a6a76d28c93edb273669eb9e0b0636a2bddbb1272c3261e47b7ca6dfdbac1b8d",
  "tokenizer.json": "27fc476bfe7f17299480be2273fc0608e4d5a99aba2ab5dec5374b4482d1a566",
  "tokenizer_config.json": "2a4c4281cf9f51ac6ccc406fdc711a087afe6530f671fa7b80953edc498275ce",
  "onnx/encoder_model_q4.onnx": "9f088ad0fe15ba2cf094c9fb22ac7fe1111fc9ef317c1e4d1f6a3bca38a931ba",
  "onnx/decoder_model_merged_q4.onnx": "795c61b344576719c2b249cc9911c78b4cc552c8c6a5407be21a3380a0791b13",
};

async function sha256(path) {
  const hash = createHash("sha256");
  await pipeline(createReadStream(path), hash);
  return hash.digest("hex");
}

for (const [file, expected] of Object.entries(MODEL_FILES)) {
  const target = join(publicDir, "modelos/whisper-small", file);
  if (existsSync(target) && (await sha256(target)) === expected) continue;
  mkdirSync(dirname(target), { recursive: true });
  const response = await fetch(SOURCE + file);
  if (!response.ok) throw new Error(`No se pudo descargar ${file}: HTTP ${response.status}`);
  const partial = `${target}.parcial`;
  await pipeline(Readable.fromWeb(response.body), createWriteStream(partial));
  const actual = await sha256(partial);
  if (actual !== expected) throw new Error(`${file} no coincide con la versión esperada (SHA-256 ${actual})`);
  renameSync(partial, target);
  console.log(`Modelo del dictado: ${file}`);
}
