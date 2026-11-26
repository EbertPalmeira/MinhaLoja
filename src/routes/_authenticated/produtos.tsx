import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Copy, ExternalLink, ImageOff, Pencil, Plus, Search, Shirt, X } from "lucide-react";
import { toast } from "sonner";
import { useMe } from "@/lib/session";
import { costsQuery, normalize, productsQuery, type Product } from "@/lib/catalog";
import { grossMargin, unitProfit } from "@/lib/calc";
import { brl, pct } from "@/lib/format";
import { EmptyState, LoadingRows, PageHeader, Panel, StockBadge } from "@/components/app/common";
import { ProductDialog } from "@/components/app/ProductDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/produtos")({
  head: () => ({
    meta: [
      { title: "Produtos — Gestão da Loja" },
      { name: "description", content: "Cadastre e consulte produtos, tamanhos, estoque e preços." },
      { property: "og:title", content: "Produtos — Gestão da Loja" },
      {
        property: "og:description",
        content: "Cadastro e consulta de produtos, tamanhos, estoque e preços.",
      },
    ],
  }),
  component: ProductsPage,
});

function ProductsPage() {
  const { data: me } = useMe();
  const products = useQuery(productsQuery);
  const costs = useQuery({ ...costsQuery, enabled: !!me?.isAdmin });
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("todas");
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [creating, setCreating] = useState(false);

  const categories = useMemo(
    () =>
      [...new Set((products.data ?? []).map((p) => p.category))].sort((a, b) => a.localeCompare(b)),
    [products.data],
  );

  const filtered = useMemo(() => {
    const q = normalize(search.trim());
    return (products.data ?? []).filter((p) => {
      if (!showInactive && !p.active) return false;
      if (category !== "todas" && p.category !== category) return false;
      if (!q) return true;
      return (
        normalize(p.name).includes(q) ||
        normalize(p.code ?? "").includes(q) ||
        p.product_variants.some(
          (v) => normalize(v.sku).includes(q) || normalize(v.size).includes(q),
        )
      );
    });
  }, [products.data, search, category, showInactive]);

  const isAdmin = !!me?.isAdmin;
  const isFormOpen = creating || !!editing;

  const closeForm = () => {
    setCreating(false);
    setEditing(null);
  };

  const copyCatalogLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/catalogo`);
      toast.success("Link do catálogo copiado.");
    } catch {
      toast.error("Não foi possível copiar o link.");
    }
  };

  return (
    <>
      <PageHeader
        title="Produtos"
        description="Gerencie seus produtos, preços e estoque de forma simples."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={copyCatalogLink}>
              <Copy /> Copiar link do catálogo
            </Button>
            <Button type="button" variant="outline" asChild>
              <a href="/catalogo" target="_blank" rel="noopener noreferrer">
                <ExternalLink /> Visualizar
              </a>
            </Button>
            {me?.canManageCatalog && (
              <Button
                onClick={() => {
                  setEditing(null);
                  setCreating(true);
                }}
              >
                <Plus /> Novo produto
              </Button>
            )}
          </div>
        }
      />

      {isFormOpen && (
        <Panel className="mb-5 p-5">
          <div className="mb-4 flex items-center justify-between border-b border-border pb-3">
            <div>
              <h2 className="text-base font-semibold">
                {editing ? `Editar: ${editing.name}` : "Cadastrar novo produto"}
              </h2>
              <p className="text-xs text-muted-foreground">
                Preencha os dados principais e salve direto na página.
              </p>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={closeForm}>
              <X className="h-4 w-4" /> Fechar
            </Button>
          </div>

          <ProductDialog
            product={editing}
            categories={categories}
            costs={costs.data}
            onClose={closeForm}
          />
        </Panel>
      )}

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar por nome, código ou tamanho"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="sm:w-52" aria-label="Filtrar por categoria">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as categorias</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Switch id="inactive" checked={showInactive} onCheckedChange={setShowInactive} />
          <Label htmlFor="inactive" className="text-sm text-muted-foreground">
            Mostrar inativos
          </Label>
        </div>
      </div>

      {products.isLoading ? (
        <Panel>
          <LoadingRows />
        </Panel>
      ) : products.error ? (
        <Panel>
          <p className="px-5 py-10 text-center text-sm text-destructive">
            Não foi possível carregar os produtos.
          </p>
        </Panel>
      ) : filtered.length === 0 ? (
        <Panel>
          <EmptyState
            icon={Shirt}
            title={
              products.data?.length ? "Nenhum produto encontrado" : "Nenhum produto cadastrado"
            }
            text={
              products.data?.length
                ? "Tente outra busca ou categoria."
                : "Cadastre o primeiro produto para começar a vender."
            }
          />
        </Panel>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((p) => (
            <ProductCard
              key={p.id}
              product={p}
              isAdmin={isAdmin}
              costs={costs.data}
              onEdit={
                me?.canManageCatalog
                  ? () => {
                      setCreating(false);
                      setEditing(p);
                    }
                  : undefined
              }
            />
          ))}
        </div>
      )}
    </>
  );
}

function ProductCard({
  product,
  isAdmin,
  costs,
  onEdit,
}: {
  product: Product;
  isAdmin: boolean;
  costs?: Map<string, number> | undefined;
  onEdit?: (() => void) | undefined;
}) {
  const firstVariant = product.product_variants[0];
  const totalStock = product.product_variants.reduce((s, v) => s + v.stock, 0);
  const cost = firstVariant ? costs?.get(firstVariant.id) : undefined;

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xs transition hover:border-primary/40",
        !product.active && "opacity-60",
      )}
    >
      {/* Imagem do produto */}
      <div className="relative aspect-square w-full overflow-hidden bg-muted/40">
        {product.image_url ? (
          <img
            src={product.image_url}
            alt={product.name}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 text-muted-foreground">
            <ImageOff className="h-8 w-8 opacity-40" />
            <span className="text-xs">Sem foto</span>
          </div>
        )}

        <div className="absolute left-2.5 top-2.5 flex flex-wrap gap-1.5">
          <span className="rounded-full bg-background/90 px-2.5 py-0.5 text-xs font-medium text-foreground backdrop-blur-xs">
            {product.category}
          </span>
          {!product.active && (
            <span className="rounded-full bg-destructive px-2.5 py-0.5 text-xs font-medium text-destructive-foreground">
              Inativo
            </span>
          )}
        </div>
      </div>

      {/* Conteúdo do card */}
      <div className="flex flex-1 flex-col justify-between gap-3 p-4">
        <div>
          <div className="flex items-start justify-between gap-2">
            <h3 className="line-clamp-2 font-semibold leading-snug">{product.name}</h3>
            {firstVariant && <StockBadge stock={totalStock} min={firstVariant.min_stock} />}
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
            {firstVariant?.size && <span>Tam. {firstVariant.size}</span>}
            {product.code && <span>• Cód. {product.code}</span>}
            {firstVariant?.sku && <span className="font-mono">• {firstVariant.sku}</span>}
          </div>
        </div>

        <div className="space-y-3 border-t border-border pt-3">
          <div className="flex items-baseline justify-between">
            <div>
              <span className="text-xs text-muted-foreground">Venda</span>
              <p className="tabular text-lg font-bold">
                {firstVariant ? brl(firstVariant.sale_price) : "—"}
              </p>
            </div>

            <div className="text-right">
              <span className="text-xs text-muted-foreground">Estoque</span>
              <p className="tabular text-sm font-semibold">{totalStock} un.</p>
            </div>
          </div>

          {isAdmin && firstVariant && cost !== undefined && (
            <div className="flex items-center justify-between rounded-md bg-muted/40 px-2.5 py-1.5 text-xs text-muted-foreground">
              <span>Custo: {brl(cost)}</span>
              <span>
                Lucro:{" "}
                <strong className="text-foreground">
                  {brl(unitProfit(firstVariant.sale_price, cost))}
                </strong>{" "}
                ({pct(grossMargin(firstVariant.sale_price, cost))})
              </span>
            </div>
          )}

          {onEdit && (
            <Button type="button" variant="outline" size="sm" className="w-full" onClick={onEdit}>
              <Pencil className="h-3.5 w-3.5" /> Editar produto
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
