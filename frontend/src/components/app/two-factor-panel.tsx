"use client";

import { Copy, Download, ShieldCheck } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { disableTwoFactor, enableTwoFactor, regenerateRecoveryCodes, startTwoFactorSetup } from "@/app/app/cuenta/two-factor-actions";
import { FormError } from "@/components/form-error";
import { FormField } from "@/components/form-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export type TwoFactorStatus = { enabled: boolean; enabledAt: string | null; recoveryCodesLeft: number; available: boolean; eligible: boolean };

type Step =
  | { name: "idle" }
  | { name: "password" }
  | { name: "scan"; secret: string; uri: string }
  | { name: "codes"; codes: string[] }
  | { name: "disable" }
  | { name: "regenerate" };

const value = (e: FormEvent<HTMLFormElement>, name: string) => String(new FormData(e.currentTarget).get(name) ?? "");

export function TwoFactorPanel({ status }: { status: TwoFactorStatus }) {
  const [step, setStep] = useState<Step>({ name: "idle" });
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  async function submit<T>(call: () => Promise<{ data?: T; error?: string }>, done: (data: T) => void) {
    setPending(true);
    setError(undefined);
    const result = await call();
    setPending(false);
    if (result.error) setError(result.error);
    else done(result.data as T);
  }
  const cancel = () => {
    setStep({ name: "idle" });
    setError(undefined);
  };

  if (step.name === "codes") return <RecoveryCodes codes={step.codes} onDone={cancel} />;

  if (step.name === "scan") {
    return (
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          const code = value(e, "code");
          void submit(() => enableTwoFactor(code), (d) => setStep({ name: "codes", codes: d.codes }));
        }}
      >
        <FormError message={error} />
        <ol className="grid gap-1 text-sm">
          <li>1. Abre tu app autenticadora (Google Authenticator, Microsoft Authenticator, 1Password…).</li>
          <li>2. Escanea este código y escribe abajo los 6 dígitos que te muestre.</li>
        </ol>
        {/* Se dibuja aquí mismo: el secreto no pasa por ningún servicio externo de códigos QR. */}
        <div className="w-fit rounded-lg border bg-white p-3">
          <QRCodeSVG value={step.uri} size={176} title="Código QR para tu app autenticadora" />
        </div>
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">¿No puedes escanearlo? Escribe la clave a mano</summary>
          <code className="mt-2 block break-all rounded bg-muted p-2 text-xs">{step.secret}</code>
        </details>
        <FormField id="tf-enable-code" name="code" label="Código de 6 dígitos" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required autoFocus />
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={pending}>{pending ? "Verificando…" : "Activar"}</Button>
          <Button type="button" variant="outline" onClick={cancel}>Cancelar</Button>
        </div>
      </form>
    );
  }

  if (step.name === "password") {
    return (
      <form
        className="grid max-w-sm gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          const password = value(e, "password");
          void submit(() => startTwoFactorSetup(password), (d) => setStep({ name: "scan", secret: d.secret, uri: d.otpauthUri }));
        }}
      >
        <FormError message={error} />
        <FormField id="tf-setup-password" name="password" label="Confirma tu contraseña" type="password" autoComplete="current-password" required autoFocus />
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={pending}>{pending ? "Revisando…" : "Continuar"}</Button>
          <Button type="button" variant="outline" onClick={cancel}>Cancelar</Button>
        </div>
      </form>
    );
  }

  if (step.name === "disable" || step.name === "regenerate") {
    const disabling = step.name === "disable";
    return (
      <form
        className="grid max-w-sm gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          const password = value(e, "password");
          const code = value(e, "code");
          if (disabling) {
            void submit(() => disableTwoFactor(password, code), () => {
              cancel();
              toast.success("Verificación en dos pasos desactivada");
            });
          } else {
            void submit(() => regenerateRecoveryCodes(password, code), (d) => setStep({ name: "codes", codes: d.codes }));
          }
        }}
      >
        <FormError message={error} />
        <FormField id="tf-change-password" name="password" label="Tu contraseña" type="password" autoComplete="current-password" required autoFocus />
        <FormField id="tf-change-code" name="code" label="Código de tu app o de respaldo" autoComplete="one-time-code" spellCheck={false} maxLength={19} required />
        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant={disabling ? "destructive" : "default"} disabled={pending}>
            {pending ? "Procesando…" : disabling ? "Desactivar" : "Generar códigos nuevos"}
          </Button>
          <Button type="button" variant="outline" onClick={cancel}>Cancelar</Button>
        </div>
      </form>
    );
  }

  if (!status.enabled && !status.available) {
    return <p className="text-sm text-muted-foreground">Esta función aún no está configurada en el servidor.</p>;
  }

  if (!status.enabled) {
    return (
      <Button onClick={() => setStep({ name: "password" })}>
        <ShieldCheck aria-hidden="true" />Activar verificación en dos pasos
      </Button>
    );
  }

  return (
    <div className="grid gap-3 text-sm">
      <p className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">Activa</Badge>
        Te quedan {status.recoveryCodesLeft} {status.recoveryCodesLeft === 1 ? "código" : "códigos"} de respaldo.
      </p>
      {status.recoveryCodesLeft <= 1 && <p className="text-destructive">Te quedan pocos códigos de respaldo: genera unos nuevos.</p>}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => setStep({ name: "regenerate" })}>Generar códigos nuevos</Button>
        <Button variant="outline" size="sm" onClick={() => setStep({ name: "disable" })}>Desactivar</Button>
      </div>
    </div>
  );
}

function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const text = codes.join("\n");
  function download() {
    const url = URL.createObjectURL(new Blob([`Códigos de respaldo de Occlus. Cada uno sirve una sola vez.\n\n${text}\n`], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "occlus-codigos-de-respaldo.txt";
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div className="grid gap-4">
      <div role="status" className="grid gap-1 text-sm">
        <p className="font-medium">Guarda estos códigos de respaldo ahora. No volveremos a mostrarlos.</p>
        <p className="text-muted-foreground">Te permiten entrar si pierdes el teléfono. Cada uno sirve una sola vez. Guárdalos en tu gestor de contraseñas, no en la misma app autenticadora.</p>
      </div>
      <ul className="grid gap-1 rounded-lg border bg-muted p-3 font-mono text-sm sm:grid-cols-2">
        {codes.map((c) => <li key={c}>{c}</li>)}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => void navigator.clipboard.writeText(text).then(() => toast.success("Códigos copiados"))}>
          <Copy aria-hidden="true" />Copiar
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={download}>
          <Download aria-hidden="true" />Descargar
        </Button>
        <Button type="button" size="sm" onClick={onDone}>Ya los guardé</Button>
      </div>
    </div>
  );
}
