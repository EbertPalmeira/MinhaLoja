import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Download, FileBarChart, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { settingsQuery, useMe } from "@/lib/session";
import { brDate, brl, dateTime, errorMessage, firstOfMonthISO, num, paymentLabel, paymentLabels, pct, todayISO } from "@/lib/format";
import { downloadReportPdf } from "@/lib/pdf";
import { EmptyState, LoadingRows, PageHeader, Panel, StatCard, StatusBadge, StockBadge } from "@/components/app/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/relatorios")({
  head: () => ({
    meta: [
      { title: "Relatórios — Gestão da Loja" },
      { name: "description", content: "Relatórios de vendas, lucro bruto e estoque com exportação em PDF." },
      { property: "og:title", content: "Relatórios — Gestão da Loja" },
      { property: "og:description", content: "Vendas, lucro bruto e estoque com PDF." },
    ],
  }),
  component: ReportsPage,
});

interface SalesReport {
  sales_count: number;
  revenue: number;
  gross_total: number;
  discount_total: number;
  avg_ticket: number;
  items_sold: number;
  canceled_count: number;
  canceled_total: number;
  by_payment: { method: string; amount: number; sales: number }[];
  sales: { number: number; created_at: string; items_count: number; subtotal: number; discount: number; total: number; status: string; methods: string | null }[];
}
interface ProfitReport {
  gross_sales: number;
  discount_total: number;
  revenue: number;
  cost: number;
  gross_profit: number;
  margin: number;
  canceled_count: number;
  canceled_total: number;
  products: { product_name: string; size: string; color: string; quantity: number; revenue: number; cost: number; profit: number }[];
}
interface StockReport {
  total_pieces: number;
  total_cost_value: number | null;
  total_sale_value: number;
  low_count: number;
  zero_count: number;
  rows: { name: string; category: string; sku: string; size: string; color: string; stock: number; min_stock: number; sale_price: number; cost_price: number | null; cost_value: number | null }[];
}

function ReportsPage() {
  const { data: me } = useMe();
  const { data: settings } = useQuery(settingsQuery);
  const [from, setFrom] = useState(firstOfMonthISO());
  const [to, setTo] = useState(todayISO());
  const [tab, setTab] = useState("vendas");
  const [busy, setBusy] = useState(false);
  const valid = !!from && !!to && from <= to;
  const period = valid ? `${brDate(from)} a ${brDate(to)}` : "";
  const store = settings?.store_name ?? "Minha Loja";

  const sales = useQuery({
    queryKey: ["report", "sales", from, to],
    enabled: valid && tab === "vendas",
    queryFn: async () => {
      const { data, error } = await supabase.rpc("report_sales", { p_start: from, p_end: to });
      if (error) throw error;
      return data as unknown as SalesReport;
    },
  });
  const profit = useQuery({
    queryKey: ["report", "profit", from, to],
    enabled: valid && tab === "lucro" && !!me?.isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("report_profit", { p_start: from, p_end: to });
      if (error) throw error;
      return data as unknown as ProfitReport;
    },
  });
  const stock = useQuery({
    queryKey: ["report", "stock"],
    enabled: tab === "estoque",
    queryFn: async () => {
      const { data, error } = await supabase.rpc("report_stock");
      if (error) throw error;
      return data as unknown as StockReport;
    },
  });

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const pdfSales = () =>
    run(async () => {
      const r = sales.data!;
      await downloadReportPdf({
        storeName: store,
        title: "Relatório de vendas",
        period,
        filename: `relatorio-vendas-${from}-a-${to}.pdf`,
        summary: [
          ["Quantidade de vendas", num(r.sales_count)],
          ["Peças vendidas", num(r.items_sold)],
          ["Vendas brutas (antes de descontos)", brl(r.gross_total)],
          ["Descontos concedidos", brl(r.discount_total)],
          ["Faturamento total", brl(r.revenue)],
          ["Ticket médio", brl(r.avg_ticket)],
          ["Vendas canceladas (não somadas)", `${num(r.canceled_count)} · ${brl(r.canceled_total)}`],
        ],
        tables: [
          {
            title: "Vendas por forma de pagamento",
            head: ["Forma de pagamento", "Vendas", "Valor"],
            body: r.by_payment.map((p) => [paymentLabel(p.method), num(p.sales), brl(p.amount)]),
            foot: ["Total", "", brl(r.by_payment.reduce((s, p) => s + Number(p.amount), 0))],
            right: [1, 2],
          },
          {
            title: "Lista de vendas",
            head: ["Nº", "Data e hora", "Itens", "Subtotal", "Desconto", "Total", "Pagamento", "Status"],
            body: r.sales.map((s) => [
              s.number,
              dateTime(s.created_at),
              s.items_count,
              brl(s.subtotal),
              brl(s.discount),
              brl(s.total),
              paymentLabels(s.methods),
              s.status === "cancelada" ? "Cancelada" : "Concluída",
            ]),
            foot: ["", "Total (concluídas)", num(r.items_sold), brl(r.gross_total), brl(r.discount_total), brl(r.revenue), "", ""],
            right: [2, 3, 4, 5],
          },
        ],
      });
    });

  const pdfProfit = () =>
    run(async () => {
      const r = profit.data!;
      await downloadReportPdf({
        storeName: store,
        title: "Relatório de lucro bruto",
        period,
        filename: `relatorio-lucro-${from}-a-${to}.pdf`,
        summary: [
          ["Vendas brutas", brl(r.gross_sales)],
          ["(−) Descontos", brl(r.discount_total)],
          ["Faturamento das vendas válidas", brl(r.revenue)],
          ["(−) Custo dos produtos vendidos", brl(r.cost)],
          ["Lucro bruto", brl(r.gross_profit)],
          ["Margem bruta", pct(r.margin)],
          ["Vendas canceladas/devolvidas (excluídas)", `${num(r.canceled_count)} · ${brl(r.canceled_total)}`],
        ],
        tables: [
          {
            title: "Lucro por produto (antes dos descontos)",
            head: ["Produto", "Tam.", "Cor", "Qtd.", "Receita", "Custo", "Lucro bruto"],
            body: r.products.map((p) => [p.product_name, p.size, p.color || "—", num(p.quantity), brl(p.revenue), brl(p.cost), brl(p.profit)]),
            foot: ["Total", "", "", num(r.products.reduce((s, p) => s + Number(p.quantity), 0)), brl(r.gross_sales), brl(r.cost), brl(Number(r.gross_sales) - Number(r.cost))],
            right: [3, 4, 5, 6],
          },
        ],
      });
    });

  const pdfStock = () =>
    run(async () => {
      const r = stock.data!;
      const admin = !!me?.isAdmin;
      await downloadReportPdf({
        storeName: store,
        title: "Relatório de estoque",
        period: `Posição em ${brDate(todayISO())}`,
        filename: `relatorio-estoque-${todayISO()}.pdf`,
        landscape: true,
        summary: [
          ["Peças em estoque", num(r.total_pieces)],
          ...(admin ? ([["Valor do estoque a custo", brl(r.total_cost_value)]] as [string, string][]) : []),
          ["Valor do estoque a preço de venda", brl(r.total_sale_value)],
          ["Variações com estoque baixo", num(r.low_count)],
          ["Variações zeradas", num(r.zero_count)],
        ],
        tables: [
          {
            head: ["Produto", "Categoria", "Tamanho", "Cor", "Qtd.", ...(admin ? ["Custo"] : []), "Venda", ...(admin ? ["Total a custo"] : []), "Situação"],
            body: r.rows.map((x) => [
              x.name,
              x.category,
              x.size,
              x.color || "—",
              x.stock,
              ...(admin ? [brl(x.cost_price)] : []),
              brl(x.sale_price),
              ...(admin ? [brl(x.cost_value)] : []),
              x.stock === 0 ? "Zerado" : x.stock <= x.min_stock ? "Baixo" : "OK",
            ]),
            foot: ["Total", "", "", "", num(r.total_pieces), ...(admin ? [""] : []), "", ...(admin ? [brl(r.total_cost_value)] : []), ""],
            right: admin ? [4, 5, 6, 7] : [4, 5],
          },
        ],
      });
    });

  return (
    <>
      <PageHeader title="Relatórios" description="Escolha o período e baixe em PDF." />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="r-from" className="text-xs text-muted-foreground">
            Data inicial
          </Label>
          <Input id="r-from" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="r-to" className="text-xs text-muted-foreground">
            Data final
          </Label>
          <Input id="r-to" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
        </div>
        {!valid && <p className="pb-2 text-sm text-destructive">Período inválido.</p>}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="vendas">Vendas</TabsTrigger>
          <TabsTrigger value="lucro">Lucro</TabsTrigger>
          <TabsTrigger value="estoque">Estoque</TabsTrigger>
        </TabsList>

        <TabsContent value="vendas">
          {sales.isLoading ? (
            <LoadingRows />
          ) : sales.data ? (
            <>
              <ReportBar onPdf={pdfSales} busy={busy} />
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <StatCard label="Quantidade de vendas" value={num(sales.data.sales_count)} hint={`${num(sales.data.items_sold)} peça(s)`} />
                <StatCard label="Faturamento total" value={brl(sales.data.revenue)} tone="primary" />
                <StatCard label="Descontos concedidos" value={brl(sales.data.discount_total)} />
                <StatCard label="Ticket médio" value={brl(sales.data.avg_ticket)} />
              </div>
              {sales.data.canceled_count > 0 && (
                <p className="mt-3 text-xs text-muted-foreground">
                  {sales.data.canceled_count} venda(s) cancelada(s) no período ({brl(sales.data.canceled_total)}) não entram nos totais.
                </p>
              )}
              <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
                <Panel title="Por forma de pagamento">
                  {sales.data.by_payment.length === 0 ? (
                    <EmptyState icon={FileBarChart} title="Sem vendas no período" />
                  ) : (
                    <ul className="divide-y divide-border">
                      {sales.data.by_payment.map((p) => (
                        <li key={p.method} className="flex justify-between px-5 py-3 text-sm">
                          <span>
                            {paymentLabel(p.method)} <span className="text-xs text-muted-foreground">· {p.sales} venda(s)</span>
                          </span>
                          <span className="tabular font-semibold">{brl(p.amount)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Panel>
                <Panel title="Lista de vendas" className="xl:col-span-2">
                  {sales.data.sales.length === 0 ? (
                    <EmptyState icon={FileBarChart} title="Sem vendas no período" />
                  ) : (
                    <div className="max-h-[480px] overflow-auto">
                      <table className="w-full min-w-[560px] text-sm">
                        <thead className="sticky top-0 bg-card">
                          <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                            <th className="px-5 py-2 font-medium">Nº</th>
                            <th className="px-3 py-2 font-medium">Data</th>
                            <th className="px-3 py-2 text-right font-medium">Desconto</th>
                            <th className="px-3 py-2 text-right font-medium">Total</th>
                            <th className="px-3 py-2 font-medium">Pagamento</th>
                            <th className="px-5 py-2 font-medium">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sales.data.sales.map((s) => (
                            <tr key={s.number} className="border-b border-border/60">
                              <td className="px-5 py-2 font-medium">#{s.number}</td>
                              <td className="px-3 py-2 text-muted-foreground">{dateTime(s.created_at)}</td>
                              <td className="tabular px-3 py-2 text-right">{brl(s.discount)}</td>
                              <td className="tabular px-3 py-2 text-right font-semibold">{brl(s.total)}</td>
                              <td className="px-3 py-2">{paymentLabels(s.methods)}</td>
                              <td className="px-5 py-2">
                                <StatusBadge status={s.status} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Panel>
              </div>
            </>
          ) : null}
        </TabsContent>

        <TabsContent value="lucro">
          {!me?.isAdmin ? (
            <Panel>
              <EmptyState icon={FileBarChart} title="Relatório restrito" text="Somente o administrador pode ver custos e lucros." />
            </Panel>
          ) : profit.isLoading ? (
            <LoadingRows />
          ) : profit.data ? (
            <>
              <ReportBar onPdf={pdfProfit} busy={busy} />
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <StatCard label="Faturamento (vendas válidas)" value={brl(profit.data.revenue)} hint={`Descontos: ${brl(profit.data.discount_total)}`} />
                <StatCard label="Custo dos produtos vendidos" value={brl(profit.data.cost)} />
                <StatCard label="Lucro bruto" value={brl(profit.data.gross_profit)} tone="primary" />
                <StatCard label="Margem bruta" value={pct(profit.data.margin)} />
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Lucro bruto = faturamento − custo registrado em cada venda. Não inclui despesas da loja (não é lucro líquido).
                {profit.data.canceled_count > 0 &&
                  ` ${profit.data.canceled_count} venda(s) cancelada(s) (${brl(profit.data.canceled_total)}) foram excluídas.`}
              </p>
              <Panel title="Lucro por produto (antes dos descontos)" className="mt-6">
                {profit.data.products.length === 0 ? (
                  <EmptyState icon={FileBarChart} title="Sem vendas no período" />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px] text-sm">
                      <thead>
                        <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                          <th className="px-5 py-2 font-medium">Produto</th>
                          <th className="px-3 py-2 text-right font-medium">Qtd.</th>
                          <th className="px-3 py-2 text-right font-medium">Receita</th>
                          <th className="px-3 py-2 text-right font-medium">Custo</th>
                          <th className="px-5 py-2 text-right font-medium">Lucro bruto</th>
                        </tr>
                      </thead>
                      <tbody>
                        {profit.data.products.map((p, i) => (
                          <tr key={i} className="border-b border-border/60">
                            <td className="px-5 py-2">
                              {p.product_name}
                              <span className="text-xs text-muted-foreground">
                                {" "}
                                · {p.size}
                                {p.color ? ` · ${p.color}` : ""}
                              </span>
                            </td>
                            <td className="tabular px-3 py-2 text-right">{p.quantity}</td>
                            <td className="tabular px-3 py-2 text-right">{brl(p.revenue)}</td>
                            <td className="tabular px-3 py-2 text-right text-muted-foreground">{brl(p.cost)}</td>
                            <td className="tabular px-5 py-2 text-right font-semibold">{brl(p.profit)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Panel>
            </>
          ) : null}
        </TabsContent>

        <TabsContent value="estoque">
          {stock.isLoading ? (
            <LoadingRows />
          ) : stock.data ? (
            <>
              <ReportBar onPdf={pdfStock} busy={busy} note="Posição atual (não depende do período)." />
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <StatCard label="Peças em estoque" value={num(stock.data.total_pieces)} />
                <StatCard label="Valor a custo" value={me?.isAdmin ? brl(stock.data.total_cost_value) : "Restrito"} tone="primary" />
                <StatCard label="Estoque baixo" value={num(stock.data.low_count)} tone={stock.data.low_count ? "warning" : "default"} />
                <StatCard label="Zerados" value={num(stock.data.zero_count)} tone={stock.data.zero_count ? "destructive" : "default"} />
              </div>
              <Panel className="mt-6">
                {stock.data.rows.length === 0 ? (
                  <EmptyState icon={FileBarChart} title="Nenhum produto cadastrado" />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[760px] text-sm">
                      <thead>
                        <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                          <th className="px-5 py-2 font-medium">Produto</th>
                          <th className="px-3 py-2 font-medium">Categoria</th>
                          <th className="px-3 py-2 font-medium">Tam.</th>
                          <th className="px-3 py-2 font-medium">Cor</th>
                          <th className="px-3 py-2 text-right font-medium">Qtd.</th>
                          {me?.isAdmin && <th className="px-3 py-2 text-right font-medium">Custo</th>}
                          <th className="px-3 py-2 text-right font-medium">Venda</th>
                          {me?.isAdmin && <th className="px-3 py-2 text-right font-medium">Total a custo</th>}
                          <th className="px-5 py-2 font-medium">Situação</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stock.data.rows.map((x) => (
                          <tr key={x.sku} className="border-b border-border/60">
                            <td className="px-5 py-2 font-medium">{x.name}</td>
                            <td className="px-3 py-2 text-muted-foreground">{x.category}</td>
                            <td className="px-3 py-2">{x.size}</td>
                            <td className="px-3 py-2">{x.color || "—"}</td>
                            <td className="tabular px-3 py-2 text-right font-semibold">{x.stock}</td>
                            {me?.isAdmin && <td className="tabular px-3 py-2 text-right text-muted-foreground">{brl(x.cost_price)}</td>}
                            <td className="tabular px-3 py-2 text-right">{brl(x.sale_price)}</td>
                            {me?.isAdmin && <td className="tabular px-3 py-2 text-right">{brl(x.cost_value)}</td>}
                            <td className="px-5 py-2">
                              <StockBadge stock={x.stock} min={x.min_stock} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Panel>
            </>
          ) : null}
        </TabsContent>
      </Tabs>
    </>
  );
}

function ReportBar({ onPdf, busy, note }: { onPdf: () => void; busy: boolean; note?: string }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
      <p className="text-xs text-muted-foreground">{note}</p>
      <Button onClick={onPdf} disabled={busy}>
        {busy ? <Loader2 className="animate-spin" /> : <Download />} Baixar PDF
      </Button>
    </div>
  );
}
