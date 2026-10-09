"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function PatientTabs({ patientId, clinical, treatments }: { patientId: string; clinical: boolean; treatments: boolean }) {
  const pathname = usePathname();
  const base = `/app/pacientes/${patientId}`;
  const tabs = [
    { href: base, label: "Resumen", active: pathname === base || pathname === `${base}/editar` },
    ...(clinical
      ? [
          { href: `${base}/historia`, label: "Historia clínica", active: pathname.startsWith(`${base}/historia`) },
          { href: `${base}/odontograma`, label: "Odontograma", active: pathname.startsWith(`${base}/odontograma`) },
          { href: `${base}/archivos`, label: "Archivos", active: pathname.startsWith(`${base}/archivos`) },
          {
            href: `${base}/consentimientos`,
            label: "Consentimientos",
            active: pathname.startsWith(`${base}/consentimientos`),
          },
        ]
      : []),
    ...(treatments
      ? [{ href: `${base}/tratamientos`, label: "Tratamientos y pagos", active: pathname.startsWith(`${base}/tratamientos`) }]
      : []),
  ];
  return (
    <nav aria-label="Secciones del paciente" className="-mb-2 flex gap-1 overflow-x-auto border-b">
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={t.active ? "page" : undefined}
          className={cn(
            "-mb-px shrink-0 border-b-2 border-transparent px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground",
            t.active && "border-primary font-medium text-foreground",
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
