import { cn } from "@/lib/utils";
import { APPOINTMENT_STATUS, type AppointmentStatus } from "@/lib/types";

/** Colores por estado; se reutilizan en el calendario (STATUS_COLORS) y en las insignias. */
export const STATUS_COLORS: Record<
  AppointmentStatus,
  { bg: string; border: string; text: string }
> = {
  SCHEDULED: {
    bg: "var(--accent)",
    border: "var(--primary)",
    text: "var(--accent-foreground)",
  },
  CONFIRMED: {
    bg: "var(--primary)",
    border: "var(--primary)",
    text: "var(--primary-foreground)",
  },
  ATTENDED: {
    bg: "var(--muted)",
    border: "var(--muted-foreground)",
    text: "var(--foreground)",
  },
  NO_SHOW: {
    bg: "var(--status-warning-bg)",
    border: "var(--status-warning-border)",
    text: "var(--status-warning-text)",
  },
  CANCELLED: {
    bg: "var(--status-danger-bg)",
    border: "var(--destructive)",
    text: "var(--status-danger-text)",
  },
};

export function StatusBadge({
  status,
  className,
}: {
  status: AppointmentStatus;
  className?: string;
}) {
  const c = STATUS_COLORS[status];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        className,
      )}
      style={{ backgroundColor: c.bg, borderColor: c.border, color: c.text }}
    >
      {APPOINTMENT_STATUS[status]}
    </span>
  );
}
