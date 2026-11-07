"use client";

import Link from "next/link";
import { useCallback, useState, type FormEvent } from "react";
import { FormError } from "@/components/form-error";
import { FormField } from "@/components/form-field";
import { CodeInput } from "@/components/booking/code-input";
import { SlotPicker } from "@/components/booking/slot-picker";
import { Turnstile } from "@/components/booking/turnstile";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { timeLabel, whenLabel, type BookingInfo, type BookingSlot } from "@/lib/booking";
import { holdSlot, loadSlots, sendDetails, verifyCode } from "../actions";

type Step =
  | { name: "slot" }
  | { name: "details"; slot: BookingSlot; holdToken: string; expiresAt: string }
  | { name: "code"; slot: BookingSlot; holdToken: string; channel: "EMAIL" | "WHATSAPP"; contact: Contact }
  | { name: "done"; manageToken: string };
type Contact = { fullName: string; phone: string; email: string };

const CHANNEL_LABEL = { EMAIL: "Correo electrónico", WHATSAPP: "WhatsApp" };
const selectClass = "h-9 w-full rounded-lg border bg-background px-2.5 text-sm";

export function BookingWizard({ slug, info }: { slug: string; info: BookingInfo }) {
  const [step, setStep] = useState<Step>({ name: "slot" });
  const [visitType, setVisitType] = useState(info.visitTypes[0]?.code ?? "");
  const [dentistId, setDentistId] = useState(info.dentists[0]?.id ?? "");
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [captchaVersion, setCaptchaVersion] = useState(0);
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const [channel, setChannel] = useState(info.channels[0]);
  const [refresh, setRefresh] = useState(0);
  const [code, setCode] = useState("");
  // Cambia para vaciar las casillas: tras un código incorrecto o al pedir otro.
  const [codeRound, setCodeRound] = useState(0);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh vuelve a pedir las horas tras perder una.
  const load = useCallback((from: string) => loadSlots(slug, dentistId, from), [slug, dentistId, refresh]);
  const startOver = (message: string) => {
    setStep({ name: "slot" });
    setError(message);
    setRefresh((n) => n + 1);
  };

  async function pick(slot: BookingSlot) {
    if (info.captchaSiteKey && !captcha) {
      setError("Espera a que termine la comprobación de seguridad.");
      return;
    }
    setPending(true);
    setError(undefined);
    const r = await holdSlot(slug, { dentistId, siteId: slot.siteId, startsAt: slot.startsAt, visitType: visitType as "CONTROL", captchaToken: captcha ?? "" });
    setPending(false);
    setCaptchaVersion((n) => n + 1);
    if (r.ok) setStep({ name: "details", slot, holdToken: r.data.holdToken, expiresAt: r.data.expiresAt });
    else {
      setError(r.error);
      setRefresh((n) => n + 1);
    }
  }

  async function submitDetails(e: FormEvent<HTMLFormElement>, holdToken: string, slot: BookingSlot) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const contact = { fullName: String(form.get("fullName") ?? ""), phone: String(form.get("phone") ?? ""), email: String(form.get("email") ?? "") };
    setPending(true);
    setError(undefined);
    const r = await sendDetails(slug, { holdToken, ...contact, channel, consentVersion: info.consentVersion, consentAccepted: form.get("consent") === "on" });
    setPending(false);
    if (r.ok) {
      clearCode();
      setStep({ name: "code", slot, holdToken, channel, contact });
    } else setError(r.error);
  }

  function clearCode() {
    setCode("");
    setCodeRound((n) => n + 1);
  }

  async function submitCode(e: FormEvent<HTMLFormElement>, holdToken: string) {
    e.preventDefault();
    setPending(true);
    setError(undefined);
    const r = await verifyCode(slug, holdToken, code);
    setPending(false);
    if (r.ok) setStep({ name: "done", manageToken: r.data.manageToken });
    else if (/Elige una hora de nuevo/.test(r.error)) startOver(r.error);
    else {
      setError(r.error);
      clearCode();
    }
  }

  async function resend(holdToken: string, slot: BookingSlot, via: "EMAIL" | "WHATSAPP", contact: Contact) {
    setPending(true);
    setError(undefined);
    const r = await sendDetails(slug, { holdToken, ...contact, channel: via, consentVersion: info.consentVersion, consentAccepted: true });
    setPending(false);
    setError(r.ok ? undefined : r.error);
    if (r.ok) {
      clearCode();
      setStep({ name: "code", slot, holdToken, channel: via, contact });
    }
  }

  if (step.name === "done") {
    return (
      <div role="status" className="grid gap-3 text-sm">
        <p className="font-medium">Recibimos tu solicitud.</p>
        <p>La clínica la revisará y te avisará cuando quede confirmada. También te enviamos el enlace para cancelarla o cambiarla.</p>
        <p><Link className="font-medium text-primary hover:underline" href={`/mi-cita#t=${step.manageToken}`}>Ver o cambiar mi cita</Link></p>
      </div>
    );
  }

  if (step.name === "code") {
    return (
      <form key="code" className="grid gap-5" onSubmit={(e) => void submitCode(e, step.holdToken)}>
        <FormError message={error} />
        <p className="text-center text-sm">
          Te enviamos un código de 6 dígitos a tu {step.channel === "EMAIL" ? "correo" : "WhatsApp"}. Vence en unos minutos y, si no llega, revisa la carpeta de spam.
        </p>
        <CodeInput key={codeRound} onChange={setCode} disabled={pending} />
        <div className="flex flex-wrap justify-center gap-2">
          <Button type="submit" size="lg" disabled={pending || code.length !== 6}>{pending ? "Verificando…" : "Confirmar solicitud"}</Button>
          <Button type="button" size="lg" variant="outline" disabled={pending} onClick={() => void resend(step.holdToken, step.slot, step.channel, step.contact)}>Enviar otro código</Button>
        </div>
      </form>
    );
  }

  if (step.name === "details") {
    return (
      <form key="details" className="grid gap-4" onSubmit={(e) => void submitDetails(e, step.holdToken, step.slot)}>
        <FormError message={error} />
        <p role="status" className="rounded-lg border bg-muted p-3 text-sm first-letter:uppercase">
          {whenLabel(step.slot.startsAt)} en {step.slot.siteName}. Te la apartamos hasta las {timeLabel(step.expiresAt)}
        </p>
        <FormField name="fullName" label="Nombre completo" autoComplete="name" minLength={3} maxLength={120} required autoFocus />
        <FormField name="phone" label="Celular" type="tel" autoComplete="tel" maxLength={20} required />
        <FormField name="email" label="Correo" type="email" autoComplete="email" maxLength={160} required />
        {info.channels.length > 1 && (
          <fieldset className="grid gap-2">
            <legend className="text-sm font-medium">¿Dónde quieres recibir el código?</legend>
            {info.channels.map((c) => (
              <label key={c} className="flex items-center gap-2 text-sm">
                <input type="radio" name="channel" checked={channel === c} onChange={() => setChannel(c)} />
                {CHANNEL_LABEL[c]}
              </label>
            ))}
          </fieldset>
        )}
        <label className="flex items-start gap-2 text-xs text-muted-foreground">
          <input type="checkbox" name="consent" required className="mt-0.5" />
          <span>{info.consentText}</span>
        </label>
        <Button type="submit" size="lg" disabled={pending}>{pending ? "Enviando…" : "Enviarme el código"}</Button>
      </form>
    );
  }

  return (
    <div className="grid gap-4">
      <FormError message={error} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="visitType">Tipo de cita</Label>
          <select id="visitType" className={selectClass} value={visitType} onChange={(e) => setVisitType(e.target.value)}>
            {info.visitTypes.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="dentistId">Profesional</Label>
          <select id="dentistId" className={selectClass} value={dentistId} onChange={(e) => setDentistId(e.target.value)}>
            {info.dentists.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
      </div>
      <SlotPicker load={load} onPick={(s) => void pick(s)} disabled={pending} />
      {info.captchaSiteKey && <Turnstile siteKey={info.captchaSiteKey} version={captchaVersion} onToken={setCaptcha} />}
      <p className="text-xs text-muted-foreground">Al elegir una hora, queda apartada 10 minutos mientras completas tus datos.</p>
    </div>
  );
}
