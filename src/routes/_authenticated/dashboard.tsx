import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Boxes, CalendarDays, Package, Receipt, TrendingUp, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/session";
import { useStore } from "@/lib/store";
import { brl, dateTime, num, paymentLabels } from "@/lib/format";
import { EmptyState, LoadingRows, PageHeader, Panel, StatCard, StatusBadge, StockBadge } from "@/components/app/common";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Gestão da Loja" },
      { name: "description", content: "Resumo de faturamento, lucro, estoque e últimas vendas da loja." },
      { property: "og:title", content: "Dashboard — Gestão da Loja" },
      { property: "og:description", content: "Resumo de faturamento, lucro, estoque e últimas vendas." },
    ],
  }),
  component: Dashboard,
});

interface Summary {
  revenue_today: number;
  sales_today: number;
  revenue_month: number;
  sales_month: number;
  gross_profit_month: number | null;
  products_count: number;
  total_pieces: number;
  low_stock_count: number;
  low_stock: { name: string; sku: string; size: string; color: string; stock: number; min_stock: number }[];
}

function Dashboard() {
  const { data: me } = useMe();
  const { storeId } = useStore();
  const summary = useQuery({
    queryKey: ["dashboard", storeId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("dashboard_summary", { p_store_id: storeId });
      if (error) throw error;
      return data as unknown as Summary;
    },
  });
  const recent = useQuery({
    queryKey: ["sales", "recent", storeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("id, number, created_at, total, items_count, status, sale_payments(method)")
        .eq("store_id", storeId)
        .order("created_at", { ascending: false })
        .limit(8);
      if (error) throw error;
      return data;
    },
  });

  const s = summary.data;

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Visão geral da loja com dados em tempo real."
        actions={
          <Button asChild>
            <Link to="/nova-venda">Nova venda</Link>
          </Button>
        }
      />

      {summary.error && (
        <p className="mb-4 rounded-lg bg-destructive-soft px-4 py-3 text-sm text-destructive">
          Não foi possível carregar o resumo.
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          label="Faturamento do dia"
          value={s ? brl(s.revenue_today) : "—"}
          hint={s ? `${num(s.sales_today)} venda(s) hoje` : undefined}
          icon={Wallet}
          tone="primary"
        />
        <StatCard
          label="Faturamento do mês"
          value={s ? brl(s.revenue_month) : "—"}
          hint={s ? `${num(s.sales_month)} venda(s) no mês` : undefined}
          icon={CalendarDays}
          tone="primary"
        />
        <StatCard
          label="Lucro bruto do mês"
          value={me?.isAdmin ? (s ? brl(s.gross_profit_month) : "—") : "Restrito"}
          hint={me?.isAdmin ? "Faturamento − custo dos produtos vendidos" : "Visível só para o administrador"}
          icon={TrendingUp}
        />
        <StatCard label="Produtos cadastrados" value={s ? num(s.products_count) : "—"} hint="Produtos ativos" icon={Package} />
        <StatCard label="Peças em estoque" value={s ? num(s.total_pieces) : "—"} hint="Soma de todas as variações" icon={Boxes} />
        <StatCard
          label="Estoque baixo"
          value={s ? num(s.low_stock_count) : "—"}
          hint="Variações no mínimo ou zeradas"
          icon={AlertTriangle}
          tone={s && s.low_stock_count > 0 ? "warning" : "default"}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-5">
        <Panel
          className="xl:col-span-3"
          title="Últimas vendas"
          actions={
            <Button asChild variant="ghost" size="sm">
              <Link to="/vendas">Ver todas</Link>
            </Button>
          }
        >
          {recent.isLoading ? (
            <LoadingRows />
          ) : !recent.data?.length ? (
            <EmptyState icon={Receipt} title="Nenhuma venda ainda" text="As vendas finalizadas aparecem aqui." />
          ) : (
            <ul className="divide-y divide-border">
              {recent.data.map((sale) => (
                <li key={sale.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      Venda nº {sale.number} <span className="ml-2 align-middle"><StatusBadge status={sale.status} /></span>
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {dateTime(sale.created_at)} · {sale.items_count} peça(s) ·{" "}
                      {paymentLabels(sale.sale_payments.map((p) => p.method))}
                    </p>
                  </div>
                  <p className="tabular shrink-0 font-semibold">{brl(sale.total)}</p>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel className="xl:col-span-2" title="Precisa repor">
          {summary.isLoading ? (
            <LoadingRows />
          ) : !s?.low_stock.length ? (
            <EmptyState icon={Boxes} title="Estoque em dia" text="Nenhum produto abaixo do estoque mínimo." />
          ) : (
            <ul className="divide-y divide-border">
              {s.low_stock.map((item) => (
                <li key={item.sku} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{item.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.size}
                      {item.color ? ` · ${item.color}` : ""} · mínimo {item.min_stock}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="tabular text-sm font-semibold">{item.stock}</span>
                    <StockBadge stock={item.stock} min={item.min_stock} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}
