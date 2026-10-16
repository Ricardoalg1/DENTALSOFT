import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PaginationLinks } from "@/components/pagination-links";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, getMe } from "@/lib/api";
import { todayCO } from "@/lib/agenda-time";
import { formatCOP, formatDate } from "@/lib/format";
import {
  canManageCash,
  EXPENSE_CATEGORIES,
  PAYMENT_METHODS,
  type CashSession,
  type Expense,
  type ExpenseCategory,
  type Page,
  type Site,
} from "@/lib/types";
import { ExpenseForm } from "./expense-form";
import { VoidExpense } from "./void-expense";

export const metadata: Metadata = { title: "Gastos" };

const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

export default async function ExpensesPage({ searchParams }: PageProps<"/app/gastos">) {
  const me = await getMe();
  if (!canManageCash(me)) redirect("/app");
  const sp = await searchParams;
  const today = todayCO();
  const from = isDate(sp.desde) ? sp.desde : `${today.slice(0, 8)}01`;
  const to = isDate(sp.hasta) ? sp.hasta : today;
  const category = typeof sp.categoria === "string" && sp.categoria in EXPENSE_CATEGORIES ? (sp.categoria as ExpenseCategory) : "";
  const q = typeof sp.q === "string" ? sp.q.slice(0, 120) : "";
  const page = Math.max(0, Math.trunc(Number(sp.page) || 0));

  const params = new URLSearchParams({ from, to, page: String(page), size: "25" });
  if (category) params.set("category", category);
  if (q) params.set("q", q);
  const [list, sites, sessions] = await Promise.all([
    api<Page<Expense>>(`/api/expenses?${params}`),
    api<Site[]>("/api/sites"),
    api<CashSession[]>("/api/cash-sessions"),
  ]);
  const open = new Set(sessions.filter((s) => !s.closedAt).map((s) => s.site.id));
  const pageTotal = list.content.filter((e) => !e.voidedAt).reduce((sum, e) => sum + e.amount, 0);
  const href = (p: number) => {
    const u = new URLSearchParams({ desde: from, hasta: to, page: String(p) });
    if (category) u.set("categoria", category);
    if (q) u.set("q", q);
    return `/app/gastos?${u}`;
  };

  return (
    <div className="mx-auto grid max-w-6xl gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Gastos</h1>
        <p className="text-muted-foreground">Egresos de la clínica por sede y categoría. El efectivo que sale de la caja se descuenta del cuadre.</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Nuevo gasto</CardTitle>
        </CardHeader>
        <CardContent>
          <ExpenseForm sites={sites.filter((s) => s.active).map((s) => ({ id: s.id, name: s.name, open: open.has(s.id) }))} today={today} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Gastos registrados</CardTitle>
          <CardDescription>
            {list.totalElements} {list.totalElements === 1 ? "gasto" : "gastos"} del {formatDate(from)} al {formatDate(to)}
            {list.totalPages <= 1 && ` · ${formatCOP(pageTotal)} (sin anulados)`}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <form action="/app/gastos" className="grid gap-3 sm:grid-cols-[repeat(4,minmax(0,1fr))_auto] sm:items-end">
            <div className="grid gap-1.5">
              <Label htmlFor="desde">Desde</Label>
              <Input id="desde" name="desde" type="date" defaultValue={from} max={today} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="hasta">Hasta</Label>
              <Input id="hasta" name="hasta" type="date" defaultValue={to} max={today} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="categoria">Categoría</Label>
              <select id="categoria" name="categoria" defaultValue={category} className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm dark:bg-input/30">
                <option value="">Todas</option>
                {Object.entries(EXPENSE_CATEGORIES).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="q">Buscar</Label>
              <Input id="q" name="q" defaultValue={q} placeholder="Descripción, proveedor, factura…" />
            </div>
            <Button type="submit" variant="outline">
              Filtrar
            </Button>
          </form>

          {list.content.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay gastos con esos filtros.</p>
          ) : (
            <Table pagination={false}>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead>Categoría</TableHead>
                  <TableHead>Sede</TableHead>
                  <TableHead>Medio</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  {me.role === "ADMIN" && <TableHead className="w-0" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.content.map((e) => (
                  <TableRow key={e.id} className={e.voidedAt ? "opacity-60" : undefined}>
                    <TableCell className="tabular-nums">{formatDate(e.expenseDate)}</TableCell>
                    <TableCell className="whitespace-normal">
                      {e.description}
                      <span className="block text-xs text-muted-foreground">
                        {[e.supplierName, e.supplierDocument, e.invoiceNumber && `Factura ${e.invoiceNumber}`].filter(Boolean).join(" · ")}
                        {e.voidedAt && ` · Anulado: ${e.voidReason}`}
                      </span>
                    </TableCell>
                    <TableCell>{EXPENSE_CATEGORIES[e.category]}</TableCell>
                    <TableCell>{e.site.name}</TableCell>
                    <TableCell>
                      {PAYMENT_METHODS[e.method]}
                      {e.cashSessionId && <Badge variant="outline" className="ml-1">Caja</Badge>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatCOP(e.amount)}</TableCell>
                    {me.role === "ADMIN" && <TableCell>{!e.voidedAt && <VoidExpense id={e.id} />}</TableCell>}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <PaginationLinks page={list.page} pages={list.totalPages} total={list.totalElements} href={href} />
        </CardContent>
      </Card>
    </div>
  );
}
