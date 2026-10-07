import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api, getMe } from "@/lib/api";
import type { ConsentTemplate } from "@/lib/types";
import { LoadExamplesButton } from "./load-examples-button";
import { TemplateEditor } from "./template-editor";

export const metadata: Metadata = { title: "Plantillas de consentimiento" };

export default async function TemplatesPage() {
  const me = await getMe();
  if (me.role !== "ADMIN") redirect("/app/historias");
  const templates = await api<ConsentTemplate[]>("/api/consent-templates?includeInactive=true");

  return (
    <div className="grid max-w-4xl gap-6">
      <Link href="/app/historias" className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Historias clínicas
      </Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Plantillas de consentimiento</h1>
        <p className="text-muted-foreground">
          El texto se copia al consentimiento en el momento de firmar: cambiar una plantilla no altera los ya firmados.
        </p>
      </div>

      <div
        role="note"
        className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-200"
      >
        <TriangleAlert className="mt-0.5 size-4 shrink-0" />
        <p>
          Las plantillas de ejemplo son textos genéricos para empezar. Revísalas y ajústalas con el asesor legal de tu
          clínica antes de usarlas con pacientes.
        </p>
      </div>

      <LoadExamplesButton />

      {templates.map((t) => (
        <Card key={t.id}>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2">
              {t.title} {!t.active && <Badge variant="outline">Inactiva</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <details>
              <summary className="cursor-pointer text-sm text-primary">Editar</summary>
              <div className="pt-4">
                <TemplateEditor template={t} />
              </div>
            </details>
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardHeader>
          <CardTitle>Nueva plantilla</CardTitle>
          <CardDescription>Escribe el texto completo que leerá y firmará el paciente.</CardDescription>
        </CardHeader>
        <CardContent>
          <TemplateEditor key={templates.length} />
        </CardContent>
      </Card>
    </div>
  );
}
