import Link from "next/link";
import { notFound } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { unstable_rethrow } from "next/navigation";
import {
  platformAccess,
  statuses,
  type Lead,
  type Activity,
} from "@/lib/marketing";
import { EraseLeadForm } from "@/components/site/erase-lead-form";
import { LeadForm } from "@/components/site/lead-form";
import { plans } from "@/lib/site";
export const metadata = {
  title: "Seguimiento comercial",
  robots: { index: false, follow: false },
};
export default async function Page({
  params,
}: PageProps<"/app/comercial/[id]">) {
  if (!(await platformAccess()))
    return <p>Acceso reservado al equipo autorizado de Occlus.</p>;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  let lead: Lead;
  let history: Activity[];
  try {
    [lead, history] = await Promise.all([
      api<Lead>(`/api/marketing/leads/${id}`),
      api<Activity[]>(`/api/marketing/leads/${id}/history`),
    ]);
  } catch (e) {
    unstable_rethrow(e);
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
  return (
    <div className="max-w-4xl space-y-7">
      <Link href="/app/comercial" className="text-sm underline">
        ← Volver al CRM
      </Link>
      <header>
        <h1 className="text-2xl font-semibold">{lead.clinicName}</h1>
        <p className="mt-2 text-muted-foreground">
          {lead.name} · {statuses[lead.status]}
        </p>
        {lead.status !== "WON" && (
          <Link
            href={`/app/plataforma/clientes/nuevo?lead=${lead.id}`}
            className="mt-4 inline-block rounded bg-primary px-4 py-2 text-sm text-primary-foreground"
          >
            Crear cliente con estos datos
          </Link>
        )}
      </header>
      <div className="grid gap-8 md:grid-cols-2">
        <section className="rounded-xl border p-5">
          <h2 className="font-semibold">Solicitud</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div>
              <dt className="text-muted-foreground">Correo</dt>
              <dd>{lead.email}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Teléfono</dt>
              <dd>{lead.phone || "No proporcionado"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Plan</dt>
              <dd>
                {plans.find((p) => p.id === lead.plan)?.name ?? "Por definir"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Equipo</dt>
              <dd>
                {(
                  {
                    SOLO: "Una persona",
                    TWO_TO_FIVE: "2 a 5 personas",
                    SIX_TO_FIFTEEN: "6 a 15 personas",
                    MORE: "Más de 15 personas",
                  } as Record<string, string>
                )[lead.teamSize] ?? lead.teamSize}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Mensaje</dt>
              <dd className="whitespace-pre-wrap">
                {lead.message || "Sin mensaje"}
              </dd>
            </div>
          </dl>
          <LeadForm id={id} status={lead.status} followUpOn={lead.followUpOn} />
        </section>
        <section>
          <h2 className="font-semibold">Historial de seguimiento</h2>
          <p className="mt-2 text-xs text-muted-foreground">
            Últimas 100 gestiones, de más reciente a más antigua.
          </p>
          <ol className="mt-4 space-y-4">
            {history.map((a) => (
              <li key={a.id} className="rounded-xl border p-4">
                <p className="text-sm font-semibold">{statuses[a.status]}</p>
                <p className="mt-2 whitespace-pre-wrap text-sm">{a.note}</p>
                <p className="mt-3 text-xs text-muted-foreground">
                  {a.createdBy} ·{" "}
                  {new Date(a.createdAt).toLocaleString("es-CO", {
                    timeZone: "America/Bogota",
                  })}
                </p>
              </li>
            ))}
          </ol>
          {!history.length && (
            <p className="mt-4 text-sm text-muted-foreground">
              Sin gestiones registradas.
            </p>
          )}
        </section>
      </div>
      <EraseLeadForm id={id} />
    </div>
  );
}
