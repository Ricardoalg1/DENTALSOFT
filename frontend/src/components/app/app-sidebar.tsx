"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { Logo } from "@/components/logo";
import { cn } from "@/lib/utils";

/**
 * Barra lateral fija en pantallas grandes; en celular y tableta es un panel que se abre con el botón de menú.
 */
export function AppSidebar({ clinicName, children }: { clinicName: string; children: React.ReactNode }) {
  const pathname = usePathname();
  // El menú recuerda en qué página se abrió: al navegar a otra, se cierra solo.
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt === pathname;
  const setOpen = (value: boolean) => setOpenAt(value ? pathname : null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <div className="sticky top-0 z-30 -mx-1 flex items-center gap-3 rounded-xl border bg-card/95 px-3 py-2 backdrop-blur lg:hidden print:hidden">
        <button type="button" onClick={() => setOpen(true)} aria-label="Abrir menú" aria-expanded={open} aria-controls="app-sidebar" className="grid size-11 place-items-center rounded-lg hover:bg-muted">
          <Menu className="size-6" aria-hidden />
        </button>
        <Logo className="[&_img]:w-14" />
        <p className="min-w-0 flex-1 truncate text-right text-sm text-muted-foreground">{clinicName}</p>
      </div>
      {open && <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={() => setOpen(false)} aria-hidden />}
      <aside
        id="app-sidebar"
        className={cn(
          "reference-sidebar flex shrink-0 flex-col gap-6 bg-sidebar p-4 lg:w-60",
          "max-lg:fixed max-lg:inset-y-2 max-lg:left-2 max-lg:z-50 max-lg:w-[min(18rem,calc(100vw-1rem))] max-lg:overflow-y-auto max-lg:shadow-2xl max-lg:transition-transform max-lg:duration-200",
          open ? "max-lg:translate-x-0" : "max-lg:-translate-x-[115%] max-lg:invisible",
        )}
      >
        <button type="button" onClick={() => setOpen(false)} aria-label="Cerrar menú" className="absolute right-2 top-2 grid size-10 place-items-center rounded-lg hover:bg-muted lg:hidden">
          <X className="size-5" aria-hidden />
        </button>
        {children}
      </aside>
    </>
  );
}
