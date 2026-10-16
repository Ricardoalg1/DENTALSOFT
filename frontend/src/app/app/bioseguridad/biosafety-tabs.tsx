"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, type LucideIcon } from "lucide-react";
import { BIOSAFETY_KINDS, type BiosafetyKind } from "@/lib/biosafety";
import { cn } from "@/lib/utils";
import { KIND_ICONS } from "./biosafety-icons";

/** Submenú horizontal de Bioseguridad: resumen y cada tipo de registro. */
export function BiosafetyTabs() {
  const pathname = usePathname();
  const items: { href: string; label: string; icon: LucideIcon }[] = [
    { href: "/app/bioseguridad", label: "Resumen", icon: LayoutGrid },
    ...(Object.keys(BIOSAFETY_KINDS) as BiosafetyKind[]).map((k) => ({
      href: `/app/bioseguridad/${BIOSAFETY_KINDS[k].slug}`,
      label: BIOSAFETY_KINDS[k].label,
      icon: KIND_ICONS[k],
    })),
  ];
  return (
    <nav aria-label="Bioseguridad" className="flex gap-1 overflow-x-auto rounded-lg bg-muted/60 p-1">
      {items.map(({ href, label, icon: Icon }) => {
        const active = href === "/app/bioseguridad" ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-background/60 hover:text-foreground",
              active && "bg-background font-medium text-foreground shadow-sm",
            )}
          >
            <Icon className="size-4" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

