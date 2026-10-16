import { Biohazard, Flame, SprayCan, Thermometer, TriangleAlert, Wrench, type LucideIcon } from "lucide-react";
import type { BiosafetyKind } from "@/lib/biosafety";

export const KIND_ICONS: Record<BiosafetyKind, LucideIcon> = {
  STERILIZATION: Flame,
  CLEANING: SprayCan,
  WASTE: Biohazard,
  ENVIRONMENT: Thermometer,
  MAINTENANCE: Wrench,
  ACCIDENT: TriangleAlert,
};
