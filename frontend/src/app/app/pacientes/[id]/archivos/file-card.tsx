"use client";

import { useState, useTransition } from "react";
import { FileText, Trash2 } from "lucide-react";
import { FormError } from "@/components/form-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDateTime } from "@/lib/format";
import { FILE_CATEGORIES, type PatientFile } from "@/lib/types";
import { removeFile } from "./actions";

function formatSize(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function FileCard({ patientId, file, canRemove }: { patientId: string; file: PatientFile; canRemove: boolean }) {
  const [removing, setRemoving] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const src = `/bff/files/${file.id}`;
  const isImage = file.contentType.startsWith("image/");

  return (
    <li className="grid content-start gap-2 overflow-hidden rounded-xl border">
      <a href={src} target="_blank" rel="noopener" className="block bg-muted" aria-label={`Abrir ${file.title}`}>
        {isImage ? (
          // eslint-disable-next-line @next/next/no-img-element -- imagen privada servida por el BFF, sin optimizar
          <img src={src} alt={file.title} loading="lazy" className="aspect-[4/3] w-full object-cover" />
        ) : (
          <span className="grid aspect-[4/3] place-items-center text-muted-foreground">
            <FileText className="size-10" />
          </span>
        )}
      </a>
      <div className="grid gap-1 px-3 pb-3 text-sm">
        <p className="truncate font-medium" title={file.title}>
          {file.title}
        </p>
        <p className="text-xs text-muted-foreground">
          {FILE_CATEGORIES[file.category]} · {formatSize(file.sizeBytes)}
        </p>
        <p className="text-xs text-muted-foreground">
          {file.uploadedBy?.name ?? "—"} · {formatDateTime(file.createdAt)}
        </p>
        {canRemove && !removing && (
          <Button variant="ghost" size="sm" className="w-fit px-0 text-muted-foreground" onClick={() => setRemoving(true)}>
            <Trash2 /> Quitar
          </Button>
        )}
        {removing && (
          <div className="grid gap-2">
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Motivo (p. ej. subido por error)"
              aria-label="Motivo para quitar el archivo"
              maxLength={200}
            />
            <FormError message={error} />
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="destructive"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const result = await removeFile(patientId, file.id, reason);
                    if (!result.ok) setError(result.error);
                  })
                }
              >
                {pending ? "Quitando…" : "Quitar"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setRemoving(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        )}
      </div>
    </li>
  );
}
