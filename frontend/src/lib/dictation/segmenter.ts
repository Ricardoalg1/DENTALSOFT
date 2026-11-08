/** Bloques de 100 ms que entrega public/dictado/captura.js. */
const SILENCE_TO_CUT = 8;
const PRE_ROLL = 5;
const MIN_SPEECH = 3;
const MAX_BLOCKS = 240;
const CUT_SEARCH = 30;
const MIN_LEVEL = 0.008;

const level = (block: Float32Array) => Math.sqrt(block.reduce((sum, s) => sum + s * s, 0) / block.length);

function join(blocks: Float32Array[]) {
  const out = new Float32Array(blocks.reduce((n, b) => n + b.length, 0));
  let at = 0;
  for (const b of blocks) {
    out.set(b, at);
    at += b.length;
  }
  return out;
}

/**
 * Corta la voz en frases aprovechando los silencios, para transcribir cada una al terminar de decirla.
 * Sin voz no envía nada: Whisper tiende a inventar texto cuando solo recibe silencio.
 */
export class Segmenter {
  private blocks: Float32Array[] = [];
  private levels: number[] = [];
  private speech = 0;
  private silence = 0;
  private noise = MIN_LEVEL;

  constructor(private readonly onSegment: (audio: Float32Array) => void) {}

  push(block: Float32Array) {
    const current = level(block);
    const isSpeech = current > Math.max(MIN_LEVEL, this.noise * 2.5);
    if (!isSpeech) this.noise = this.noise * 0.95 + current * 0.05;

    if (isSpeech) {
      this.speech += 1;
      this.silence = 0;
    } else {
      this.silence += 1;
    }
    this.blocks.push(block);
    this.levels.push(current);

    if (this.speech === 0) {
      this.blocks = this.blocks.slice(-PRE_ROLL);
      this.levels = this.levels.slice(-PRE_ROLL);
    } else if (this.silence >= SILENCE_TO_CUT) {
      this.flush();
    } else if (this.blocks.length >= MAX_BLOCKS) {
      this.cutAtQuietest();
    }
  }

  /** Entrega lo pendiente: se llama también al detener el dictado. */
  flush() {
    if (this.speech >= MIN_SPEECH) this.onSegment(join(this.blocks));
    this.blocks = [];
    this.levels = [];
    this.speech = 0;
    this.silence = 0;
  }

  /** Frase sin pausas muy larga: corta en el punto más bajo de los últimos 3 s para no partir una palabra. */
  private cutAtQuietest() {
    const from = this.levels.length - CUT_SEARCH;
    let cut = from;
    for (let i = from; i < this.levels.length; i++) if (this.levels[i] < this.levels[cut]) cut = i;
    const restBlocks = this.blocks.slice(cut);
    const restLevels = this.levels.slice(cut);
    this.onSegment(join(this.blocks.slice(0, cut)));
    this.blocks = restBlocks;
    this.levels = restLevels;
    this.speech = restLevels.length;
    this.silence = 0;
  }
}
