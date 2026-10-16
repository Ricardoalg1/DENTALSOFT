"use client";

import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/** Contenedor de la ficha: el periodontograma usa todo el ancho disponible; el resto conserva el ancho de lectura. */
export function PatientContainer({ children }: { children: React.ReactNode }) {
  const wide = /\/periodontograma(\/|$)/.test(usePathname());
  return <div className={cn("grid gap-6", wide ? "w-full min-w-0" : "max-w-5xl")}>{children}</div>;
}
