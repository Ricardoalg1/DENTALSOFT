import type { Metadata } from "next";
import { api, getMe } from "@/lib/api";
import type { InventoryOverview } from "@/lib/inventory";
import type { Site } from "@/lib/types";
import { InventoryPanel } from "./inventory-panel";

export const metadata: Metadata = { title: "Inventario" };
export default async function InventoryPage() {
  const [me, data, sites] = await Promise.all([getMe(), api<InventoryOverview>("/api/inventory"), api<Site[]>("/api/sites")]);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return <InventoryPanel data={data} sites={sites} role={me.role} today={today} />;
}
