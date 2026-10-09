import Link from "next/link";

/** Paginación por enlaces. `page` es 0-based, como en la API; en la URL se usa 1-based. */
export function Pager({ page, totalPages, hrefFor }: { page: number; totalPages: number; hrefFor: (page1: number) => string }) {
  if (totalPages <= 1) return null;
  return (
    <nav className="flex items-center gap-4 text-sm" aria-label="Páginas">
      {page > 0 && (
        <Link className="text-primary hover:underline" href={hrefFor(page)}>
          Anterior
        </Link>
      )}
      <span className="text-muted-foreground">
        Página {page + 1} de {totalPages}
      </span>
      {page + 1 < totalPages && (
        <Link className="text-primary hover:underline" href={hrefFor(page + 2)}>
          Siguiente
        </Link>
      )}
    </nav>
  );
}

/** Lee `?page=` (1-based) con límites seguros y la devuelve 0-based. */
export function pageParam(value: string | string[] | undefined) {
  const n = Number(Array.isArray(value) ? value[0] : value);
  return Number.isFinite(n) ? Math.min(100000, Math.max(1, Math.trunc(n))) - 1 : 0;
}
