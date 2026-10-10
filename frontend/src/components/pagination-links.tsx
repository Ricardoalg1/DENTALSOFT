import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
export function PaginationLinks({
  page,
  pages,
  total,
  href,
}: {
  page: number;
  pages: number;
  total: number;
  href: (page: number) => string;
}) {
  return (
    <nav
      aria-label="Paginación de resultados"
      className="no-print flex flex-wrap items-center justify-between gap-3 text-sm"
    >
      <p className="text-muted-foreground">
        {total} resultados · Página {Math.min(page + 1, Math.max(1, pages))} de{" "}
        {Math.max(1, pages)}
      </p>
      <div className="flex items-center gap-2">
        {page > 0 && (
          <Link
            href={href(page - 1)}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <ChevronLeft />
            Anterior
          </Link>
        )}
        {page + 1 < pages && (
          <Link
            href={href(page + 1)}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Siguiente
            <ChevronRight />
          </Link>
        )}
      </div>
    </nav>
  );
}
