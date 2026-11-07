import Link from "next/link";
import { CalendarCheck, Settings2 } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { api } from "@/lib/api";
import type { Role } from "@/lib/types";

/** Acceso a la reserva en línea desde la agenda: recepción ve cuántas solicitudes esperan respuesta. */
export async function OnlineBookingBar({ role }: { role: Role }) {
  if (role !== "ADMIN" && role !== "RECEPTION") return null;
  const { pending } = await api<{ pending: number }>("/api/online-booking/requests/count");
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link href="/app/agenda/solicitudes" className={buttonVariants({ variant: pending ? "default" : "outline", size: "sm" })}>
        <CalendarCheck aria-hidden="true" />
        Solicitudes en línea{pending ? ` (${pending})` : ""}
      </Link>
      {role === "ADMIN" && (
        <Link href="/app/agenda/reserva-en-linea" className={buttonVariants({ variant: "outline", size: "sm" })}>
          <Settings2 aria-hidden="true" />
          Página de reservas
        </Link>
      )}
    </div>
  );
}
