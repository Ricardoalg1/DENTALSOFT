import "server-only";
import { cache } from "react";
import { api, ApiError } from "./api";
import { unstable_rethrow } from "next/navigation";
export const platformAccess = cache(async () => {
  try {
    return (await api<{ allowed: boolean }>("/api/marketing/access")).allowed;
  } catch (e) {
    unstable_rethrow(e);
    if (e instanceof ApiError && e.status === 403) return false;
    return false;
  }
});
export const statuses = {
  NEW: "Nueva",
  CONTACTED: "Contactada",
  DEMO_SCHEDULED: "Demo agendada",
  WON: "Ganada",
  LOST: "Cerrada sin venta",
} as const;
export type Status = keyof typeof statuses;
export type Lead = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  clinicName: string;
  teamSize: string;
  plan: string;
  message: string | null;
  status: Status;
  followUpOn: string | null;
  createdAt: string;
  updatedAt: string;
};
export type Activity = {
  id: string;
  status: Status;
  note: string;
  createdBy: string;
  createdAt: string;
};
export type Crm = {
  total: number;
  page: number;
  size: number;
  leads: Lead[];
  counts: { status: Status; total: number }[];
  metrics: { day: string; path: string; views: number }[];
};
