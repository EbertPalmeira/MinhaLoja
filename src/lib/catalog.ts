import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/session";

const DEV_AUTH_KEY = "dev_admin_logged_in";
export const DEV_PRODUCTS_KEY = "dev_products";

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

export function isDevAdminLoggedIn(): boolean {
  return typeof window !== "undefined" && localStorage.getItem(DEV_AUTH_KEY) === "true";
}

export function readDevProducts(): Product[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(DEV_PRODUCTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((p: Product) => ({
      ...p,
      product_variants: [...(p.product_variants ?? [])]
        .map((v) => ({
          ...v,
          sale_price: Number(v.sale_price),
          stock: Number(v.stock),
          min_stock: Number(v.min_stock),
        }))
        .sort((a, b) => sizeOrder(a.size) - sizeOrder(b.size)),
    }));
  } catch {
    return [];
  }
}

export function writeDevProducts(products: Product[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(DEV_PRODUCTS_KEY, JSON.stringify(products));
}

export const productsQuery = queryOptions({
  queryKey: ["products"],
  queryFn: async () => {
    if (isDevAdminLoggedIn()) {
      return [...readDevProducts()].sort((a, b) => a.name.localeCompare(b.name));
    }

    const rows = await fetchAll((from, to) =>
      supabase
        .from("products")
        .select(
          "id, name, code, category, active, product_variants(id, product_id, sku, size, color, sale_price, stock, min_stock, active)",
        )
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

/** Admin-only: map of variant id -> cost price. */
export const costsQuery = queryOptions({
  queryKey: ["variant_costs"],
  queryFn: async () => {
    const map = new Map<string, number>();
    if (isDevAdminLoggedIn()) {
      return map;
    }
    const { data, error } = await supabase.rpc("get_variant_costs");
    if (error) throw error;
    for (const r of data ?? []) {
      map.set(r.variant_id, Number(r.cost_price));
    }
    return map;
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