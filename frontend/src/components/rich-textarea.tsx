"use client";

import * as React from "react";
import { Bold, Italic, List, ListOrdered, Mic, MicOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/** Reconocimiento de voz del navegador (Chrome, Edge, Safari). No está en los tipos estándar de TypeScript. */
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: { resultIndex: number; results: { length: number; [i: number]: { isFinal: boolean; 0: { transcript: string } } } }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};
const speechCtor = (): (new () => Recognition) | null => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

const LIST_LINE = /^(\s*)([-*•]|\d+[.)])\s(.*)$/;

/** Escribe el valor como si lo hubiera tecleado el usuario, para que funcione con campos controlados y no controlados. */
function setNative(el: HTMLTextAreaElement, value: string, start: number, end = start) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
  setter.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.focus();
  el.setSelectionRange(start, end);
}

function lineBounds(value: string, start: number, end: number) {
  const from = value.lastIndexOf("\n", start - 1) + 1;
  const nl = value.indexOf("\n", end);
  return { from, to: nl === -1 ? value.length : nl };
}

/**
 * Campo de texto con formato: negrita, cursiva, listas con viñetas y numeradas.
 * Guarda texto con marcas simples (**negrita**, *cursiva*, "- " y "1. ") que se muestra con <RichText>.
 * Al pulsar Enter dentro de una lista, continúa la lista; en un elemento vacío, la termina.
 */
export function RichTextarea({ className, onKeyDown, ...props }: React.ComponentProps<typeof Textarea>) {
  const ref = React.useRef<HTMLTextAreaElement>(null);
  const recognition = React.useRef<Recognition | null>(null);
  const [listening, setListening] = React.useState(false);
  const [voiceError, setVoiceError] = React.useState<string>();
  const supported = React.useSyncExternalStore(
    () => () => {},
    () => speechCtor() !== null,
    () => false,
  );
  const max = typeof props.maxLength === "number" ? props.maxLength : Infinity;

  function apply(next: string, start: number, end?: number) {
    const el = ref.current;
    if (!el || next.length > max) return;
    setNative(el, next, start, end);
  }

  /** Inserta lo dictado en la posición del cursor, cuidando los espacios. */
  function insertDictation(text: string) {
    const el = ref.current;
    if (!el || !text) return;
    const { value, selectionStart: s, selectionEnd: e } = el;
    const before = value.slice(0, s);
    const lead = before && !/\s$/.test(before) ? " " : "";
    const insert = lead + text;
    apply(before + insert + value.slice(e), s + insert.length);
  }

  function toggleDictation() {
    if (listening) {
      recognition.current?.stop();
      return;
    }
    const Ctor = speechCtor();
    if (!Ctor) return;
    setVoiceError(undefined);
    const r = new Ctor();
    r.lang = "es-CO";
    r.continuous = true;
    r.interimResults = false;
    r.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) insertDictation(e.results[i][0].transcript.trim());
      }
    };
    r.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") setVoiceError("Permite el micrófono en el navegador para dictar.");
      else if (e.error !== "no-speech" && e.error !== "aborted") setVoiceError("No se pudo dictar. Intenta de nuevo.");
    };
    r.onend = () => setListening(false);
    recognition.current = r;
    ref.current?.focus();
    r.start();
    setListening(true);
  }

  React.useEffect(() => () => recognition.current?.stop(), []);

  function wrapSelection(marker: string) {
    const el = ref.current;
    if (!el) return;
    const { value, selectionStart: s, selectionEnd: e } = el;
    const m = marker.length;
    if (value.slice(s - m, s) === marker && value.slice(e, e + m) === marker) {
      apply(value.slice(0, s - m) + value.slice(s, e) + value.slice(e + m), s - m, e - m); // quitar el formato
    } else {
      apply(value.slice(0, s) + marker + value.slice(s, e) + marker + value.slice(e), s + m, e + m);
    }
  }

  function toggleList(ordered: boolean) {
    const el = ref.current;
    if (!el) return;
    const { value, selectionStart: s, selectionEnd: e } = el;
    const { from, to } = lineBounds(value, s, e);
    const lines = value.slice(from, to).split("\n");
    const isKind = (l: string) => {
      const m = LIST_LINE.exec(l);
      return !!m && /\d/.test(m[2]) === ordered;
    };
    const content = lines.filter((l) => l.trim());
    const allList = content.length > 0 && content.every(isKind);
    let n = 0;
    const caretOnly = s === e; // sin selección: también convierte una línea vacía para empezar la lista
    const out = lines.map((l) => {
      const m = LIST_LINE.exec(l);
      const body = m ? m[3] : l;
      if (allList) return m ? m[1] + body : l; // quitar la lista
      if (!l.trim() && !caretOnly) return l;
      n += 1;
      return ordered ? `${n}. ${body}` : `- ${body}`;
    });
    const text = out.join("\n");
    const next = value.slice(0, from) + text + value.slice(to);
    if (caretOnly) apply(next, from + text.length);
    else apply(next, from, from + text.length);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    onKeyDown?.(e);
    if (e.defaultPrevented || e.nativeEvent.isComposing) return;
    const el = e.currentTarget;
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
      if (e.key === "b") return (e.preventDefault(), wrapSelection("**"));
      if (e.key === "i") return (e.preventDefault(), wrapSelection("*"));
    }
    if (e.key !== "Enter" || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
    const { value, selectionStart: s, selectionEnd: end } = el;
    if (s !== end) return;
    const { from } = lineBounds(value, s, s);
    const m = LIST_LINE.exec(value.slice(from, s));
    if (!m) return;
    e.preventDefault();
    if (!m[3].trim()) {
      // elemento vacío: termina la lista
      apply(value.slice(0, from) + m[1] + value.slice(s), from + m[1].length);
      return;
    }
    const ordered = /\d/.test(m[2]);
    const marker = ordered ? `${parseInt(m[2], 10) + 1}.` : m[2];
    const insert = `\n${m[1]}${marker} `;
    apply(value.slice(0, s) + insert + value.slice(s), s + insert.length);
  }

  return (
    <div className="grid gap-1">
      <div className="flex items-center gap-0.5" role="toolbar" aria-label="Formato del texto">
        <Button type="button" variant="ghost" size="icon-xs" aria-label="Negrita (Ctrl+B)" title="Negrita (Ctrl+B)" onMouseDown={(e) => e.preventDefault()} onClick={() => wrapSelection("**")} disabled={props.disabled}>
          <Bold />
        </Button>
        <Button type="button" variant="ghost" size="icon-xs" aria-label="Cursiva (Ctrl+I)" title="Cursiva (Ctrl+I)" onMouseDown={(e) => e.preventDefault()} onClick={() => wrapSelection("*")} disabled={props.disabled}>
          <Italic />
        </Button>
        <Button type="button" variant="ghost" size="icon-xs" aria-label="Lista con viñetas" title="Lista con viñetas" onMouseDown={(e) => e.preventDefault()} onClick={() => toggleList(false)} disabled={props.disabled}>
          <List />
        </Button>
        <Button type="button" variant="ghost" size="icon-xs" aria-label="Lista numerada" title="Lista numerada" onMouseDown={(e) => e.preventDefault()} onClick={() => toggleList(true)} disabled={props.disabled}>
          <ListOrdered />
        </Button>
        {supported && (
          <>
            <span className="mx-1 h-4 w-px bg-border" aria-hidden />
            <Button
              type="button"
              variant={listening ? "destructive" : "ghost"}
              size="icon-xs"
              aria-label={listening ? "Detener dictado" : "Dictar por voz"}
              aria-pressed={listening}
              title={listening ? "Detener dictado" : "Dictar por voz (el audio lo procesa el servicio de voz de tu navegador)"}
              onMouseDown={(e) => e.preventDefault()}
              onClick={toggleDictation}
              disabled={props.disabled}
            >
              {listening ? <MicOff /> : <Mic />}
            </Button>
            {listening && <span className="ml-1 animate-pulse text-xs text-destructive">Escuchando…</span>}
          </>
        )}
      </div>
      {voiceError && <p className="text-xs text-destructive">{voiceError}</p>}
      <Textarea ref={ref} className={cn(className)} onKeyDown={handleKeyDown} {...props} />
    </div>
  );
}
