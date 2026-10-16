import type { FinancingStatus, InstallmentStatus } from "@/lib/types";

export const STATUS_VARIANT: Record<FinancingStatus, "default" | "secondary" | "outline" | "destructive"> = {
  ACTIVE: "secondary",
  OVERDUE: "destructive",
  PAID: "default",
  CANCELLED: "outline",
};

export const INSTALLMENT_VARIANT: Record<InstallmentStatus, "default" | "secondary" | "outline" | "destructive"> = {
  PAID: "default",
  PARTIAL: "secondary",
  PENDING: "outline",
  OVERDUE: "destructive",
};
