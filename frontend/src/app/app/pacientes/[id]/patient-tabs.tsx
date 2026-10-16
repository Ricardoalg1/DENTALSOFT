"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChartSpline, FileHeart, FileSignature, NotebookPen, Pill, ScanLine, type LucideIcon } from "lucide-react";
import { ToothIcon } from "@/components/icons/tooth";
import { cn } from "@/lib/utils";

type Tab = { href: string; label: string; active: boolean };
type SubTab = Tab & { icon: LucideIcon | typeof ToothIcon };

/** Secciones que viven dentro de la historia clínica (submenú horizontal). */
const CLINICAL_SECTIONS = [
  { path: "historia", label: "Evoluciones", icon: NotebookPen },
  { path: "odontograma", label: "Odontograma", icon: ToothIcon },
  { path: "periodontograma", label: "Periodontograma", icon: ChartSpline },
  { path: "formulas", label: "Fórmulas médicas", icon: Pill },
  { path: "consentimientos", label: "Consentimientos", icon: FileSignature },
  { path: "documentos", label: "Documentos médicos", icon: FileHeart },
  { path: "archivos", label: "Imágenes y archivos", icon: ScanLine },
] as const;

export function PatientTabs({ patientId, clinical, treatments }: { patientId: string; clinical: boolean; treatments: boolean }) {
  const pathname = usePathname();
  const base = `/app/pacientes/${patientId}`;
  const inSection = (path: string) => pathname === `${base}/${path}` || pathname.startsWith(`${base}/${path}/`);

  const sections: SubTab[] = clinical
    ? CLINICAL_SECTIONS.map((s) => ({ href: `${base}/${s.path}`, label: s.label, icon: s.icon, active: inSection(s.path) }))
    : [];
  const inClinical = sections.some((s) => s.active);

  const tabs: Tab[] = [
    { href: base, label: "Resumen", active: pathname === base || pathname === `${base}/editar` },
    ...(clinical ? [{ href: `${base}/historia`, label: "Historia clínica", active: inClinical }] : []),
    ...(treatments ? [{ href: `${base}/tratamientos`, label: "Tratamientos y pagos", active: inSection("tratamientos") }] : []),
  ];

  return (
    <div className="-mb-2 grid gap-2 print:hidden">
      <nav aria-label="Secciones del paciente" className="flex gap-1 overflow-x-auto border-b">
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

      {inClinical && (
        <nav aria-label="Historia clínica" className="flex gap-1 overflow-x-auto rounded-lg bg-muted/60 p-1">
          {sections.map((s) => {
            const Icon = s.icon;
            return (
              <Link
                key={s.href}
                href={s.href}
                aria-current={s.active ? "page" : undefined}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-background/60 hover:text-foreground",
                  s.active && "bg-background font-medium text-foreground shadow-sm",
                )}
              >
                <Icon className="size-4" />
                {s.label}
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}
