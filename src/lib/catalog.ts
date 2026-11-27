import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/session";

export interface Variant {
  id: string;
  product_id: string;
  sku: string;
  size: string;
  color: string;
  sale_price: number;
  stock: number;
  min_stock: number;
  active: boolean;
}

export interface Product {
  id: string;
  name: string;
  code: string | null;
  image_url?: string | null;
  category: string;
  active: boolean;
  product_variants: Variant[];
}

/** Products of ONE store. The explicit store filter matters: RLS alone would also return
 * the products of every other store the user belongs to. */
export const productsQuery = (storeId: string) =>
  queryOptions({
    queryKey: ["products", storeId],
    queryFn: async () => {
      const rows = await fetchAll((from, to) =>
        supabase
          .from("products")
          .select(
            "id, name, code, category, active, image_url, product_variants(id, product_id, sku, size, color, sale_price, stock, min_stock, active)",
          )
          .eq("store_id", storeId)
          .order("name")
          .range(from, to),
      );
      return rows.map((p) => ({
        ...p,
        product_variants: [...p.product_variants]
          .map((v) => ({ ...v, sale_price: Number(v.sale_price) }))
          .sort((a, b) => sizeOrder(a.size) - sizeOrder(b.size)),
      })) as Product[];
    },
  });

/** Admin-only: map of variant id -> cost price (the RPC checks the role in this store). */
export const costsQuery = (storeId: string) =>
  queryOptions({
    queryKey: ["variant_costs", storeId],
    queryFn: async () => {
      const map = new Map<string, number>();
      const { data, error } = await supabase.rpc("get_variant_costs", { p_store_id: storeId });
      if (error) throw error;
      for (const r of data ?? []) {
        map.set(r.variant_id, Number(r.cost_price));
      }
      return map;
    },
  });

/** What the public catalog page may see (see public.get_public_catalog). */
export interface PublicVariant {
  size: string;
  color: string;
  sale_price: number;
  in_stock: boolean;
}
export interface PublicProduct {
  id: string;
  name: string;
  category: string;
  image_url: string | null;
  variants: PublicVariant[];
}
export interface PublicCatalog {
  store: {
    name: string;
    slug: string;
    phone: string | null;
    address: string | null;
    logo_url: string | null;
  };
  products: PublicProduct[];
}

/** Public, anonymous lookup by slug. Resolves to null when the store does not exist. */
export const publicCatalogQuery = (slug: string) =>
  queryOptions({
    queryKey: ["public_catalog", slug],
    staleTime: 60_000,
    retry: false,
    queryFn: async (): Promise<PublicCatalog | null> => {
      const { data, error } = await supabase.rpc("get_public_catalog", { p_slug: slug });
      if (error) throw error;
      const catalog = data as unknown as PublicCatalog | null;
      if (!catalog) return null;
      return {
        ...catalog,
        products: catalog.products.map((p) => ({
          ...p,
          variants: [...p.variants]
            .map((v) => ({ ...v, sale_price: Number(v.sale_price) }))
            .sort((a, b) => sizeOrder(a.size) - sizeOrder(b.size)),
        })),
      };
    },
  });

const SIZE_ORDER = ["PP", "P", "M", "G", "GG", "XG", "XGG", "EG", "EGG"];
export function sizeOrder(size: string): number {
  const i = SIZE_ORDER.indexOf(size.toUpperCase());
  if (i >= 0) return i;
  const n = Number(size);
  return Number.isFinite(n) ? 100 + n : 1000;
}

export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}