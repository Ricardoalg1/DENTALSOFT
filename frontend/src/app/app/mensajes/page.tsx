import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { api, getMe } from "@/lib/api";
import type { MessagingOverview } from "@/lib/messaging";
import { MessagingPanel } from "./messaging-panel";

export const metadata: Metadata = { title: "Mensajes y recordatorios" };
export default async function MessagingPage() {
  const me = await getMe();
  if (!["ADMIN", "RECEPTION"].includes(me.role)) redirect("/app");
  const data = await api<MessagingOverview>("/api/messaging");
  return <MessagingPanel data={data} admin={me.role === "ADMIN"} />;
}
