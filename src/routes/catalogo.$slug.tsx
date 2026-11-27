import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { MapPin, MessageCircle, Package, Search } from "lucide-react";
import { publicCatalogQuery, type PublicProduct } from "@/lib/catalog";
import { brl } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/catalogo/$slug")({
  head: () => ({
    meta: [
      { title: "Catálogo" },
      { name: "description", content: "Confira os produtos disponíveis e faça seu pedido pelo WhatsApp." },
    ],
  }),
  component: CatalogoPage,
});

function CatalogoPage() {
  const { slug } = Route.useParams();
  const { data: catalog, isLoading, isError } = useQuery(publicCatalogQuery(slug));
  const settings = catalog?.store;
  const activeProducts = useMemo(() => catalog?.products ?? [], [catalog]);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("Todas");

  const categories = useMemo(() => {
    const set = new Set<string>(["Todas"]);
    for (const p of activeProducts) {
      if (p.category) set.add(p.category);
    }
    return Array.from(set);
  }, [activeProducts]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return activeProducts.filter((p) => {
      const matchesCat = selectedCategory === "Todas" || p.category === selectedCategory;
      const matchesQuery =
        !q || p.name.toLowerCase().includes(q) || (p.category ?? "").toLowerCase().includes(q);
      return matchesCat && matchesQuery;
    });
  }, [activeProducts, search, selectedCategory]);

  const handleWhatsapp = (product: PublicProduct) => {
    const v = product.variants.find((variant) => variant.in_stock) ?? product.variants[0];
    const priceText = v ? brl(v.sale_price) : "sob consulta";
    const sizeText = v?.size && v.size !== "Único" ? ` (${v.size})` : "";
    const msg = `Olá! Vi no catálogo e tenho interesse no produto: *${product.name}*${sizeText} - ${priceText}.`;
    const phone = settings?.phone?.replace(/\D/g, "") ?? "";
    const whatsappNumber = phone ? (phone.startsWith("55") ? phone : `55${phone}`) : "";
    const url = whatsappNumber
      ? `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(msg)}`
      : `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  if (!isLoading && (isError || !catalog)) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="max-w-sm text-center">
          <Package className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
          <h1 className="text-lg font-semibold">Catálogo não encontrado</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Confira o link com a loja. O endereço pode ter mudado.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/20">
      {/* Cabeçalho */}
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              {settings?.logo_url ? (
                <img
                  src={settings.logo_url}
                  alt=""
                  className="h-11 w-11 rounded-xl border border-border object-cover"
                />
              ) : (
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
                  <Package className="h-5 w-5 text-primary" />
                </div>
              )}
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-primary">
                  Catálogo
                </p>
                <h1 className="text-2xl font-bold tracking-tight">
                  {settings?.name ?? "Catálogo de Produtos"}
                </h1>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Confira as novidades disponíveis e faça seu pedido direto pelo WhatsApp.
            </p>
            {settings?.address && (
              <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="h-3 w-3" /> {settings.address}
              </p>
            )}
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar produto ou categoria..."
              className="pl-9 bg-background"
            />
          </div>
        </div>

        {/* Categorias */}
        {categories.length > 1 && (
          <div className="mx-auto flex max-w-6xl gap-2 overflow-x-auto px-4 pb-3">
            {categories.map((cat) => {
              const activeCat = selectedCategory === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium transition ${
                    activeCat
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                  }`}
                >
                  {cat}
                </button>
              );
            })}
          </div>
        )}
      </header>

      {/* Grade de produtos */}
      <main className="mx-auto max-w-6xl px-4 py-8">
        {isLoading ? (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-80 animate-pulse rounded-xl border border-border bg-card" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center">
            <Package className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
            <h2 className="text-base font-semibold">Nenhum produto encontrado</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Tente limpar a busca ou selecionar outra categoria.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((product) => {
              const mainVariant = product.variants.find((v) => v.in_stock) ?? product.variants[0];
              const outOfStock = !product.variants.some((v) => v.in_stock);

              return (
                <article
                  key={product.id}
                  className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xs transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div className="relative aspect-square w-full overflow-hidden bg-muted">
                    {product.image_url ? (
                      <img
                        src={product.image_url}
                        alt={product.name}
                        loading="lazy"
                        className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground">
                        <Package className="h-10 w-10 opacity-40" />
                        <span className="text-xs">Sem foto</span>
                      </div>
                    )}

                    <div className="absolute left-2.5 top-2.5 flex gap-1.5">
                      {product.category && (
                        <Badge variant="secondary" className="bg-background/90 backdrop-blur-xs">
                          {product.category}
                        </Badge>
                      )}
                    </div>

                    {outOfStock && (
                      <div className="absolute inset-0 flex items-center justify-center bg-background/70 backdrop-blur-[1px]">
                        <Badge variant="destructive">Esgotado</Badge>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-1 flex-col justify-between gap-4 p-4">
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <h2 className="line-clamp-2 font-semibold leading-snug text-foreground">
                          {product.name}
                        </h2>
                      </div>

                      {mainVariant?.size && mainVariant.size !== "Único" && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Tamanho:{" "}
                          <span className="font-medium text-foreground">{mainVariant.size}</span>
                        </p>
                      )}
                    </div>

                    <div className="space-y-3 border-t border-border pt-3">
                      <div className="flex items-baseline justify-between">
                        <span className="text-lg font-bold text-foreground">
                          {mainVariant ? brl(mainVariant.sale_price) : "—"}
                        </span>
                        {!outOfStock && (
                          <span className="text-xs text-muted-foreground">Disponível</span>
                        )}
                      </div>

                      <Button
                        type="button"
                        className="w-full gap-2"
                        disabled={outOfStock}
                        onClick={() => handleWhatsapp(product)}
                      >
                        <MessageCircle className="h-4 w-4" />
                        {outOfStock ? "Indisponível" : "Pedir no WhatsApp"}
                      </Button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
