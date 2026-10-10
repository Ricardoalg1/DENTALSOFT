"use client";

import * as React from "react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import { cn } from "cn";

type Props = React.ComponentProps<"table"> & {
  pagination?: boolean;
  pageSize?: number;
};
function Table({
  className,
  pagination = true,
  pageSize = 10,
  ...props
}: Props) {
  const ref = React.useRef<HTMLTableElement>(null);
  const [page, setPage] = React.useState(0);
  const [size, setSize] = React.useState(pageSize);
  const [total, setTotal] = React.useState(0);
  const pages = Math.max(1, Math.ceil(total / size));
  const current = Math.min(page, pages - 1);
  React.useEffect(() => {
    const table = ref.current;
    if (!table) return;
    const update = () => {
      const rows = Array.from(
        table.querySelectorAll<HTMLTableRowElement>(":scope > tbody > tr"),
      );
      setTotal(rows.length);
      const lastPage = Math.max(0, Math.ceil(rows.length / size) - 1);
      const active = Math.min(page, lastPage);
      rows.forEach((row, index) => {
        row.dataset.pageHidden = String(
          pagination && (index < active * size || index >= (active + 1) * size),
        );
      });
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(table, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [page, size, pagination]);
  return (
    <div className="grid gap-3">
      <div
        data-slot="table-container"
        className="relative w-full overflow-x-auto rounded-xl border"
      >
        <table
          ref={ref}
          data-slot="table"
          className={cn("w-full caption-bottom text-sm", className)}
          {...props}
        />
      </div>
      {pagination && total > 0 && (
        <nav
          aria-label="Paginación de tabla"
          className="no-print flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground"
        >
          <label className="flex items-center gap-2">
            Filas por página
            <select
              aria-label="Filas por página"
              value={size}
              onChange={(e) => {
                setSize(Number(e.target.value));
                setPage(0);
              }}
              className="rounded-lg border bg-background px-2 py-1"
            >
              {[10, 25, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <span>
            {current * size + 1}–{Math.min((current + 1) * size, total)} de{" "}
            {total} filas cargadas
          </span>
          <div className="flex items-center gap-1">
            {[
              [ChevronsLeft, 0, "Primera página"],
              [ChevronLeft, current - 1, "Página anterior"],
              [ChevronRight, current + 1, "Página siguiente"],
              [ChevronsRight, pages - 1, "Última página"],
            ].map(([Icon, target, label], i) => {
              const Symbol = Icon as typeof ChevronLeft;
              const disabled = i < 2 ? current === 0 : current === pages - 1;
              return (
                <button
                  key={String(label)}
                  type="button"
                  aria-label={String(label)}
                  disabled={disabled}
                  onClick={() => setPage(Number(target))}
                  className="rounded-lg border p-1.5 hover:bg-accent disabled:opacity-40"
                >
                  <Symbol className="size-4" />
                </button>
              );
            })}
            <span aria-live="polite" className="ml-2">
              {current + 1} / {pages}
            </span>
          </div>
        </nav>
      )}
    </div>
  );
}
function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("bg-muted/60 [&_tr]:border-b", className)}
      {...props}
    />
  );
}
function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  );
}
function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
        className,
      )}
      {...props}
    />
  );
}
function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b transition-colors hover:bg-muted/50 has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted",
        className,
      )}
      {...props}
    />
  );
}
function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "h-11 px-3 text-left align-middle text-xs font-semibold whitespace-nowrap text-muted-foreground [&:has([role=checkbox])]:pr-0",
        className,
      )}
      {...props}
    />
  );
}
function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "p-3 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0",
        className,
      )}
      {...props}
    />
  );
}
function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}
export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
};
