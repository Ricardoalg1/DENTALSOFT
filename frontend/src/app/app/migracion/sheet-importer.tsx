"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { CircleCheck, Download, FileSpreadsheet, Info, ListChecks, Upload } from "lucide-react";
import { FormError } from "@/components/form-error";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { downloadCsv, toCsv } from "@/lib/csv";
import {
  CHUNK_SIZE,
  CLINICAL_FIELDS,
  CLINICAL_TEMPLATE,
  PATIENT_FIELDS,
  PATIENT_TEMPLATE,
  SOURCE_SUGGESTIONS,
  guessMapping,
  missingClinicalFields,
  missingPatientFields,
  normalizeHeader,
  type ImportReport,
  type SheetData,
} from "@/lib/migration";
import { DOCUMENT_TYPES, REGIMES, type DocumentType, type Regime } from "@/lib/types";
import { postFile, postJson } from "./client";

type Kind = "PATIENTS" | "CLINICAL_RECORDS";

const EMPTY: ImportReport = { created: 0, updated: 0, skipped: 0, errors: [], warnings: [] };
const selectClass =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

/**
 * Importa un Excel/CSV exportado de otro programa: la clínica asigna cada columna a un campo de Occlus,
 * valida (sin guardar nada) y luego importa. El archivo se envía en partes de 500 filas.
 */
export function SheetImporter({ kind, clinicalEnabled }: { kind: Kind; clinicalEnabled: boolean }) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const fields = useMemo(
    () =>
      kind === "PATIENTS"
        ? PATIENT_FIELDS.filter((f) => clinicalEnabled || !f.group.startsWith("Antecedentes"))
        : CLINICAL_FIELDS,
    [kind, clinicalEnabled],
  );
  const groups = useMemo(() => [...new Set(fields.map((f) => f.group))], [fields]);

  const [source, setSource] = useState("");
  const [sheet, setSheet] = useState<SheetData | null>(null);
  const [mapping, setMapping] = useState<string[]>([]);
  const [onExisting, setOnExisting] = useState<"SKIP" | "UPDATE">("SKIP");
  const [defaultDocumentType, setDefaultDocumentType] = useState<DocumentType>("CC");
  const [defaultRegime, setDefaultRegime] = useState<Regime>("NO_AFILIADO");
  const [nameOrder, setNameOrder] = useState<"GIVEN_FIRST" | "SURNAME_FIRST">("GIVEN_FIRST");
  const [letterM, setLetterM] = useState<"male" | "female" | null>(null);
  const [fixUppercase, setFixUppercase] = useState(true);

  const [busy, setBusy] = useState<"reading" | "validating" | "importing" | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [report, setReport] = useState<{ mode: "validate" | "import"; data: ImportReport } | null>(null);
  const [error, setError] = useState<string>();

  const mapped = useMemo(() => new Set(mapping.filter(Boolean)), [mapping]);
  const missing = kind === "PATIENTS" ? missingPatientFields(mapped) : missingClinicalFields(mapped);

  // "M" en la columna de sexo: si el archivo también usa "F", M es masculino; si usa "H", M es mujer (RIPS).
  const sexInfo = useMemo(() => {
    const col = mapping.indexOf("sex");
    if (!sheet || col < 0) return { bareM: false, inferred: "male" as const };
    const values = new Set(sheet.rows.map((r) => normalizeHeader(r[col] ?? "")));
    return { bareM: values.has("m"), inferred: values.has("f") ? ("male" as const) : values.has("h") ? ("female" as const) : ("male" as const) };
  }, [sheet, mapping]);

  function reset() {
    setReport(null);
    setProgress(null);
    setError(undefined);
  }

  async function onFile(file: File) {
    reset();
    setSheet(null);
    setBusy("reading");
    try {
      const data = await postFile<SheetData>("/bff/migration/sheet", file);
      setSheet(data);
      setMapping(guessMapping(data.headers, fields));
      setLetterM(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  function assign(column: number, field: string) {
    setReport(null);
    // Un campo va en una sola columna: si ya estaba en otra, se quita de allá.
    setMapping((m) => m.map((f, i) => (i === column ? field : field && f === field ? "" : f)));
  }

  function buildRows() {
    if (!sheet) return [];
    return sheet.rows.map((r, i) => ({
      // Fila 1 = encabezados.
      row: i + 2,
      values: Object.fromEntries(mapping.flatMap((f, c) => (f && r[c] ? [[f, r[c]]] : []))),
    }));
  }

  async function run(mode: "validate" | "import") {
    if (!sheet) return;
    reset();
    setBusy(mode === "validate" ? "validating" : "importing");
    const rows = buildRows();
    const total: ImportReport = { ...EMPTY, errors: [], warnings: [] };
    setProgress({ done: 0, total: rows.length });
    try {
      let batchId: string | null = null;
      if (mode === "import") {
        const batch = await postJson<{ id: string }>("/bff/migration/batches", {
          kind,
          sourceSystem: source.trim(),
          fileName: sheet.fileName,
        });
        batchId = batch.id;
      }
      const endpoint = kind === "PATIENTS" ? "/bff/migration/patients" : "/bff/migration/clinical-records";
      for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
        const part = rows.slice(i, i + CHUNK_SIZE);
        const body =
          kind === "PATIENTS"
            ? {
                batchId,
                onExisting,
                defaultDocumentType,
                defaultRegime,
                nameOrder,
                letterMIsMale: (letterM ?? sexInfo.inferred) === "male",
                fixUppercase,
                rows: part,
              }
            : { batchId, rows: part };
        const r = await postJson<ImportReport>(endpoint, body);
        total.created += r.created;
        total.updated += r.updated;
        total.skipped += r.skipped;
        total.errors.push(...r.errors);
        total.warnings.push(...r.warnings);
        setProgress({ done: Math.min(i + CHUNK_SIZE, rows.length), total: rows.length });
      }
      setReport({ mode, data: total });
      if (mode === "import") router.refresh();
    } catch (e) {
      setError(
        (e as Error).message +
          (mode === "import" && total.created + total.updated > 0
            ? ` (ya se habían importado ${total.created + total.updated} filas; al reintentar no se duplican)`
            : ""),
      );
    } finally {
      setBusy(null);
    }
  }

  function downloadErrors() {
    if (!sheet || !report) return;
    downloadCsv(
      "filas-con-errores.csv",
      toCsv(
        ["Fila", "Error", ...sheet.headers],
        report.data.errors.map((e) => [e.row, e.message, ...(sheet.rows[e.row - 2] ?? [])]),
      ),
    );
  }

  const template = kind === "PATIENTS" ? PATIENT_TEMPLATE : CLINICAL_TEMPLATE;
  const canRun = !!sheet && missing.length === 0 && source.trim().length > 0 && !busy;

  return (
    <div className="grid gap-6">
      {kind === "CLINICAL_RECORDS" && (
        <Alert>
          <Info />
          <AlertTitle>Cómo queda la historia anterior</AlertTitle>
          <AlertDescription>
            Cada fila se guarda como un registro de la «Historia del programa anterior» del paciente: de solo lectura,
            con el profesional original como texto y una huella SHA-256 para detectar alteraciones. No se convierte en
            una evolución firmada en Occlus. Los pacientes se buscan por número de documento, así que impórtalos primero.
          </AlertDescription>
        </Alert>
      )}

      <section className="grid gap-3">
        <h3 className="font-medium">1. Archivo exportado del programa anterior</h3>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,16rem)_1fr] sm:items-end">
          <div className="grid gap-1.5">
            <Label htmlFor={`${kind}-source`}>Programa de origen</Label>
            <Input
              id={`${kind}-source`}
              list={`${kind}-sources`}
              maxLength={80}
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="Ej.: Dentalink, Excel propio…"
            />
            <datalist id={`${kind}-sources`}>
              {SOURCE_SUGGESTIONS.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInput}
              type="file"
              accept=".csv,.txt,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onFile(f);
              }}
            />
            <Button type="button" onClick={() => fileInput.current?.click()} disabled={!!busy}>
              <Upload /> {busy === "reading" ? "Leyendo…" : sheet ? "Cambiar archivo" : "Subir Excel o CSV"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                downloadCsv(
                  kind === "PATIENTS" ? "plantilla-pacientes.csv" : "plantilla-historia-clinica.csv",
                  toCsv(template.headers, [template.example]),
                )
              }
            >
              <Download /> Plantilla
            </Button>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Excel (.xlsx, .xls) o CSV, hasta 15 MB y 20.000 filas. Se lee la primera hoja; la primera fila deben ser los
          encabezados.
        </p>
        {sheet && (
          <p className="flex items-center gap-2 text-sm">
            <FileSpreadsheet className="size-4 text-primary" />
            <span className="font-medium">{sheet.fileName ?? "Archivo"}</span> · {sheet.rows.length.toLocaleString("es-CO")}{" "}
            filas · {sheet.headers.length} columnas
            {sheet.truncated && <Badge variant="destructive">Se leyeron solo las primeras 20.000 filas: divide el archivo</Badge>}
          </p>
        )}
      </section>

      {sheet && (
        <section className="grid gap-3">
          <h3 className="font-medium">2. ¿Qué es cada columna?</h3>
          <p className="text-sm text-muted-foreground">
            Propusimos una asignación según los encabezados. Revísala; las columnas en «No importar» se ignoran.
          </p>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Columna del archivo</TableHead>
                  <TableHead>Ejemplos</TableHead>
                  <TableHead className="w-72">Campo en Occlus</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sheet.headers.map((h, c) => {
                  const samples = sheet.rows.map((r) => r[c]).filter(Boolean).slice(0, 3);
                  return (
                    <TableRow key={c}>
                      <TableCell className="font-medium">{h}</TableCell>
                      <TableCell className="max-w-72 truncate text-xs text-muted-foreground" title={samples.join(" · ")}>
                        {samples.join(" · ") || "—"}
                      </TableCell>
                      <TableCell>
                        <select
                          aria-label={`Campo para la columna ${h}`}
                          className={selectClass}
                          value={mapping[c] ?? ""}
                          onChange={(e) => assign(c, e.target.value)}
                        >
                          <option value="">— No importar —</option>
                          {groups.map((g) => (
                            <optgroup key={g} label={g}>
                              {fields
                                .filter((f) => f.group === g)
                                .map((f) => (
                                  <option key={f.key} value={f.key}>
                                    {f.label}
                                  </option>
                                ))}
                            </optgroup>
                          ))}
                        </select>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          {missing.length > 0 && (
            <p className="text-sm text-destructive">Falta asignar: {missing.join(" · ")}</p>
          )}
        </section>
      )}

      {sheet && kind === "PATIENTS" && (
        <section className="grid gap-3">
          <h3 className="font-medium">3. Opciones</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Choice id="on-existing" label="Si el documento ya existe en Occlus" value={onExisting} onChange={(v) => { setReport(null); setOnExisting(v as "SKIP" | "UPDATE"); }}
              options={{ SKIP: "Dejarlo como está (omitir la fila)", UPDATE: "Actualizarlo con los datos del archivo" }} />
            <Choice id="default-doc" label="Tipo de documento si la fila no lo trae" value={defaultDocumentType}
              onChange={(v) => { setReport(null); setDefaultDocumentType(v as DocumentType); }} options={DOCUMENT_TYPES} />
            <Choice id="default-regime" label="Régimen si la fila no lo trae" value={defaultRegime}
              onChange={(v) => { setReport(null); setDefaultRegime(v as Regime); }} options={REGIMES} />
            {mapped.has("fullName") && (
              <Choice id="name-order" label="El nombre completo viene como" value={nameOrder}
                onChange={(v) => { setReport(null); setNameOrder(v as "GIVEN_FIRST" | "SURNAME_FIRST"); }}
                options={{ GIVEN_FIRST: "Nombres y apellidos (Juan Carlos Pérez Gómez)", SURNAME_FIRST: "Apellidos y nombres (Pérez Gómez Juan Carlos)" }} />
            )}
            {sexInfo.bareM && (
              <Choice id="letter-m" label="En la columna de sexo, «M» significa" value={letterM ?? sexInfo.inferred}
                onChange={(v) => { setReport(null); setLetterM(v as "male" | "female"); }}
                options={{ male: "Masculino", female: "Mujer (como en RIPS)" }} />
            )}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={fixUppercase} onChange={(e) => { setReport(null); setFixUppercase(e.target.checked); }} />
            Corregir nombres escritos en MAYÚSCULAS (PÉREZ GÓMEZ → Pérez Gómez)
          </label>
        </section>
      )}

      {sheet && (
        <section className="grid gap-3">
          <h3 className="font-medium">{kind === "PATIENTS" ? "4" : "3"}. Validar e importar</h3>
          <p className="text-sm text-muted-foreground">
            Validar revisa todas las filas sin guardar nada. Al importar, las filas con errores se omiten y puedes
            descargarlas para corregirlas y volver a subirlas: lo que ya se importó no se duplica.
          </p>
          {!source.trim() && <p className="text-sm text-destructive">Escribe el programa de origen.</p>}
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" disabled={!canRun} onClick={() => void run("validate")}>
              <ListChecks /> {busy === "validating" ? "Validando…" : "Validar"}
            </Button>
            <Button type="button" disabled={!canRun || report?.mode !== "validate"} onClick={() => void run("import")}>
              <Upload /> {busy === "importing" ? "Importando…" : `Importar ${sheet.rows.length.toLocaleString("es-CO")} filas`}
            </Button>
            {report?.mode !== "validate" && !busy && sheet && <span className="text-xs text-muted-foreground">Primero valida el archivo.</span>}
          </div>
          {progress && busy && (
            <div className="grid gap-1" role="status">
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full bg-primary transition-all" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
              </div>
              <p className="text-xs text-muted-foreground tabular-nums">
                {progress.done.toLocaleString("es-CO")} de {progress.total.toLocaleString("es-CO")} filas
              </p>
            </div>
          )}
          <FormError message={error} />
          {report && <ReportView report={report} kind={kind} onDownloadErrors={downloadErrors} />}
        </section>
      )}
    </div>
  );
}

function Choice({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: Record<string, string>;
  onChange: (v: string) => void;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <select id={id} className={selectClass} value={value} onChange={(e) => onChange(e.target.value)}>
        {Object.entries(options).map(([v, t]) => (
          <option key={v} value={v}>
            {t}
          </option>
        ))}
      </select>
    </div>
  );
}

function ReportView({
  report,
  kind,
  onDownloadErrors,
}: {
  report: { mode: "validate" | "import"; data: ImportReport };
  kind: Kind;
  onDownloadErrors: () => void;
}) {
  const { data, mode } = report;
  const verb = mode === "validate" ? "Se crearían" : "Creados";
  const noun = kind === "PATIENTS" ? "pacientes" : "registros";
  return (
    <div className="grid gap-3 rounded-lg border p-4">
      <p className="flex flex-wrap items-center gap-2 font-medium">
        {mode === "import" && <CircleCheck className="size-4 text-primary" />}
        {mode === "validate" ? "Resultado de la validación" : "Importación terminada"}
      </p>
      <div className="flex flex-wrap gap-2 text-sm">
        <Badge variant="secondary">{verb}: {data.created.toLocaleString("es-CO")} {noun}</Badge>
        {kind === "PATIENTS" && (
          <Badge variant="secondary">{mode === "validate" ? "Se actualizarían" : "Actualizados"}: {data.updated.toLocaleString("es-CO")}</Badge>
        )}
        <Badge variant="outline">
          {kind === "PATIENTS" ? "Ya existían (omitidos)" : "Ya importados (omitidos)"}: {data.skipped.toLocaleString("es-CO")}
        </Badge>
        <Badge variant={data.errors.length ? "destructive" : "outline"}>Con errores: {data.errors.length.toLocaleString("es-CO")}</Badge>
      </div>
      {data.errors.length > 0 && (
        <div className="grid gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">Filas con errores {mode === "validate" ? "(no se importarán)" : "(no se importaron)"}</p>
            <Button type="button" size="sm" variant="outline" onClick={onDownloadErrors}>
              <Download /> Descargar para corregir
            </Button>
          </div>
          <ul className="max-h-64 overflow-y-auto rounded-md bg-muted/50 p-2 text-sm">
            {data.errors.slice(0, 200).map((e, i) => (
              <li key={i}>
                <span className="font-medium tabular-nums">Fila {e.row}:</span> {e.message}
              </li>
            ))}
            {data.errors.length > 200 && <li className="text-muted-foreground">… y {data.errors.length - 200} más (descárgalas).</li>}
          </ul>
        </div>
      )}
      {data.warnings.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer font-medium">Avisos ({data.warnings.length}): se importan, pero revisa</summary>
          <ul className="mt-2 max-h-64 overflow-y-auto rounded-md bg-muted/50 p-2">
            {data.warnings.slice(0, 200).map((w, i) => (
              <li key={i}>
                <span className="font-medium tabular-nums">Fila {w.row}:</span> {w.message}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
