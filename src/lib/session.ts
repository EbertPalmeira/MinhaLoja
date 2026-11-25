import { queryOptions, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const DEV_AUTH_KEY = "dev_admin_logged_in";

export type StoreRole = "admin" | "vendedor" | null;

export interface Me {
  userId: string;
  email: string;
  role: StoreRole;
  isAdmin: boolean;
  isStaff: boolean;
  /** Mirrors public.can_manage_catalog: only admins manage products and stock. */
  canManageCatalog: boolean;
}

export const meQuery = queryOptions({
  queryKey: ["me"],
  staleTime: 60_000,
  queryFn: async (): Promise<Me | null> => {
    if (typeof window !== "undefined" && localStorage.getItem(DEV_AUTH_KEY) === "true") {
      return {
        userId: "dev-admin-id",
        email: "admin@loja.com",
        role: "admin",
        isAdmin: true,
        isStaff: true,
        canManageCatalog: true,
      };
    }

    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;
    if (!user) return null;
    const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
    if (error) throw error;
    const roles = (data ?? []).map((r) => r.role);
    const role: StoreRole = roles.includes("admin") ? "admin" : roles.includes("vendedor") ? "vendedor" : null;
    return {
      userId: user.id,
      email: user.email ?? "",
      role,
      isAdmin: role === "admin",
      isStaff: role !== null,
      canManageCatalog: role === "admin",
    };
  },
});

export function useMe() {
  return useQuery(meQuery);
}

export const settingsQuery = queryOptions({
  queryKey: ["store_settings"],
  staleTime: 5 * 60_000,
  queryFn: async () => {
    if (typeof window !== "undefined" && localStorage.getItem(DEV_AUTH_KEY) === "true") {
      return {
        id: 1,
        store_name: "Minha Loja (Dev)",
        phone: null,
        address: null,
        logo_url: null,
        default_min_stock: 2,
        updated_at: "",
      };
    }

    const { data, error } = await supabase.from("store_settings").select("*").eq("id", 1).maybeSingle();
    if (error) throw error;
    return (
      data ?? {
        id: 1,
        store_name: "Minha Loja",
        phone: null,
        address: null,
        logo_url: null,
        default_min_stock: 2,
        updated_at: "",
      }
    );
  },
});

/** Fetch every row of a query in pages of 1000 (the API limit per request). */
export async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const size = 1000;
  const rows: T[] = [];
  for (let from = 0; ; from += size) {
    const { data, error } = await page(from, from + size - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < size) break;
  }
  return rows;
}