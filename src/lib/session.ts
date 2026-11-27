import { queryOptions, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { authUserQuery, useStore, type StoreRole } from "@/lib/store";

export type { StoreRole };

export interface Me {
  userId: string;
  email: string;
  /** Role in the ACTIVE store. */
  role: StoreRole;
  isAdmin: boolean;
  isStaff: boolean;
  /** Mirrors public.can_manage_catalog(store): only admins manage products and stock. */
  canManageCatalog: boolean;
}

/** Signed-in user plus their role in the active store. Use inside <StoreProvider>. */
export function useMe(): { data: Me | null | undefined; isLoading: boolean } {
  const { store } = useStore();
  const user = useQuery(authUserQuery);
  const u = user.data;
  const data: Me | null | undefined = u
    ? {
        userId: u.id,
        email: u.email,
        role: store.role,
        isAdmin: store.role === "admin",
        isStaff: true,
        canManageCatalog: store.role === "admin",
      }
    : user.isLoading
      ? undefined
      : null;
  return { data, isLoading: user.isLoading };
}

export const settingsQuery = (storeId: string) =>
  queryOptions({
    queryKey: ["store_settings", storeId],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("store_settings")
        .select("*")
        .eq("store_id", storeId)
        .maybeSingle();
      if (error) throw error;
      return (
        data ?? {
          store_id: storeId,
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