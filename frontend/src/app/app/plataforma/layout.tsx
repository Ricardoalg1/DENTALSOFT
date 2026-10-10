import { ShieldCheck } from "lucide-react";
import { PlatformNav } from "@/components/platform/platform-nav";
import { api } from "@/lib/api";
import { requirePlatform } from "@/lib/guard";
import type { NotificationRow } from "@/lib/platform";
import type { Page } from "@/lib/types";

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  await requirePlatform();
  const unread = await api<Page<NotificationRow>>("/api/platform/notifications?unread=true&size=1");
  return (
    <div className="grid max-w-6xl gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight"><span className="reference-icon mr-4"><ShieldCheck aria-hidden="true" /></span>Plataforma</h1>
        <p className="text-muted-foreground">Clientes, suscripciones y actividad de todas las clínicas. Sin acceso a datos clínicos.</p>
      </div>
      <PlatformNav unread={unread.totalElements} />
      {children}
    </div>
  );
}
