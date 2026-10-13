import type { Metadata } from "next";
import { getMe } from "@/lib/api";
import { CupsBrowser } from "./cups-browser";
export const metadata: Metadata = { title: "Catálogo CUPS" };
export default async function CupsPage() {
  const me = await getMe();
  return <CupsBrowser canManage={me.role === "ADMIN" && me.modules.includes("TREATMENTS_CASH")} />;
}
