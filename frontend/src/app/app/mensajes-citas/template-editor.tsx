"use client";

import { useRef, useState, useTransition } from "react";
import { Check, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { FormError } from "@/components/form-error";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { resetTemplate, saveTemplate, type MessageTemplate } from "./actions";

type Props = {
  template: MessageTemplate;
  placeholders: Record<string, string>;
  sample: Record<string, string>;
};

const PLACEHOLDER = /\{([a-z]+)\}/g;

/** Igual que el servidor: reemplaza los datos y quita las líneas cuyos datos quedaron todos vacíos. */
function render(template: string, values: Record<string, string>, known: Record<string, string>) {
  return template
    .split("\n")
    .flatMap((line) => {
      let any = false;
      let filled = false;
      const text = line.replace(PLACEHOLDER, (match, name: string) => {
        if (!(name in known)) return match;
        any = true;
        const v = (values[name] ?? "").trim();
        if (v) filled = true;
        return v;
      });
      return any && !filled ? [] : [text.replace(/[ \t]{2,}/g, " ").trimEnd()];
    })
    .join("\n")
    .trim();
}

export function TemplateEditor({ template, placeholders, sample }: Props) {
  const [saved, setSaved] = useState(template);
  const [body, setBody] = useState(template.body);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const area = useRef<HTMLTextAreaElement>(null);
  const dirty = body !== saved.body;
  const values = { ...sample, motivo: template.label };

  function insert(name: string) {
    const el = area.current;
    const token = `{${name}}`;
    if (!el) return setBody((b) => b + token);
    const { selectionStart: start, selectionEnd: end } = el;
    setBody(body.slice(0, start) + token + body.slice(end));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  }

  function run(action: () => ReturnType<typeof saveTemplate>, done: string) {
    setError(undefined);
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        setSaved(result.data);
        setBody(result.data.body);
        toast.success(done);
      } else setError(result.error);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {template.label}
          {saved.custom ? <Badge variant="secondary">Personalizado</Badge> : <Badge variant="outline">Predeterminado</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-2">
        <div className="grid content-start gap-2">
          <Textarea
            ref={area}
            aria-label={`Mensaje para citas de ${template.label}`}
            value={body}
            maxLength={2000}
            rows={12}
            onChange={(e) => setBody(e.target.value)}
          />
          <div className="flex flex-wrap gap-1">
            {Object.entries(placeholders).map(([name, description]) => (
              <button
                key={name}
                type="button"
                title={description}
                onClick={() => insert(name)}
                className="rounded border bg-muted px-1.5 py-0.5 font-mono text-xs hover:bg-accent"
              >
                {`{${name}}`}
              </button>
            ))}
          </div>
          <FormError message={error} />
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={pending || !dirty} onClick={() => run(() => saveTemplate(template.visitType, body), "Mensaje guardado")}>
              <Check /> {pending ? "Guardando…" : "Guardar"}
            </Button>
            {dirty && (
              <Button type="button" variant="ghost" disabled={pending} onClick={() => setBody(saved.body)}>
                Descartar cambios
              </Button>
            )}
            {saved.custom && (
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => run(() => resetTemplate(template.visitType), "Se restauró el mensaje predeterminado")}
              >
                <RotateCcw /> Restaurar predeterminado
              </Button>
            )}
          </div>
        </div>
        <div className="grid content-start gap-1.5">
          <p className="text-xs font-medium text-muted-foreground">Vista previa</p>
          <div className="rounded-lg bg-emerald-50 p-3 text-sm whitespace-pre-line dark:bg-emerald-950/40">
            {render(body, values, placeholders)}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
