"use client";
import { useRef, useState, useEffect } from "react";
import {
  Download,
  FileJson,
  Printer,
  Mail,
  LoaderCircle,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
type Props = {
  patientId: string;
  noteId?: string;
  email?: string | null;
  emailEnabled: boolean;
};
export function ClinicalDocumentToolbar({
  patientId,
  noteId,
  email,
  emailEnabled,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const operation = useRef<string | null>(null);
  const urls = useRef<string[]>([]);
  const frames = useRef<HTMLIFrameElement[]>([]);
  useEffect(() => {
    const currentUrls = urls.current;
    const currentFrames = frames.current;
    return () => {
      currentUrls.forEach((url) => URL.revokeObjectURL(url));
      currentFrames.forEach((frame) => frame.remove());
    };
  }, []);
  async function exportDocument(format: "pdf" | "json", print = false) {
    setBusy(true);
    try {
      const query = new URLSearchParams({ format, print: String(print) });
      if (noteId) query.set("noteId", noteId);
      const response = await fetch(
        `/bff/patients/${patientId}/clinical-document?${query}`,
        { signal: AbortSignal.timeout(60000), cache: "no-store" },
      );
      if (!response.ok)
        throw new Error(
          (await response.json()).detail ?? "No se pudo generar el documento",
        );
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      urls.current.push(url);
      if (print) {
        const frame = document.createElement("iframe");
        frame.title = "Imprimir historia clínica";
        frame.style.cssText =
          "position:fixed;width:1px;height:1px;left:-9999px;border:0";
        frame.onload = () => {
          frame.contentWindow?.focus();
          frame.contentWindow?.print();
        };
        frame.src = url;
        document.body.append(frame);
        frames.current.push(frame);
        toast.info(
          "Se preparó el PDF para impresión. Si el visor no abre el diálogo, descarga el PDF e imprímelo desde tu lector.",
        );
      } else {
        const link = document.createElement("a");
        link.href = url;
        link.download = `historia-clinica${noteId ? "-evolucion" : ""}.${format}`;
        link.click();
        toast.success("Documento generado y descarga iniciada");
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No se pudo exportar",
      );
    } finally {
      setBusy(false);
    }
  }
  async function sendEmail() {
    if (!confirmed || busy || attempted) return;
    setBusy(true);
    setAttempted(true);
    operation.current ??= crypto.randomUUID();
    try {
      const response = await fetch(
        `/bff/patients/${patientId}/clinical-document`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            operationId: operation.current,
            confirmed: true,
          }),
          signal: AbortSignal.timeout(60000),
        },
      );
      if (!response.ok)
        throw new Error(
          (await response.json()).detail ?? "No pudimos confirmar el envío",
        );
      toast.success(
        "El servidor de correo aceptó el mensaje; la entrega depende del proveedor",
      );
      setConfirming(false);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Envío incierto. Revisa el proveedor antes de repetirlo.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="no-print grid gap-3 rounded-xl border bg-muted/30 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button disabled={busy} onClick={() => exportDocument("pdf")}>
          <Download /> Descargar PDF
        </Button>
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => exportDocument("json")}
        >
          <FileJson /> Exportar JSON
        </Button>
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => exportDocument("pdf", true)}
        >
          <Printer /> Imprimir
        </Button>
        {!noteId && (
          <Button
            variant="outline"
            disabled={busy || !emailEnabled || !email}
            onClick={() => setConfirming(!confirming)}
            title={
              !emailEnabled
                ? "Correo pendiente de configuración"
                : !email
                  ? "Registra el correo del paciente"
                  : undefined
            }
          >
            <Mail /> Enviar por correo
          </Button>
        )}
        {busy && (
          <LoaderCircle
            className="size-4 animate-spin"
            aria-label="Procesando"
          />
        )}
      </div>
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="size-3.5 shrink-0" />
        Exporta evoluciones firmadas y antecedentes actuales. No incluye
        imágenes, odontograma ni consentimientos adjuntos.
      </p>
      {!noteId && !emailEnabled && (
        <p className="text-xs text-muted-foreground">
          Correo pendiente de configuración; puedes descargar y entregar la
          copia al paciente.
        </p>
      )}
      {confirming && (
        <div className="grid gap-3 rounded-lg border bg-card p-3 text-sm">
          <p>
            Destinatario registrado: <strong>{email}</strong>. Se enviará el PDF
            de las evoluciones firmadas.
          </p>
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-1 accent-primary"
            />
            Confirmo que verifiqué el correo y la autorización del paciente para
            compartir su historia.
          </label>
          <Button
            disabled={!confirmed || busy || attempted}
            onClick={sendEmail}
          >
            <Mail />
            {attempted
              ? "Envío ya intentado: revisa el resultado"
              : "Confirmar envío"}
          </Button>
        </div>
      )}
    </div>
  );
}
