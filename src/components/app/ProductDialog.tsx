import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Loader2, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { settingsQuery } from "@/lib/session";
import {
  isDevAdminLoggedIn,
  readDevProducts,
  writeDevProducts,
  type Product,
  type Variant,
} from "@/lib/catalog";
import { compressProductImage, fileToDataUrl, uploadProductImage } from "@/lib/image";
import { grossMargin, parseMoney, suggestSku, unitProfit } from "@/lib/calc";
import { brl, errorMessage, pct } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const moneyText = (n: number | undefined) =>
  n === undefined ? "" : n.toFixed(2).replace(".", ",");

export function ProductDialog({
  product,
  categories,
  costs,
  onClose,
}: {
  product: Product | null;
  categories: string[];
  costs?: Map<string, number> | undefined;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { data: settings } = useQuery(settingsQuery);
  const defaultMin = String(settings?.default_min_stock ?? 2);

  const firstVariant = product?.product_variants[0];
  const isEditing = !!product;

  const [name, setName] = useState(product?.name ?? "");
  const [code, setCode] = useState(product?.code ?? "");
  const [category, setCategory] = useState(product?.category ?? "");
  const [size, setSize] = useState(firstVariant?.size ?? "Único");
  const [sku, setSku] = useState(firstVariant?.sku ?? "");
  const [skuTouched, setSkuTouched] = useState(!!firstVariant?.sku);
  const [cost, setCost] = useState(firstVariant ? moneyText(costs?.get(firstVariant.id)) : "");
  const [price, setPrice] = useState(firstVariant ? moneyText(firstVariant.sale_price) : "");
  const [stock, setStock] = useState(firstVariant ? String(firstVariant.stock) : "0");
  const [addStock, setAddStock] = useState("");
  const [minStock, setMinStock] = useState(
    firstVariant ? String(firstVariant.min_stock) : defaultMin,
  );
  const [active, setActive] = useState(product?.active ?? true);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [imageUrl, setImageUrl] = useState<string | null>(product?.image_url ?? null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [processingImage, setProcessingImage] = useState(false);

  const syncSku = (nextName: string, nextCode: string, nextSize: string) => {
    if (skuTouched || isEditing) return;
    setSku(suggestSku(nextCode || nextName.slice(0, 6), nextSize || "Único", ""));
  };

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.files?.[0];
    if (!raw) return;

    try {
      setProcessingImage(true);
      const optimized = await compressProductImage(raw);
      setImageFile(optimized);
      const preview = await fileToDataUrl(optimized);
      setImageUrl(preview);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setProcessingImage(false);
    }
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Informe o nome do produto.");

      const parsedPrice = parseMoney(price);
      if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
        throw new Error("Informe um preço de venda válido.");
      }

      const parsedCost = cost.trim() === "" && isEditing ? null : parseMoney(cost);
      if (parsedCost !== null && (!Number.isFinite(parsedCost) || parsedCost < 0)) {
        throw new Error("Informe um custo válido.");
      }

      const parsedStock = Number(stock || 0);
      const parsedAddStock = addStock.trim() === "" ? 0 : Number(addStock);
      const parsedMin = Number(minStock || 0);

      if (!Number.isInteger(parsedStock) || parsedStock < 0) {
        throw new Error("Estoque inválido.");
      }
      if (!Number.isInteger(parsedAddStock) || parsedAddStock < 0) {
        throw new Error("Quantidade a adicionar inválida.");
      }
      if (!Number.isInteger(parsedMin) || parsedMin < 0) {
        throw new Error("Estoque mínimo inválido.");
      }

      const cleanSize = size.trim() || "Único";
      const cleanSku = (
        sku.trim() || suggestSku(code || name.slice(0, 6), cleanSize, "")
      ).toUpperCase();
      const productId = product?.id ?? `dev-prod-${Date.now()}`;

      if (isDevAdminLoggedIn()) {
        const current = readDevProducts();
        const variantId = firstVariant?.id ?? `dev-var-${Date.now()}`;
        const currentStock = firstVariant?.stock ?? parsedStock;
        const nextStock = isEditing ? currentStock + parsedAddStock : parsedStock;

        const nextVariant: Variant = {
          id: variantId,
          product_id: productId,
          sku: cleanSku,
          size: cleanSize,
          color: "",
          sale_price: parsedPrice,
          stock: nextStock,
          min_stock: parsedMin,
          active,
        };

        const nextProduct: Product = {
          id: productId,
          name: name.trim(),
          code: code.trim() || null,
          category: category.trim() || "Geral",
          image_url: imageUrl,
          active,
          product_variants: [nextVariant],
        };

        const exists = current.some((p) => p.id === productId);
        const updated = exists
          ? current.map((p) => (p.id === productId ? nextProduct : p))
          : [...current, nextProduct];

        writeDevProducts(updated);
        return;
      }

      let finalImageUrl = imageUrl;
      if (imageFile) {
        finalImageUrl = await uploadProductImage(imageFile, productId);
      }

      const payload = [
        {
          id: firstVariant?.id ?? null,
          size: cleanSize,
          color: "",
          sku: cleanSku,
          cost_price: parsedCost,
          sale_price: parsedPrice,
          stock: isEditing ? undefined : parsedStock,
          min_stock: parsedMin,
          active,
        },
      ];

      const { data: savedId, error } = await supabase.rpc("save_product", {
        p_product_id: (product?.id ?? null) as unknown as string,
        p_name: name.trim(),
        p_code: code.trim(),
        p_category: category.trim() || "Geral",
        p_active: active,
        p_variants: payload,
      });
      if (error) throw error;

      const targetId = (typeof savedId === "string" && savedId) || product?.id;
      if (targetId && finalImageUrl !== product?.image_url) {
        const { error: imgError } = await supabase
          .from("products")
          .update({ image_url: finalImageUrl })
          .eq("id", targetId);
        if (imgError) throw imgError;
      }
    },
    onSuccess: () => {
      toast.success(isEditing ? "Produto atualizado." : "Produto cadastrado.");
      queryClient.invalidateQueries({ queryKey: ["products"] });
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: async () => {
      if (isDevAdminLoggedIn()) {
        const updated = readDevProducts().filter((p) => p.id !== product!.id);
        writeDevProducts(updated);
        return;
      }
      const { error } = await supabase.rpc("delete_product", { p_product_id: product!.id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Produto excluído.");
      queryClient.invalidateQueries({ queryKey: ["products"] });
      onClose();
    },
    onError: (e) => {
      toast.error(errorMessage(e));
      setConfirmDelete(false);
    },
  });

  const numericPrice = parseMoney(price);
  const numericCost = parseMoney(cost);
  const previewAdd = Number(addStock) || 0;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar produto" : "Novo produto"}</DialogTitle>
          <DialogDescription>
            Preencha os dados do produto de forma simples e rápida.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Foto do produto */}
          <div className="flex flex-col gap-3 rounded-lg border border-border p-3 sm:flex-row sm:items-center">
            <div className="relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-md border border-dashed border-border bg-muted/40">
              {processingImage ? (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              ) : imageUrl ? (
                <>
                  <img
                    src={imageUrl}
                    alt={name || "Prévia do produto"}
                    className="h-full w-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setImageUrl(null);
                      setImageFile(null);
                    }}
                    className="absolute right-1 top-1 rounded-full bg-background/90 p-1 text-foreground shadow hover:bg-background"
                    aria-label="Remover foto"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </>
              ) : (
                <ImagePlus className="h-6 w-6 text-muted-foreground" />
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="p-image">Foto do produto (catálogo)</Label>
              <Input
                id="p-image"
                type="file"
                accept="image/*"
                onChange={handleImageChange}
                disabled={processingImage}
                className="cursor-pointer text-xs"
              />
              <p className="text-xs text-muted-foreground">
                A foto é convertida e compactada automaticamente para WebP leve.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="p-name">Nome do produto</Label>
              <Input
                id="p-name"
                value={name}
                onChange={(e) => {
                  const next = e.target.value;
                  setName(next);
                  syncSku(next, code, size);
                }}
                placeholder="Ex.: Camiseta básica"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="p-code">Código interno</Label>
              <Input
                id="p-code"
                value={code}
                onChange={(e) => {
                  const next = e.target.value;
                  setCode(next);
                  syncSku(name, next, size);
                }}
                placeholder="Ex.: CAM01"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="p-cat">Categoria</Label>
              <Input
                id="p-cat"
                list="categories"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Ex.: Camisetas"
              />
              <datalist id="categories">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="p-size">Tamanho</Label>
              <Input
                id="p-size"
                value={size}
                onChange={(e) => {
                  const next = e.target.value;
                  setSize(next);
                  syncSku(name, code, next);
                }}
                placeholder="Único"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label htmlFor="p-cost">Custo (R$)</Label>
              <Input
                id="p-cost"
                inputMode="decimal"
                value={cost}
                onChange={(e) => setCost(e.target.value)}
                placeholder="0,00"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="p-price">Venda (R$)</Label>
              <Input
                id="p-price"
                inputMode="decimal"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0,00"
              />
            </div>

            {isEditing ? (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="p-stock">Estoque atual</Label>
                  <div
                    id="p-stock"
                    className="flex h-10 items-center rounded-md border border-input bg-muted/40 px-3 text-sm text-muted-foreground"
                  >
                    {stock} un.
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="p-add-stock">Adicionar (+ un.)</Label>
                  <Input
                    id="p-add-stock"
                    inputMode="numeric"
                    value={addStock}
                    onChange={(e) => setAddStock(e.target.value.replace(/\D/g, ""))}
                    placeholder="Ex.: 10"
                  />
                </div>
              </>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="p-stock">Estoque</Label>
                <Input
                  id="p-stock"
                  inputMode="numeric"
                  value={stock}
                  onChange={(e) => setStock(e.target.value.replace(/\D/g, ""))}
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="p-min">Estoque mínimo</Label>
              <Input
                id="p-min"
                inputMode="numeric"
                value={minStock}
                onChange={(e) => setMinStock(e.target.value.replace(/\D/g, ""))}
              />
            </div>
          </div>

          {isEditing && previewAdd > 0 && (
            <p className="text-xs text-muted-foreground">
              Novo estoque após salvar:{" "}
              <span className="font-medium text-foreground">
                {(Number(stock) || 0) + previewAdd} un.
              </span>
            </p>
          )}

          <div className="flex flex-col gap-3 rounded-lg border border-border p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <Switch id="p-active" checked={active} onCheckedChange={setActive} />
              <Label htmlFor="p-active">Produto ativo (aparece nas vendas)</Label>
            </div>

            <div className="flex items-center gap-2">
              <Label htmlFor="p-sku" className="text-xs text-muted-foreground">
                SKU
              </Label>
              <Input
                id="p-sku"
                className="h-8 w-36 font-mono text-xs"
                value={sku}
                onChange={(e) => {
                  setSku(e.target.value);
                  setSkuTouched(true);
                }}
                placeholder="Automático"
              />
            </div>
          </div>

          <div className="text-right text-xs text-muted-foreground">
            Lucro estimado:{" "}
            <span className="font-medium text-foreground">
              {brl(unitProfit(numericPrice, numericCost))}
            </span>{" "}
            ({pct(grossMargin(numericPrice, numericCost))})
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          {isEditing ? (
            <Button
              type="button"
              variant="ghost"
              className="text-destructive"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 /> Excluir produto
            </Button>
          ) : (
            <span />
          )}

          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={() => save.mutate()}
              disabled={save.isPending || processingImage}
            >
              {save.isPending && <Loader2 className="animate-spin" />} Salvar
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir produto?</AlertDialogTitle>
            <AlertDialogDescription>
              Só é possível excluir produtos sem vendas. Produtos já vendidos devem ser desativados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                remove.mutate();
              }}
              disabled={remove.isPending}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
