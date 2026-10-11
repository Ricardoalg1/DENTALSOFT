import type { Metadata } from "next";
import { AgreementText } from "@/components/app/agreement-text";
import { api } from "@/lib/api";
import type { AgreementStatus } from "@/lib/agreement";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Acuerdo de tratamiento de datos" };

export default async function AgreementPage() {
  const status = await api<AgreementStatus>("/api/agreement");
  return (
    <div className="mx-auto grid max-w-3xl gap-4">
      <p className="rounded-lg border bg-card p-3 text-sm">
        {status.accepted && status.acceptedAt
          ? `Aceptado por ${status.acceptedBy} el ${formatDateTime(status.acceptedAt)} (versión ${status.version}).`
          : "Este acuerdo aún no ha sido aceptado."}
      </p>
      <AgreementText />
    </div>
  );
}
