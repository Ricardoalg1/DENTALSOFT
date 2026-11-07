"use client";

import { useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";

const LENGTH = 6;

/** Casillas de un dígito. Acepta pegar el código completo y el autocompletado del celular. */
export function CodeInput({ onChange, disabled }: { onChange: (code: string) => void; disabled?: boolean }) {
  const [digits, setDigits] = useState<string[]>(() => Array(LENGTH).fill(""));
  const boxes = useRef<(HTMLInputElement | null)[]>([]);

  function update(next: string[], focus: number) {
    setDigits(next);
    onChange(next.join(""));
    boxes.current[Math.min(focus, LENGTH - 1)]?.focus();
  }

  /** Escribe desde {@code from}. El celular puede entregar varios dígitos de una vez en la misma casilla. */
  function fill(from: number, value: string) {
    const typed = value.replace(/\D/g, "").slice(0, LENGTH - from).split("");
    const next = [...digits];
    typed.forEach((d, i) => {
      next[from + i] = d;
    });
    update(next, from + typed.length);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>, i: number) {
    if (e.key === "Backspace" && !digits[i] && i > 0) {
      e.preventDefault();
      const next = [...digits];
      next[i - 1] = "";
      update(next, i - 1);
    } else if (e.key === "ArrowLeft" && i > 0) {
      boxes.current[i - 1]?.focus();
    } else if (e.key === "ArrowRight" && i < LENGTH - 1) {
      boxes.current[i + 1]?.focus();
    }
  }

  function onPaste(e: ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, LENGTH);
    if (!pasted) return;
    const next = Array<string>(LENGTH).fill("");
    pasted.split("").forEach((d, i) => {
      next[i] = d;
    });
    update(next, pasted.length);
  }

  return (
    <div role="group" aria-label="Código de 6 dígitos" className="mx-auto grid w-full max-w-sm grid-cols-6 gap-2">
      {digits.map((digit, i) => (
        <input
          key={i}
          ref={(el) => {
            boxes.current[i] = el;
          }}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          aria-label={`Dígito ${i + 1} de ${LENGTH}`}
          autoFocus={i === 0}
          disabled={disabled}
          value={digit}
          onChange={(e) => {
            const added = e.target.value.replace(/\D/g, "");
            if (e.target.value === "") update(digits.map((d, j) => (j === i ? "" : d)), i);
            else if (added) fill(i, added.length > 1 && digit ? added.replace(digit, "") || added : added);
          }}
          onKeyDown={(e) => onKeyDown(e, i)}
          onPaste={onPaste}
          onFocus={(e) => e.target.select()}
          className="h-14 w-full min-w-0 rounded-xl border-2 border-input bg-background text-center text-2xl font-semibold tabular-nums text-foreground outline-none transition focus:border-primary focus:ring-3 focus:ring-ring/40 disabled:opacity-50 sm:h-16 sm:text-3xl"
        />
      ))}
    </div>
  );
}
