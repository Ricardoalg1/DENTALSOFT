import { Badge } from "@/components/ui/badge";
import { PLAN_STATUS, type PlanStatus } from "@/lib/types";

const VARIANT: Record<PlanStatus, "default" | "secondary" | "outline" | "destructive"> = {
  DRAFT: "outline",
  ACCEPTED: "default",
  COMPLETED: "secondary",
  REJECTED: "destructive",
  CANCELLED: "destructive",
};

export function PlanStatusBadge({ status }: { status: PlanStatus }) {
  return <Badge variant={VARIANT[status]}>{PLAN_STATUS[status]}</Badge>;
}
