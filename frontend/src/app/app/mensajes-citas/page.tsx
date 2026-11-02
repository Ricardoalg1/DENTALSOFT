import type { Metadata } from "next";
import Link from "next/link";
import { api, getMe } from "@/lib/api";
import type { Site } from "@/lib/types";
import type { MessageTemplate } from "./actions";
import { TemplateEditor } from "./template-editor";

export const metadata: Metadata = { title: "Mensajes de citas" };

export default async function AppointmentMessagesPage() {
  const me = await getMe();
  if (me.role !== "ADMIN") {
    return <p className="text-muted-foreground">Solo los administradores pueden editar los mensajes de las citas.</p>;
  }
  const [templates, placeholders, sites] = await Promise.all([
    api<MessageTemplate[]>("/api/appointment-messages"),
    api<Record<string, string>>("/api/appointment-messages/placeholders"),
    api<Site[]>("/api/sites"),
  ]);
  const site = sites.find((s) => s.active) ?? sites[0];
  // Datos de ejemplo para la vista previa: los de la clínica y su primera sede.
  const sample: Record<string, string> = {
    nombre: "Ricardo",
    paciente: "Ricardo Pérez Gómez",
    fecha: "30/10/2026",
    hora: "08:00 AM",
    profesional: me.fullName,
    consultorio: me.clinicName,
    sede: site?.name ?? "Sede principal",
    direccion: site?.address ?? "",
    ciudad: site?.city ?? "",
    telefono: site?.phone ?? "",
  };

  return (
    <div className="grid max-w-5xl gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Mensajes de citas</h1>
        <p className="text-muted-foreground">
          El texto que se envía por WhatsApp al agendar, según el motivo de la cita. En la agenda, el botón «Enviar
          invitación por WhatsApp» abre WhatsApp Web con este mensaje listo para el paciente.
        </p>
        {site && !(site.address && site.phone) && (
          <p className="mt-2 text-sm text-amber-700 dark:text-amber-400">
            La sede «{site.name}» no tiene dirección o teléfono, y esas líneas no saldrán en el mensaje.{" "}
            <Link href="/app/sedes" className="underline">
              Complétalos en Sedes
            </Link>
            .
          </p>
        )}
      </div>
      {templates.map((t) => (
        <TemplateEditor key={t.visitType} template={t} placeholders={placeholders} sample={sample} />
      ))}
    </div>
  );
}
