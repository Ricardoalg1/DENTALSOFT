import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatLongDate } from "@/lib/format";
import { APP_ENV, APP_VERSION, VERSIONS } from "@/lib/versions";

export const metadata: Metadata = { title: "Versiones" };

const ENV_LABELS = { development: "Desarrollo", test: "Test", production: "Producción" } as const;

/** Historial de versiones. Solo el equipo de Occlus (el layout de plataforma lo exige). */
export default function VersionsPage() {
  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">
        Este servidor: <Badge variant="secondary">{ENV_LABELS[APP_ENV]}</Badge> versión{" "}
        <span className="font-medium tabular-nums">v{APP_VERSION}</span>
      </p>
      <ol className="grid gap-3">
        {VERSIONS.map((v, i) => (
          <li key={v.version}>
            <Card size="sm">
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2">
                  <span className="tabular-nums">v{v.version}</span> · {v.title}
                  {i === 0 && <Badge>Actual</Badge>}
                </CardTitle>
                <CardDescription>{formatLongDate(v.date)}</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="list-disc space-y-1 pl-5 text-sm">
                  {v.changes.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </li>
        ))}
      </ol>
    </div>
  );
}
