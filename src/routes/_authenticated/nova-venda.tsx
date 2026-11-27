import { useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Loader2,
  Minus,
  Plus,
  Printer,
  Search,
  ShoppingBag,
  ShoppingCart,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { settingsQuery } from "@/lib/session";
import { useStore } from "@/lib/store";
import { normalize, productsQuery } from "@/lib/catalog";
import {
  cartSubtotal,
  cartTotal,
  clampDiscount,
  discountFromPercent,
  parseMoney,
  paymentsRemaining,
  validatePayments,
} from "@/lib/calc";
import { brl, errorMessage, PAYMENT_METHODS } from "@/lib/format";
import { printReceipt, type SaleDetails } from "@/lib/receipt";
import { EmptyState, LoadingRows, PageHeader, Panel } from "@/components/app/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/nova-venda")({
  head: () => ({
    meta: [
      { title: "Nova venda — Gestão da Loja" },
      {
        name: "description",
        content: "Registre vendas rapidamente com carrinho, desconto e várias formas de pagamento.",
      },
      { property: "og:title", content: "Nova venda — Gestão da Loja" },
      {
        property: "og:description",
        content: "Vendas rápidas com carrinho, desconto e pagamentos.",
      },
    ],
  }),
  component: NewSalePage,
});

interface Item {
  variantId: string;
  name: string;
  size: string;
  color: string;
  price: number;
  stock: number;
}
interface CartItem extends Item {
  qty: number;
}
interface PayDraft {
  key: number;
  method: string;
  amount: string;
}
function createUuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function NewSalePage() {
  const queryClient = useQueryClient();
  const { storeId } = useStore();
  const products = useQuery(productsQuery(storeId));
  const { data: settings } = useQuery(settingsQuery(storeId));
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [open, setOpen] = useState(false);
  const [discountMode, setDiscountMode] = useState<"valor" | "percent">("valor");
  const [discountInput, setDiscountInput] = useState("");
  const [payments, setPayments] = useState<PayDraft[]>([{ key: 1, method: "pix", amount: "" }]);
  const [done, setDone] = useState<{ id: string; number: number } | null>(null);
  const tokenRef = useRef<string>(createUuid());
  const payKey = useRef(2);

  const items: Item[] = useMemo(
    () =>
      (products.data ?? [])
        .filter((p) => p.active)
        .flatMap((p) =>
          p.product_variants
            .filter((v) => v.active)
            .map((v) => ({
              variantId: v.id,
              name: p.name,
              size: v.size,
              color: v.color,
              price: v.sale_price,
              stock: v.stock,
              sku: v.sku,
              code: p.code,
            })),
        ),
    [products.data],
  );

  const results = useMemo(() => {
    const q = normalize(search.trim());
    const list = q
      ? items.filter((i) => {
          const it = i as Item & { sku: string; code: string | null };
          return normalize(`${it.name} ${it.sku} ${it.code ?? ""} ${it.color} ${it.size}`).includes(
            q,
          );
        })
      : items;
    return list.slice(0, 80);
  }, [items, search]);

  const subtotal = cartSubtotal(cart.map((c) => ({ unitPrice: c.price, quantity: c.qty })));
  const discount =
    discountMode === "percent"
      ? discountFromPercent(parseMoney(discountInput), subtotal)
      : clampDiscount(parseMoney(discountInput), subtotal);
  const total = cartTotal(subtotal, discount);
  const payLines = payments.map((p) => ({ method: p.method, amount: parseMoney(p.amount) }));
  // A single payment with no value typed means "pay everything with this method".
  const effectivePayments =
    payments.length === 1 && payments[0] && payments[0].amount.trim() === ""
      ? [{ method: payments[0].method, amount: total }]
      : payLines;
  const remaining = paymentsRemaining(total, effectivePayments);
  const qtyInCart = (id: string) => cart.find((c) => c.variantId === id)?.qty ?? 0;
  const count = cart.reduce((s, c) => s + c.qty, 0);

  function add(item: Item) {
    const inCart = qtyInCart(item.variantId);
    if (inCart >= item.stock) {
      toast.error("Quantidade máxima disponível já está no carrinho.");
      return;
    }
    setCart((c) =>
      inCart
        ? c.map((x) => (x.variantId === item.variantId ? { ...x, qty: x.qty + 1 } : x))
        : [...c, { ...item, qty: 1 }],
    );
    toast.success(`${item.name} (${item.size}${item.color ? ` · ${item.color}` : ""}) adicionado`, {
      duration: 1200,
    });
  }

  function changeQty(id: string, delta: number) {
    setCart((c) =>
      c.map((x) =>
        x.variantId === id ? { ...x, qty: Math.min(Math.max(1, x.qty + delta), x.stock) } : x,
      ),
    );
  }

  function reset() {
    setCart([]);
    setDiscountInput("");
    setPayments([{ key: 1, method: "pix", amount: "" }]);
    tokenRef.current = createUuid();
    setDone(null);
    setOpen(false);
  }

  const finish = useMutation({
    mutationFn: async () => {
      if (!cart.length) throw new Error("O carrinho está vazio.");
      const check = validatePayments(total, effectivePayments);
      if (!check.ok) throw new Error(check.message);
      const { data, error } = await supabase.rpc("create_sale", {
        p_store_id: storeId,
        p_client_token: tokenRef.current,
        p_items: cart.map((c) => ({ variant_id: c.variantId, quantity: c.qty })),
        p_discount: discount,
        p_payments: effectivePayments,
      });
      if (error) throw error;
      return data as { sale_id: string; sale_number: number };
    },
    onSuccess: (data) => {
      setDone({ id: data.sale_id, number: data.sale_number });
      setOpen(false);
      queryClient.invalidateQueries();
    },
    onError: (e) => {
      toast.error(errorMessage(e));
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
  });

  async function printDone() {
    if (!done) return;
    const { data, error } = await supabase.rpc("get_sale_details", {
      p_store_id: storeId,
      p_sale_id: done.id,
    });
    if (error) {
      toast.error(errorMessage(error));
      return;
    }
    printReceipt(data as unknown as SaleDetails, {
      store_name: settings?.store_name ?? "Minha Loja",
      phone: settings?.phone ?? null,
      address: settings?.address ?? null,
    });
  }

  return (
    <>
      <PageHeader
        title="Nova venda"
        description="Busque os produtos e adicione ao carrinho."
        actions={
          <Button onClick={() => setOpen(true)} className="relative">
            <ShoppingCart /> Carrinho
            {count > 0 && (
              <span className="ml-1 rounded-full bg-primary-foreground px-1.5 text-xs font-bold text-primary">
                {count}
              </span>
            )}
          </Button>
        }
      />

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          autoFocus
          className="h-11 pl-9 text-base"
          placeholder="Buscar produto por nome, código, cor ou tamanho"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <Panel>
        {products.isLoading ? (
          <LoadingRows />
        ) : results.length === 0 ? (
          <EmptyState
            icon={ShoppingBag}
            title="Nenhum produto encontrado"
            text="Cadastre produtos ou tente outra busca."
          />
        ) : (
          <ul className="divide-y divide-border">
            {results.map((i) => {
              const inCart = qtyInCart(i.variantId);
              const available = i.stock - inCart;
              return (
                <li key={i.variantId} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{i.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {i.size}
                      {i.color ? ` · ${i.color}` : ""} ·{" "}
                      <span
                        className={cn(
                          i.stock === 0 ? "text-destructive" : i.stock <= 2 ? "text-warning" : "",
                        )}
                      >
                        {i.stock} disponível(is)
                      </span>
                      {inCart > 0 && <span className="text-primary"> · {inCart} no carrinho</span>}
                    </p>
                  </div>
                  <p className="tabular shrink-0 font-semibold">{brl(i.price)}</p>
                  <Button
                    size="sm"
                    variant={available > 0 ? "default" : "secondary"}
                    disabled={available <= 0}
                    onClick={() => add(i)}
                    aria-label={`Adicionar ${i.name}`}
                  >
                    <Plus /> <span className="hidden sm:inline">Adicionar</span>
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      {count > 0 && !open && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/95 p-3 backdrop-blur lg:hidden">
          <Button className="w-full" size="lg" onClick={() => setOpen(true)}>
            <ShoppingCart /> Ver carrinho · {count} peça(s) · {brl(total)}
          </Button>
        </div>
      )}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
          <SheetHeader className="border-b border-border p-5">
            <SheetTitle>Carrinho</SheetTitle>
            <SheetDescription>{count} peça(s)</SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto p-5">
            {cart.length === 0 ? (
              <EmptyState
                icon={ShoppingCart}
                title="Carrinho vazio"
                text="Adicione produtos pela busca."
              />
            ) : (
              <ul className="space-y-3">
                {cart.map((c) => (
                  <li key={c.variantId} className="rounded-lg border border-border bg-surface p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{c.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {c.size}
                          {c.color ? ` · ${c.color}` : ""} · {brl(c.price)} un.
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        aria-label="Remover item"
                        onClick={() =>
                          setCart((list) => list.filter((x) => x.variantId !== c.variantId))
                        }
                      >
                        <Trash2 />
                      </Button>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          aria-label="Diminuir"
                          onClick={() => changeQty(c.variantId, -1)}
                          disabled={c.qty <= 1}
                        >
                          <Minus />
                        </Button>
                        <span className="tabular w-8 text-center text-sm font-semibold">
                          {c.qty}
                        </span>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          aria-label="Aumentar"
                          onClick={() => changeQty(c.variantId, 1)}
                          disabled={c.qty >= c.stock}
                        >
                          <Plus />
                        </Button>
                      </div>
                      <p className="tabular text-sm font-semibold">{brl(c.price * c.qty)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {cart.length > 0 && (
              <div className="mt-6 space-y-5">
                <div className="space-y-1.5">
                  <Label htmlFor="discount">Desconto (opcional)</Label>
                  <div className="flex gap-2">
                    <Input
                      id="discount"
                      inputMode="decimal"
                      placeholder="0"
                      value={discountInput}
                      onChange={(e) => setDiscountInput(e.target.value)}
                    />
                    <div className="flex shrink-0 rounded-md border border-input p-0.5">
                      {(["valor", "percent"] as const).map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setDiscountMode(m)}
                          className={cn(
                            "rounded px-3 text-sm",
                            discountMode === m
                              ? "bg-primary text-primary-foreground"
                              : "text-muted-foreground",
                          )}
                        >
                          {m === "valor" ? "R$" : "%"}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Forma de pagamento</Label>
                  {payments.map((p) => (
                    <div key={p.key} className="flex gap-2">
                      <Select
                        value={p.method}
                        onValueChange={(v) =>
                          setPayments((list) =>
                            list.map((x) => (x.key === p.key ? { ...x, method: v } : x)),
                          )
                        }
                      >
                        <SelectTrigger className="flex-1" aria-label="Forma de pagamento">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PAYMENT_METHODS.map((m) => (
                            <SelectItem key={m.value} value={m.value}>
                              {m.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        className="w-28"
                        inputMode="decimal"
                        aria-label="Valor do pagamento"
                        placeholder={payments.length === 1 ? brl(total) : "0,00"}
                        value={p.amount}
                        onChange={(e) =>
                          setPayments((list) =>
                            list.map((x) =>
                              x.key === p.key ? { ...x, amount: e.target.value } : x,
                            ),
                          )
                        }
                      />
                      {payments.length > 1 && (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Remover pagamento"
                          onClick={() => setPayments((list) => list.filter((x) => x.key !== p.key))}
                        >
                          <X />
                        </Button>
                      )}
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const toText = (n: number) => (n > 0 ? n.toFixed(2).replace(".", ",") : "");
                      setPayments((list) => {
                        const filled =
                          list.length === 1 && list[0] && list[0].amount.trim() === ""
                            ? [{ ...list[0], amount: toText(total) }]
                            : list;
                        const rest = paymentsRemaining(
                          total,
                          filled.map((x) => ({ method: x.method, amount: parseMoney(x.amount) })),
                        );
                        return [
                          ...filled,
                          { key: payKey.current++, method: "dinheiro", amount: toText(rest) },
                        ];
                      });
                    }}
                  >
                    <Plus /> Dividir pagamento
                  </Button>
                  {payments.length > 1 && remaining !== 0 && (
                    <p
                      className={cn("text-xs", remaining > 0 ? "text-warning" : "text-destructive")}
                    >
                      {remaining > 0 ? `Faltam ${brl(remaining)}` : `Excede em ${brl(-remaining)}`}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-1.5 border-t border-border p-5 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal</span>
              <span className="tabular">{brl(subtotal)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Desconto</span>
              <span className="tabular">- {brl(discount)}</span>
            </div>
            <div className="flex justify-between pt-1 text-lg font-semibold">
              <span>Total</span>
              <span className="tabular text-primary">{brl(total)}</span>
            </div>
            <Button
              className="mt-3 w-full"
              size="lg"
              disabled={!cart.length || finish.isPending}
              onClick={() => finish.mutate()}
            >
              {finish.isPending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
              Finalizar venda
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={!!done} onOpenChange={(o) => !o && reset()}>
        <DialogContent className="max-w-sm text-center">
          <DialogHeader className="items-center text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary-soft text-primary">
              <CheckCircle2 className="h-7 w-7" />
            </div>
            <DialogTitle className="pt-2">Venda nº {done?.number} registrada!</DialogTitle>
            <DialogDescription>O estoque já foi atualizado.</DialogDescription>
          </DialogHeader>
          <div className="mt-2 grid gap-2">
            <Button onClick={reset}>
              <ShoppingBag /> Nova venda
            </Button>
            <Button variant="outline" onClick={printDone}>
              <Printer /> Imprimir comprovante
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
