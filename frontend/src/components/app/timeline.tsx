import Link from "next/link";
import { cn } from "@/lib/utils";

export type TimelineItem = {
  key: string;
  href: string;
  /** Texto principal (la fecha). */
  label: string;
  /** Detalle corto debajo de la fecha (estado, número de cambios…). */
  detail?: string;
  active: boolean;
  /** Borrador: punto hueco. */
  draft?: boolean;
};

/**
 * Línea de tiempo horizontal para saltar entre fechas de un registro clínico.
 * Recibe los puntos del más reciente al más antiguo: se dibujan de izquierda (antiguo) a derecha (reciente)
 * y, con flex-row-reverse, el desplazamiento arranca mostrando los más recientes.
 */
export function Timeline({ items, label }: { items: TimelineItem[]; label: string }) {
  if (items.length === 0) return null;
  return (
    <nav aria-label={label} className="overflow-x-auto pb-1">
      <ol className="flex min-w-full flex-row-reverse justify-end">
        {items.map((item, i) => (
          <li key={item.key} className="relative shrink-0">
            {/* Tramo de la línea hacia el punto anterior (más antiguo), que queda a la izquierda. */}
            {i < items.length - 1 && <span aria-hidden className="absolute top-[9px] right-1/2 left-[-50%] h-0.5 bg-border" />}
            <Link
              href={item.href}
              aria-current={item.active ? "true" : undefined}
              className="group relative flex w-28 flex-col items-center gap-1 rounded-md px-1 pb-1 text-center outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span
                aria-hidden
                className={cn(
                  "size-[18px] rounded-full border-2 border-primary bg-background transition-transform group-hover:scale-110",
                  !item.draft && "bg-primary/70",
                  item.active && "bg-primary ring-4 ring-primary/25",
                )}
              />
              <span className={cn("text-xs tabular-nums", item.active ? "font-semibold text-foreground" : "text-muted-foreground")}>
                {item.label}
              </span>
              {item.detail && <span className="text-[11px] leading-tight text-muted-foreground">{item.detail}</span>}
            </Link>
          </li>
        ))}
      </ol>
    </nav>
  );
}
