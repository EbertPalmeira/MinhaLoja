import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowDownUp, Boxes, Coins, History, Loader2, PackageX, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/session";
import { costsQuery, normalize, productsQuery } from "@/lib/catalog";
import { brl, dateTime, errorMessage, num } from "@/lib/format";
import { EmptyState, LoadingRows, PageHeader, Panel, StatCard, StockBadge } from "@/components/app/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/estoque")({
  head: () => ({
    meta: [
      { title: "Estoque — Gestão da Loja" },
      { name: "description", content: "Acompanhe o estoque por tamanho e cor e registre entradas, saídas e ajustes." },
      { property: "og:title", content: "Estoque — Gestão da Loja" },
      { property: "og:description", content: "Estoque por tamanho e cor, com entradas, saídas e ajustes." },
    ],
  }),
  component: StockPage,
});

interface Row {
  id: string;
  name: string;
  category: string;
  sku: string;
  size: string;
  color: string;
  stock: number;
  min: number;
}

const MOVE_LABEL: Record<string, string> = {
  entrada: "Entrada",
  saida: "Saída",
  ajuste: "Ajuste",
  venda: "Venda",
  cancelamento: "Cancelamento",
};

function StockPage() {
  const { data: me } = useMe();
  const products = useQuery(productsQuery);
  const costs = useQuery({ ...costsQuery, enabled: !!me?.isAdmin });
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("todos");
  const [moving, setMoving] = useState<Row | null>(null);

  const movements = useQuery({
    queryKey: ["stock_movements"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_movements")
        .select("id, movement_type, quantity, stock_after, reason, created_at, product_variants(size, color, products(name))")
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data;
    },
  });

  const rows: Row[] = useMemo(
    () =>
      (products.data ?? [])
        .filter((p) => p.active)
        .flatMap((p) =>
          p.product_variants
            .filter((v) => v.active)
            .map((v) => ({
              id: v.id,
              name: p.name,
              category: p.category,
              sku: v.sku,
              size: v.size,
              color: v.color,
              stock: v.stock,
              min: v.min_stock,
            })),
        ),
    [products.data],
  );

  const filtered = useMemo(() => {
    const q = normalize(search.trim());
    return rows.filter((r) => {
      if (status === "baixo" && !(r.stock > 0 && r.stock <= r.min)) return false;
      if (status === "zerado" && r.stock !== 0) return false;
      if (!q) return true;
      return normalize(r.name).includes(q) || normalize(r.sku).includes(q);
    });
  }, [rows, search, status]);

  const isAdmin = !!me?.isAdmin;
  const totalPieces = rows.reduce((s, r) => s + r.stock, 0);
  const invested = rows.reduce((s, r) => s + r.stock * (costs.data?.get(r.id) ?? 0), 0);
  const low = rows.filter((r) => r.stock > 0 && r.stock <= r.min).length;
  const zero = rows.filter((r) => r.stock === 0).length;
  const filteredInvested = filtered.reduce((s, r) => s + r.stock * (costs.data?.get(r.id) ?? 0), 0);

  return (
    <>
      <PageHeader title="Estoque" description="Quantidades por tamanho e cor, atualizadas a cada venda." />

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="Peças em estoque" value={num(totalPieces)} icon={Boxes} />
        <StatCard
          label="Valor investido (custo)"
          value={isAdmin ? brl(invested) : "Restrito"}
          icon={Coins}
          tone="primary"
        />
        <StatCard label="Estoque baixo" value={num(low)} icon={AlertTriangle} tone={low ? "warning" : "default"} />
        <StatCard label="Zerados" value={num(zero)} icon={PackageX} tone={zero ? "destructive" : "default"} />
      </div>

      {(low > 0 || zero > 0) && (
        <div className="mt-4 flex items-start gap-3 rounded-xl border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-warning">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            {zero > 0 && `${zero} variação(ões) zerada(s). `}
            {low > 0 && `${low} variação(ões) com estoque baixo. `}
            Use o filtro para ver quais repor.
          </p>
        </div>
      )}

      <div className="my-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar por nome ou SKU" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="sm:w-48" aria-label="Filtrar por situação">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todas as situações</SelectItem>
            <SelectItem value="baixo">Estoque baixo</SelectItem>
            <SelectItem value="zerado">Zerados</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Panel>
        {products.isLoading ? (
          <LoadingRows />
        ) : filtered.length === 0 ? (
          <EmptyState icon={Boxes} title="Nada por aqui" text="Nenhum item corresponde ao filtro." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-5 py-3 font-medium">Produto</th>
                  <th className="px-3 py-3 font-medium">Tamanho</th>
                  <th className="px-3 py-3 font-medium">Cor</th>
                  <th className="px-3 py-3 text-right font-medium">Disponível</th>
                  <th className="px-3 py-3 text-right font-medium">Mínimo</th>
                  {isAdmin && <th className="px-3 py-3 text-right font-medium">Custo</th>}
                  {isAdmin && <th className="px-3 py-3 text-right font-medium">Investido</th>}
                  <th className="px-3 py-3 font-medium">Situação</th>
                  {me?.canManageCatalog && <th className="px-5 py-3" />}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const cost = costs.data?.get(r.id) ?? 0;
                  return (
                    <tr key={r.id} className="border-b border-border/60">
                      <td className="px-5 py-2.5">
                        <p className="font-medium">{r.name}</p>
                        <p className="font-mono text-xs text-muted-foreground">{r.sku}</p>
                      </td>
                      <td className="px-3 py-2.5">{r.size}</td>
                      <td className="px-3 py-2.5">{r.color || "—"}</td>
                      <td className={cn("tabular px-3 py-2.5 text-right font-semibold", r.stock === 0 && "text-destructive", r.stock > 0 && r.stock <= r.min && "text-warning")}>
                        {r.stock}
                      </td>
                      <td className="tabular px-3 py-2.5 text-right text-muted-foreground">{r.min}</td>
                      {isAdmin && <td className="tabular px-3 py-2.5 text-right text-muted-foreground">{brl(cost)}</td>}
                      {isAdmin && <td className="tabular px-3 py-2.5 text-right">{brl(cost * r.stock)}</td>}
                      <td className="px-3 py-2.5">
                        <StockBadge stock={r.stock} min={r.min} />
                      </td>
                      {me?.canManageCatalog && (
                        <td className="px-5 py-2.5 text-right">
                          <Button variant="outline" size="sm" onClick={() => setMoving(r)}>
                            <ArrowDownUp /> Movimentar
                          </Button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
              {isAdmin && (
                <tfoot>
                  <tr className="text-sm">
                    <td className="px-5 py-3 font-semibold" colSpan={3}>
                      Total filtrado
                    </td>
                    <td className="tabular px-3 py-3 text-right font-semibold">{num(filtered.reduce((s, r) => s + r.stock, 0))}</td>
                    <td colSpan={2} />
                    <td className="tabular px-3 py-3 text-right font-semibold">{brl(filteredInvested)}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </Panel>

      <Panel className="mt-6" title={<span className="flex items-center gap-2"><History className="h-4 w-4 text-primary" /> Últimas movimentações</span>}>
        {movements.isLoading ? (
          <LoadingRows />
        ) : !movements.data?.length ? (
          <EmptyState icon={History} title="Nenhuma movimentação" />
        ) : (
          <ul className="divide-y divide-border">
            {movements.data.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {m.product_variants?.products?.name} · {m.product_variants?.size}
                    {m.product_variants?.color ? ` · ${m.product_variants.color}` : ""}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {MOVE_LABEL[m.movement_type]} · {m.reason} · {dateTime(m.created_at)}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className={cn("tabular font-semibold", m.quantity > 0 ? "text-primary" : "text-destructive")}>
                    {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                  </p>
                  <p className="text-xs text-muted-foreground">saldo {m.stock_after}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {moving && <MovementDialog row={moving} onClose={() => setMoving(null)} />}
    </>
  );
}

function MovementDialog({ row, onClose }: { row: Row; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [type, setType] = useState<"entrada" | "saida" | "ajuste">("entrada");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");

  const qty = Number(quantity || 0);
  const preview = type === "entrada" ? row.stock + qty : type === "saida" ? row.stock - qty : qty;

  const save = useMutation({
    mutationFn: async () => {
      if (quantity === "" || !Number.isInteger(qty) || qty < 0 || (type !== "ajuste" && qty === 0))
        throw new Error("Informe uma quantidade válida.");
      if (reason.trim().length < 3) throw new Error("Informe o motivo.");
      if (preview < 0) throw new Error(`Saída maior que o estoque disponível (${row.stock}).`);
      const { error } = await supabase.rpc("register_stock_movement", {
        p_variant_id: row.id,
        p_type: type,
        p_quantity: qty,
        p_reason: reason.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Estoque atualizado.");
      queryClient.invalidateQueries();
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Movimentar estoque</DialogTitle>
          <DialogDescription>
            {row.name} · {row.size}
            {row.color ? ` · ${row.color}` : ""} — atual: {row.stock}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-3 gap-2">
          {(["entrada", "saida", "ajuste"] as const).map((t) => (
            <Button key={t} type="button" variant={type === t ? "default" : "outline"} onClick={() => setType(t)}>
              {MOVE_LABEL[t]}
            </Button>
          ))}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="mv-qty">{type === "ajuste" ? "Quantidade correta em estoque" : "Quantidade"}</Label>
          <Input id="mv-qty" inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value.replace(/\D/g, ""))} />
          {quantity !== "" && (
            <p className={cn("text-xs", preview < 0 ? "text-destructive" : "text-muted-foreground")}>
              Novo saldo: {preview}
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="mv-reason">Motivo</Label>
          <Textarea
            id="mv-reason"
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={type === "entrada" ? "Ex.: Compra do fornecedor" : type === "saida" ? "Ex.: Peça com defeito" : "Ex.: Contagem de inventário"}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending && <Loader2 className="animate-spin" />} Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
