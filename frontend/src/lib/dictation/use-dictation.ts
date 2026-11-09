"use client";

import * as React from "react";
import { abandon, keepAlive, prepare, transcribe } from "./engine";
import { hasWebGpu, isSlowDevice, markSlowDevice, remoteAvailable, transcribeRemote } from "./remote";
import { Segmenter } from "./segmenter";

export type DictationStatus = "idle" | "preparing" | "listening";

/** Lo que Whisper suele inventar con ruido de fondo: viene de los subtítulos con que fue entrenado. */
const HALLUCINATION = /amara\.org|subt[ií]tulos|suscr[ií]bete|gracias por ver|^\W*gracias\W*$/i;

/**
 * Un equipo es lento para el modelo local si la prueba inicial o una frase tardan más que esto. Con WebGPU,
 * en las pruebas tardaron 1 s; sin ella, unos 19 s.
 */
const SLOW_MS = 4000;

/**
 * Tras descargar el modelo, prepararlo para la tarjeta gráfica tarda unos segundos. En algunos equipos ese paso no
 * termina nunca, sin dar error: pasado este tiempo, si la clínica tiene dictado en línea, se usa ese.
 */
const LOCAL_READY_MS = 30000;

/** Prepara el modelo local; con dictado en línea disponible, no espera indefinidamente a que termine. */
function prepareLocal(remote: boolean, onProgress: (value: number) => void) {
  return new Promise<number>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    prepare((value) => {
      onProgress(value);
      if (remote && value >= 1 && timer === undefined) {
        timer = setTimeout(() => {
          abandon();
          reject(new Error(`El modelo local no quedó listo en ${LOCAL_READY_MS / 1000} s`));
        }, LOCAL_READY_MS);
      }
    })
      .then(resolve, reject)
      .finally(() => clearTimeout(timer));
  });
}

/** Solo se dicta en un campo a la vez: empezar en otro detiene el anterior. */
let stopCurrent: (() => void) | null = null;

export const dictationSupported = () =>
  typeof window !== "undefined" && typeof AudioWorkletNode !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);

function errorMessage(error: unknown) {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "Permite el micrófono en el navegador para dictar.";
  if (name === "NotFoundError") return "No se encontró un micrófono en este equipo.";
  return "No se pudo preparar el dictado en este equipo. Intenta de nuevo.";
}

/**
 * Dictado con Whisper. Si el equipo lo puede hacer rápido, se transcribe en el navegador y el audio no sale del equipo.
 * Si no (sin WebGPU, o lento en la práctica) y la clínica tiene dictado en línea, cada frase va a Groq por el backend.
 */
export function useDictation(onText: (text: string) => void, onError: (message: string) => void) {
  const [status, setStatus] = React.useState<DictationStatus>("idle");
  const [progress, setProgress] = React.useState(0);
  const [transcribing, setTranscribing] = React.useState(0);
  const [online, setOnline] = React.useState(false);
  const stopRef = React.useRef<(() => void) | null>(null);
  const callbacks = React.useRef({ onText, onError });
  React.useEffect(() => {
    callbacks.current = { onText, onError };
  });

  function start() {
    stopCurrent?.();
    setProgress(0);
    setStatus("preparing");
    keepAlive(true);
    // Se crea con el clic: después de esperar el modelo, Safari ya no lo permitiría.
    // A 16 kHz, el remuestreo de mejor calidad lo hace el navegador; captura.js solo cubre al que no lo permite.
    let context = new AudioContext({ sampleRate: 16000 });
    let stream: MediaStream | undefined;
    let segmenter: Segmenter | undefined;
    let stopped = false;
    // Las frases se insertan en el orden en que se dijeron.
    let queue = Promise.resolve();
    let remote = false;
    let useRemote = false;

    const stop = () => {
      if (stopped) return;
      stopped = true;
      stream?.getTracks().forEach((track) => track.stop());
      segmenter?.flush();
      void context.close();
      stopRef.current = null;
      if (stopCurrent === stop) stopCurrent = null;
      keepAlive(false);
      setStatus("idle");
    };
    stopRef.current = stop;
    stopCurrent = stop;

    const switchToRemote = () => {
      markSlowDevice();
      useRemote = true;
      setOnline(true);
    };

    const onSegment = (audio: Float32Array) => {
      setTranscribing((n) => n + 1);
      const started = performance.now();
      const viaRemote = useRemote;
      const result = viaRemote ? transcribeRemote(audio) : transcribe(audio);
      queue = queue.then(async () => {
        try {
          const text = await result;
          if (!viaRemote && remote && !useRemote && performance.now() - started > Math.max(SLOW_MS, (audio.length / 16000) * 1500)) {
            switchToRemote();
          }
          if (text && !HALLUCINATION.test(text)) callbacks.current.onText(text);
        } catch (error) {
          callbacks.current.onError(
            viaRemote && error instanceof Error ? error.message : "No se pudo transcribir una frase. Intenta de nuevo.",
          );
        } finally {
          setTranscribing((n) => n - 1);
        }
      });
    };

    void (async () => {
      try {
        remote = await remoteAvailable();
        useRemote = remote && (isSlowDevice() || !(await hasWebGpu()));
        if (!useRemote) {
          try {
            const warmupMs = await prepareLocal(remote, setProgress);
            if (remote && warmupMs > SLOW_MS) switchToRemote();
          } catch (error) {
            if (!remote) throw error;
            console.warn("El dictado local no está disponible; se usa el dictado en línea", error);
            switchToRemote();
          }
        }
        setOnline(useRemote);
        if (stopped) return;
        // Sin cancelación de eco ni supresión de ruido: en las pruebas deformaban las palabras que recibe Whisper.
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: true },
        });
        if (stopped) return stream.getTracks().forEach((track) => track.stop());
        let source: MediaStreamAudioSourceNode;
        try {
          source = context.createMediaStreamSource(stream);
        } catch {
          // Firefox no conecta un micrófono a un contexto con otra frecuencia.
          void context.close();
          context = new AudioContext();
          source = context.createMediaStreamSource(stream);
        }
        await context.audioWorklet.addModule("/dictado/captura.js");
        if (stopped) return;
        segmenter = new Segmenter(onSegment);
        const node = new AudioWorkletNode(context, "captura");
        node.port.onmessage = ({ data }: MessageEvent<Float32Array>) => segmenter?.push(data);
        source.connect(node);
        await context.resume();
        setStatus("listening");
      } catch (error) {
        console.error(error);
        callbacks.current.onError(errorMessage(error));
        stop();
      }
    })();
  }

  function toggle() {
    if (stopRef.current) stopRef.current();
    else start();
  }

  React.useEffect(() => () => stopRef.current?.(), []);

  return { status, progress, transcribing, online, toggle };
}
