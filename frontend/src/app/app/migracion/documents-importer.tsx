"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { FolderInput, Info, Paperclip, Upload } from "lucide-react";
import { FormError } from "@/components/form-error";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SOURCE_SUGGESTIONS, documentFromPath, type DocumentImportResult } from "@/lib/migration";
import { FILE_CATEGORIES, type FileCategory } from "@/lib/types";
import { postFile, postJson } from "./client";

const MAX_BYTES = 15 * 1024 * 1024;
const ALLOWED = /\.(pdf|jpe?g|png|webp)$/i;
const PARALLEL = 3;

type Item = {
  file: File;
  path: string;
  document: string | null;
  result?: DocumentImportResult | { status: "FAILED"; message: string; patient: null };
};

const STATUS: Record<string, { label: string; variant: "secondary" | "outline" | "destructive" }> = {
  CREATED: { label: "Importado", variant: "secondary" },
  DUPLICATE: { label: "Ya estaba", variant: "outline" },
  PATIENT_NOT_FOUND: { label: "Sin paciente", variant: "destructive" },
  INVALID: { label: "Formato no válido", variant: "destructive" },
  FAILED: { label: "Error", variant: "destructive" },
};

/**
 * Documentos del programa anterior (historias en PDF, radiografías, fotos). El paciente se reconoce por el
 * número de documento en el nombre del archivo o de su carpeta: "1020345678.pdf", "1020345678/rx.jpg".
 */
export function DocumentsImporter() {
  const router = useRouter();
  const filesInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState("");
  const [category, setCategory] = useState<FileCategory>("DOCUMENT");
  const [items, setItems] = useState<Item[]>([]);
  const [ignored, setIgnored] = useState(0);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);
  const [error, setError] = useState<string>();

  const ready = useMemo(() => items.filter((i) => i.document && i.file.size <= MAX_BYTES), [items]);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const i of items) if (i.result) c[i.result.status] = (c[i.result.status] ?? 0) + 1;
    return c;
  }, [items]);

  function pick(list: FileList | null) {
    if (!list) return;
    setError(undefined);
    setDone(0);
    const all = [...list];
    const accepted = all.filter((f) => ALLOWED.test(f.name));
    setIgnored(all.length - accepted.length);
    setItems(
      accepted.map((file) => {
        const path = file.webkitRelativePath || file.name;
        return { file, path, document: documentFromPath(path) };
      }),
    );
    if (filesInput.current) filesInput.current.value = "";
    if (folderInput.current) folderInput.current.value = "";
  }

  async function importAll() {
    setError(undefined);
    setBusy(true);
    setDone(0);
    try {
      const folder = ready[0]?.path.includes("/") ? ready[0].path.split("/")[0] : null;
      const batch = await postJson<{ id: string }>("/bff/migration/batches", {
        kind: "DOCUMENTS",
        sourceSystem: source.trim(),
        fileName: folder ?? `${ready.length} archivos`,
      });
      const queue = items.map((item, index) => ({ item, index })).filter(({ item }) => item.document && item.file.size <= MAX_BYTES);
      let next = 0;
      const worker = async () => {
        while (next < queue.length) {
          const { item, index } = queue[next++];
          let result: Item["result"];
          try {
            result = await postFile<DocumentImportResult>("/bff/migration/documents", item.file, {
              batchId: batch.id,
              documentNumber: item.document!,
              category,
            });
          } catch (e) {
            result = { status: "FAILED", message: (e as Error).message, patient: null };
          }
          setItems((list) => list.map((it, i) => (i === index ? { ...it, result } : it)));
          setDone((d) => d + 1);
        }
      };
      await Promise.all(Array.from({ length: PARALLEL }, worker));
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6">
      <Alert>
        <Info />
        <AlertTitle>Cómo se reconoce el paciente</AlertTitle>
        <AlertDescription>
          Por el número de documento en el nombre del archivo («1020345678.pdf», «CC 1020345678 - rx.jpg») o en el
          nombre de su carpeta («1020345678/panorámica.jpg»). Se aceptan PDF, JPG, PNG y WEBP de hasta 15 MB. Quedan en
          la pestaña Archivos del paciente; si un archivo ya estaba, no se repite.
        </AlertDescription>
      </Alert>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="doc-source">Programa de origen</Label>
          <Input id="doc-source" list="doc-sources" maxLength={80} value={source} onChange={(e) => setSource(e.target.value)} placeholder="Ej.: Dentalink" />
          <datalist id="doc-sources">
            {SOURCE_SUGGESTIONS.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="doc-category">Guardar como</Label>
          <select
            id="doc-category"
            className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm dark:bg-input/30"
            value={category}
            onChange={(e) => setCategory(e.target.value as FileCategory)}
          >
            {Object.entries(FILE_CATEGORIES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <input ref={filesInput} type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp" className="hidden" onChange={(e) => pick(e.target.files)} />
        <input
          ref={(el) => {
            folderInput.current = el;
            el?.setAttribute("webkitdirectory", "");
          }}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => pick(e.target.files)}
        />
        <Button type="button" variant="outline" disabled={busy} onClick={() => folderInput.current?.click()}>
          <FolderInput /> Elegir carpeta
        </Button>
        <Button type="button" variant="outline" disabled={busy} onClick={() => filesInput.current?.click()}>
          <Paperclip /> Elegir archivos
        </Button>
      </div>

      {items.length > 0 && (
        <div className="grid gap-3">
          <p className="text-sm">
            {items.length.toLocaleString("es-CO")} archivos · {ready.length.toLocaleString("es-CO")} listos para importar
            {items.length - ready.length > 0 && ` · ${items.length - ready.length} sin número de documento o de más de 15 MB`}
            {ignored > 0 && ` · ${ignored} ignorados (no son PDF ni imágenes)`}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" disabled={busy || ready.length === 0 || !source.trim()} onClick={() => void importAll()}>
              <Upload /> {busy ? `Importando ${done} de ${ready.length}…` : `Importar ${ready.length.toLocaleString("es-CO")} archivos`}
            </Button>
            {!source.trim() && <span className="text-sm text-destructive">Escribe el programa de origen.</span>}
            {Object.entries(counts).map(([status, n]) => (
              <Badge key={status} variant={STATUS[status].variant}>
                {STATUS[status].label}: {n}
              </Badge>
            ))}
          </div>
          <FormError message={error} />
          <div className="max-h-[28rem] overflow-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Archivo</TableHead>
                  <TableHead>Documento</TableHead>
                  <TableHead>Resultado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.slice(0, 500).map((i, n) => (
                  <TableRow key={n}>
                    <TableCell className="max-w-80 truncate" title={i.path}>{i.path}</TableCell>
                    <TableCell className="tabular-nums">
                      {i.document ?? <span className="text-destructive">No encontrado en el nombre</span>}
                    </TableCell>
                    <TableCell>
                      {i.file.size > MAX_BYTES ? (
                        <span className="text-destructive">Supera 15 MB</span>
                      ) : i.result ? (
                        <span className="flex flex-wrap items-center gap-2">
                          <Badge variant={STATUS[i.result.status].variant}>{STATUS[i.result.status].label}</Badge>
                          <span className="text-xs text-muted-foreground">{i.result.patient?.name ?? i.result.message}</span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Pendiente</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {items.length > 500 && <p className="p-2 text-xs text-muted-foreground">Se muestran los primeros 500 archivos.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
