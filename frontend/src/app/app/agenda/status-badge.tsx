import { cn } from "@/lib/utils";
import { APPOINTMENT_STATUS, type AppointmentStatus } from "@/lib/types";

/** Colores por estado; se reutilizan en el calendario (STATUS_COLORS) y en las insignias. */
export const STATUS_COLORS: Record<AppointmentStatus, { bg: string; border: string; text: string }> = {
  SCHEDULED: { bg: "#e0f2f1", border: "#0f766e", text: "#134e4a" },
  CONFIRMED: { bg: "#0f766e", border: "#0f766e", text: "#ffffff" },
  ATTENDED: { bg: "#e5e7eb", border: "#6b7280", text: "#374151" },
  NO_SHOW: { bg: "#fef3c7", border: "#d97706", text: "#78350f" },
  CANCELLED: { bg: "#fee2e2", border: "#dc2626", text: "#7f1d1d" },
};

export function StatusBadge({ status, className }: { status: AppointmentStatus; className?: string }) {
  const c = STATUS_COLORS[status];
  return (
    <span
      className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium", className)}
      style={{ backgroundColor: c.bg, borderColor: c.border, color: c.text }}
    >
      {APPOINTMENT_STATUS[status]}
    </span>
  );
}
