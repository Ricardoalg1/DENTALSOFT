// Captura del micrófono para el dictado: reduce el audio a 16 kHz y entrega bloques de 100 ms.
const OUTPUT_RATE = 16000;
const BLOCK = 1600;

class Captura extends AudioWorkletProcessor {
  ratio = sampleRate / OUTPUT_RATE;
  sum = 0;
  count = 0;
  block = new Float32Array(BLOCK);
  filled = 0;

  process(inputs) {
    const channel = inputs[0]?.[0];
    if (!channel) return true;
    for (const sample of channel) {
      this.sum += sample;
      this.count += 1;
      if (this.count < this.ratio) continue;
      this.block[this.filled++] = this.sum / this.count;
      this.sum = 0;
      this.count -= this.ratio;
      if (this.filled === BLOCK) {
        this.port.postMessage(this.block.slice());
        this.filled = 0;
      }
    }
    return true;
  }
}

registerProcessor("captura", Captura);
