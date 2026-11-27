import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type StoreRole = "admin" | "vendedor";

export interface StoreMembership {
  id: string;
  name: string;
  slug: string;
  role: StoreRole;
}

const ACTIVE_STORE_KEY = "active_store_id";

/** Same rule as public.slugify in the database (lowercase, no accents, hyphens). */
export function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 40)
    .replace(/^-+|-+$/g, "");
}

export const authUserQuery = queryOptions({
  queryKey: ["auth-user"],
  staleTime: 60_000,
  queryFn: async () => {
    const { data } = await supabase.auth.getUser();
    return data.user ? { id: data.user.id, email: data.user.email ?? "" } : null;
  },
});

/** Every store the signed-in user belongs to (RLS only returns their own memberships). */
export const storesQuery = (userId: string | undefined) =>
  queryOptions({
    queryKey: ["stores", userId],
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async (): Promise<StoreMembership[]> => {
      const { data, error } = await supabase
        .from("store_members")
        .select("role, stores(id, name, slug)")
        .eq("user_id", userId!);
      if (error) throw error;
      return (data ?? [])
        .flatMap((m) => (m.stores ? [{ ...m.stores, role: m.role as StoreRole }] : []))
        .sort((a, b) => a.name.localeCompare(b.name));
    },
  });

interface StoreContextValue {
  stores: StoreMembership[];
  store: StoreMembership;
  storeId: string;
  setStoreId: (id: string) => void;
}

const StoreContext = createContext<StoreContextValue | null>(null);

function readSavedStoreId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(ACTIVE_STORE_KEY);
  } catch {
    return null;
  }
}

/** Holds the active store. `stores` must be non-empty. The saved choice is only a hint: it is
 * ignored unless the user is (still) a member of that store. */
export function StoreProvider({ stores, children }: { stores: StoreMembership[]; children: ReactNode }) {
  const [chosen, setChosen] = useState<string | null>(readSavedStoreId);

  const store = useMemo(
    () => stores.find((s) => s.id === chosen) ?? (stores[0] as StoreMembership),
    [stores, chosen],
  );

  const setStoreId = useCallback((id: string) => {
    setChosen(id);
    try {
      localStorage.setItem(ACTIVE_STORE_KEY, id);
    } catch {
      /* storage unavailable: the choice just won't persist */
    }
  }, []);

  const value = useMemo(
    () => ({ stores, store, storeId: store.id, setStoreId }),
    [stores, store, setStoreId],
  );
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreContextValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside <StoreProvider>");
  return ctx;
}

export function forgetActiveStore(): void {
  try {
    localStorage.removeItem(ACTIVE_STORE_KEY);
  } catch {
    /* ignore */
  }
}
