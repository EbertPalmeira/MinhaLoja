import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Loader2, Printer, Receipt, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll, settingsQuery, useMe } from "@/lib/session";
import {
  brl,
  dateTime,
  daysAgoISO,
  errorMessage,
  paymentLabel,
  paymentLabels,
  pct,
  spDayEndExclusiveUTC,
  spDayStartUTC,
  todayISO,
} from "@/lib/format";
import { grossMargin } from "@/lib/calc";
import { printReceipt, type SaleDetails } from "@/lib/receipt";
import { EmptyState, LoadingRows, PageHeader, Panel, StatusBadge } from "@/components/app/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/vendas")({
  head: () => ({
    meta: [
      { title: "Histórico de vendas — Gestão da Loja" },
      { name: "description", content: "Consulte todas as vendas, veja detalhes e cancele quando necessário." },
      { property: "og:title", content: "Histórico de vendas — Gestão da Loja" },
      { property: "og:description", content: "Todas as vendas da loja com detalhes e cancelamentos." },
    ],
  }),
  component: SalesHistory,
});

function SalesHistory() {
  const [from, setFrom] = useState(daysAgoISO(30));
  const [to, setTo] = useState(todayISO());
  const [number, setNumber] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const sales = useQuery({
    queryKey: ["sales", "history", from, to],
    enabled: !!from && !!to && from <= to,
    queryFn: () =>
      fetchAll((a, b) =>
        supabase
          .from("sales")
          .select("id, number, created_at, items_count, total, status, sale_payments(method)")
          .gte("created_at", spDayStartUTC(from))
          .lt("created_at", spDayEndExclusiveUTC(to))
          .order("created_at", { ascending: false })
          .range(a, b),
      ),
  });

  const byNumber = useQuery({
    queryKey: ["sales", "number", number],
    enabled: /^\d+$/.test(number.trim()),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("id, number, created_at, items_count, total, status, sale_payments(method)")
        .eq("number", Number(number.trim()));
      if (error) throw error;
      return data;
    },
  });

  const searching = /^\d+$/.test(number.trim());
  const list = searching ? byNumber.data : sales.data;
  const loading = searching ? byNumber.isLoading : sales.isLoading;

  const totals = useMemo(() => {
    const valid = (list ?? []).filter((s) => s.status === "concluida");
    return { count: valid.length, total: valid.reduce((s, x) => s + Number(x.total), 0) };
  }, [list]);

  return (
    <>
      <PageHeader title="Histórico de vendas" description="Toque em uma venda para ver os detalhes." />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="col-span-2 space-y-1 sm:col-span-2">
          <Label htmlFor="num" className="text-xs text-muted-foreground">
            Número da venda
          </Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="num" inputMode="numeric" className="pl-9" placeholder="Ex.: 12" value={number} onChange={(e) => setNumber(e.target.value.replace(/\D/g, ""))} />
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="from" className="text-xs text-muted-foreground">
            De
          </Label>
          <Input id="from" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} disabled={searching} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="to" className="text-xs text-muted-foreground">
            Até
          </Label>
          <Input id="to" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} disabled={searching} />
        </div>
      </div>

      <Panel
        title={searching ? `Busca pela venda nº ${number}` : "Vendas no período"}
        actions={
          <p className="text-sm text-muted-foreground">
            {totals.count} concluída(s) · <span className="tabular font-semibold text-foreground">{brl(totals.total)}</span>
          </p>
        }
      >
        {loading ? (
          <LoadingRows />
        ) : !list?.length ? (
          <EmptyState icon={Receipt} title="Nenhuma venda encontrada" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-5 py-3 font-medium">Nº</th>
                  <th className="px-3 py-3 font-medium">Data e hora</th>
                  <th className="px-3 py-3 text-right font-medium">Itens</th>
                  <th className="px-3 py-3 text-right font-medium">Total</th>
                  <th className="px-3 py-3 font-medium">Pagamento</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {list.map((s) => (
                  <tr
                    key={s.id}
                    className="cursor-pointer border-b border-border/60 transition-colors hover:bg-accent/40"
                    onClick={() => setSelected(s.id)}
                  >
                    <td className="px-5 py-3 font-semibold">#{s.number}</td>
                    <td className="px-3 py-3 text-muted-foreground">{dateTime(s.created_at)}</td>
                    <td className="tabular px-3 py-3 text-right">{s.items_count}</td>
                    <td className="tabular px-3 py-3 text-right font-semibold">{brl(s.total)}</td>
                    <td className="px-3 py-3">{paymentLabels(s.sale_payments.map((p) => p.method))}</td>
                    <td className="px-5 py-3">
                      <StatusBadge status={s.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <SaleSheet saleId={selected} onClose={() => setSelected(null)} />
    </>
  );
}

function SaleSheet({ saleId, onClose }: { saleId: string | null; onClose: () => void }) {
  const { data: me } = useMe();
  const { data: settings } = useQuery(settingsQuery);
  const queryClient = useQueryClient();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState("");

  const details = useQuery({
    queryKey: ["sale", saleId],
    enabled: !!saleId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_sale_details", { p_sale_id: saleId! });
      if (error) throw error;
      return data as unknown as SaleDetails;
    },
  });

  const cancel = useMutation({
    mutationFn: async () => {
      if (reason.trim().length < 3) throw new Error("Informe a justificativa.");
      const { error } = await supabase.rpc("cancel_sale", { p_sale_id: saleId!, p_reason: reason.trim() });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Venda cancelada e estoque devolvido.");
      setCancelOpen(false);
      setReason("");
      queryClient.invalidateQueries();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const d = details.data;

  return (
    <Sheet open={!!saleId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Venda {d ? `nº ${d.number}` : ""}</SheetTitle>
          <SheetDescription>{d ? dateTime(d.created_at) : "Carregando..."}</SheetDescription>
        </SheetHeader>

        {details.isLoading || !d ? (
          <LoadingRows />
        ) : (
          <div className="mt-4 space-y-5 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={d.status} />
              {d.seller_email && <span className="text-xs text-muted-foreground">Vendido por {d.seller_email}</span>}
            </div>

            {d.status === "cancelada" && (
              <div className="rounded-lg bg-destructive-soft p-3 text-destructive">
                <p className="font-medium">Cancelada em {dateTime(d.canceled_at)}</p>
                <p className="mt-1 text-xs">
                  Motivo: {d.cancel_reason}
                  {d.canceled_by_email ? ` · por ${d.canceled_by_email}` : ""}
                </p>
              </div>
            )}

            <div className="rounded-lg border border-border">
              {d.items.map((i, idx) => (
                <div key={idx} className="flex items-start justify-between gap-3 border-b border-border/60 px-4 py-3 last:border-0">
                  <div className="min-w-0">
                    <p className="font-medium">{i.product_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {i.size}
                      {i.color ? ` · ${i.color}` : ""} · {i.quantity} × {brl(i.unit_price)}
                      {me?.isAdmin && i.unit_cost !== null && ` · custo ${brl(i.unit_cost)}`}
                    </p>
                  </div>
                  <p className="tabular shrink-0 font-semibold">{brl(i.line_total)}</p>
                </div>
              ))}
            </div>

            <div className="space-y-1.5">
              <Line label="Subtotal" value={brl(d.subtotal)} />
              <Line label="Desconto" value={`- ${brl(d.discount)}`} />
              <Line label="Total" value={brl(d.total)} strong />
              {me?.isAdmin && d.gross_profit !== null && (
                <>
                  <Line label="Custo dos produtos" value={brl(d.total_cost)} />
                  <Line
                    label="Lucro bruto"
                    value={`${brl(d.gross_profit)} (${pct(grossMargin(Number(d.total), Number(d.total_cost)))})`}
                    accent
                  />
                </>
              )}
            </div>

            <div>
              <p className="mb-1.5 text-xs uppercase tracking-wide text-muted-foreground">Pagamento</p>
              {d.payments.map((p, idx) => (
                <Line key={idx} label={paymentLabel(p.method)} value={brl(p.amount)} />
              ))}
            </div>

            <div className="flex flex-wrap gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() =>
                  printReceipt(d, {
                    store_name: settings?.store_name ?? "Minha Loja",
                    phone: settings?.phone ?? null,
                    address: settings?.address ?? null,
                  })
                }
              >
                <Printer /> Imprimir comprovante
              </Button>
              {me?.isAdmin && d.status === "concluida" && (
                <Button variant="destructive" onClick={() => setCancelOpen(true)}>
                  <Ban /> Cancelar venda
                </Button>
              )}
            </div>
          </div>
        )}

        <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Cancelar venda nº {d?.number}?</DialogTitle>
              <DialogDescription>
                As peças voltam para o estoque e a venda fica registrada como cancelada. Isso não pode ser desfeito.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="reason">Justificativa</Label>
              <Textarea id="reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: Cliente devolveu a peça" />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCancelOpen(false)}>
                Voltar
              </Button>
              <Button variant="destructive" onClick={() => cancel.mutate()} disabled={cancel.isPending}>
                {cancel.isPending && <Loader2 className="animate-spin" />} Confirmar cancelamento
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </SheetContent>
    </Sheet>
  );
}

function Line({ label, value, strong, accent }: { label: string; value: string; strong?: boolean; accent?: boolean }) {
  return (
    <div className={`flex justify-between ${strong ? "text-base font-semibold" : "text-muted-foreground"}`}>
      <span>{label}</span>
      <span className={`tabular ${strong ? "text-foreground" : ""} ${accent ? "font-semibold text-primary" : ""}`}>{value}</span>
    </div>
  );
}
