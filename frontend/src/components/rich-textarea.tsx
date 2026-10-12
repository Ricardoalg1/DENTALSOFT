"use client";

import * as React from "react";
import { Bold, Italic, List, ListOrdered } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

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
  const max = typeof props.maxLength === "number" ? props.maxLength : Infinity;

  function apply(next: string, start: number, end?: number) {
    const el = ref.current;
    if (!el || next.length > max) return;
    setNative(el, next, start, end);
  }

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
      </div>
      <Textarea ref={ref} className={cn(className)} onKeyDown={handleKeyDown} {...props} />
    </div>
  );
}
