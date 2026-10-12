import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Texto con formato sencillo (el que escriben los campos con RichTextarea):
 * **negrita**, *cursiva*, listas con viñetas ("- ") y numeradas ("1. "). Se dibuja con elementos de React,
 * sin HTML crudo, así que un texto escrito por un usuario no puede inyectar nada.
 */
function inline(text: string): React.ReactNode[] {
  return text.split(/(\*\*[^*\n]+\*\*|\*[^*\s][^*\n]*\*)/g).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) return <em key={i}>{part.slice(1, -1)}</em>;
    return part;
  });
}

const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBER = /^\s*\d+[.)]\s+(.*)$/;

type Block = { kind: "p" | "ul" | "ol"; lines: string[] };

function parse(text: string): Block[] {
  const blocks: Block[] = [];
  for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
    const bullet = BULLET.exec(raw);
    const number = bullet ? null : NUMBER.exec(raw);
    const kind = bullet ? "ul" : number ? "ol" : "p";
    const content = bullet ? bullet[1] : number ? number[1] : raw;
    const last = blocks.at(-1);
    if (last && last.kind === kind) last.lines.push(content);
    else blocks.push({ kind, lines: [content] });
  }
  return blocks;
}

export function RichText({ children, className }: { children: string | null | undefined; className?: string }) {
  if (!children) return null;
  return (
    <div className={cn("grid gap-1.5 break-words", className)}>
      {parse(children).map((b, i) => {
        if (b.kind === "ul")
          return (
            <ul key={i} className="list-disc space-y-0.5 pl-5">
              {b.lines.map((l, j) => (
                <li key={j}>{inline(l)}</li>
              ))}
            </ul>
          );
        if (b.kind === "ol")
          return (
            <ol key={i} className="list-decimal space-y-0.5 pl-5">
              {b.lines.map((l, j) => (
                <li key={j}>{inline(l)}</li>
              ))}
            </ol>
          );
        const text = b.lines.join("\n");
        if (!text.trim()) return <div key={i} className="h-1" aria-hidden />;
        return (
          <p key={i} className="whitespace-pre-line">
            {inline(text)}
          </p>
        );
      })}
    </div>
  );
}
