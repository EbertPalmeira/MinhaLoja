import { useState } from "react";
import { toast } from "sonner";
import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  Boxes,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  Shirt,
  ShoppingBag,
  Loader2,
  Plus,
  Store,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { settingsQuery, useMe } from "@/lib/session";
import {
  authUserQuery,
  slugify,
  StoreProvider,
  storesQuery,
  useStore,
} from "@/lib/store";
import { errorMessage } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
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
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/produtos", label: "Produtos", icon: Shirt },
  { to: "/estoque", label: "Estoque", icon: Boxes },
  { to: "/nova-venda", label: "Nova venda", icon: ShoppingBag },
  { to: "/vendas", label: "Histórico de vendas", icon: History },
  { to: "/relatorios", label: "Relatórios", icon: BarChart3 },
  { to: "/configuracoes", label: "Configurações", icon: Settings },
] as const;

function useSignOut() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };
}

function Brand() {
  const { storeId } = useStore();
  const { data: settings } = useQuery(settingsQuery(storeId));
  return (
    <div className="flex items-center gap-3 px-2">
      {settings?.logo_url ? (
        <img src={settings.logo_url} alt="" className="h-9 w-9 rounded-lg object-cover" />
      ) : (
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-soft text-primary">
          <Shirt className="h-5 w-5" />
        </div>
      )}
      <div className="min-w-0">
        <p className="truncate font-display text-sm font-semibold text-foreground">
          {settings?.store_name ?? "Minha Loja"}
        </p>
        <p className="text-xs text-muted-foreground">Gestão da loja</p>
      </div>
    </div>
  );
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className="flex flex-col gap-1">
      {NAV.map((item) => {
        const active = pathname === item.to || pathname.startsWith(`${item.to}/`);
        const Icon = item.icon;
        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
            )}
          >
            <Icon className={cn("h-4 w-4", active && "text-primary")} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function UserBox() {
  const { data: me } = useMe();
  const signOut = useSignOut();
  return (
    <div className="rounded-lg border border-sidebar-border p-3">
      <p className="truncate text-xs text-sidebar-foreground">{me?.email}</p>
      <p className="mt-0.5 text-xs font-semibold text-primary">
        {me?.isAdmin ? "Administrador" : "Vendedor"}
      </p>
      <Button variant="ghost" size="sm" className="mt-2 w-full justify-start px-2" onClick={signOut}>
        <LogOut /> Sair
      </Button>
    </div>
  );
}

/** Creates a store. The address (slug) is suggested from the name and can be edited. */
function CreateStoreForm({ onCreated }: { onCreated: (id: string) => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Informe o nome da loja.");
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.rpc("create_store", {
      p_name: name.trim(),
      p_slug: slug || slugify(name),
    });
    setBusy(false);
    if (error) {
      toast.error(errorMessage(error));
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["stores"] });
    onCreated(data);
  }

  return (
    <form onSubmit={submit} className="space-y-4 text-left">
      <div className="space-y-1.5">
        <Label htmlFor="new-store-name">Nome da loja</Label>
        <Input
          id="new-store-name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (!slugTouched) setSlug(slugify(e.target.value));
          }}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="new-store-slug">Endereço do catálogo</Label>
        <Input
          id="new-store-slug"
          value={slug}
          onChange={(e) => {
            setSlugTouched(true);
            setSlug(slugify(e.target.value));
          }}
          placeholder="minha-loja"
        />
        <p className="text-xs text-muted-foreground">
          Seu catálogo ficará em /catalogo/{slug || "minha-loja"}.
        </p>
      </div>
      <Button type="submit" className="w-full" disabled={busy}>
        {busy && <Loader2 className="animate-spin" />} Criar loja
      </Button>
    </form>
  );
}

function NoStoreScreen({ email, onCreated }: { email: string; onCreated: (id: string) => void }) {
  const signOut = useSignOut();
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="card-surface w-full max-w-md p-8">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft text-primary">
          <Store className="h-6 w-6" />
        </div>
        <h1 className="mt-4 text-center text-xl font-semibold">Crie sua loja</h1>
        <p className="mb-6 mt-2 text-center text-sm text-muted-foreground">
          Você ainda não faz parte de nenhuma loja. Crie a sua ou peça a um administrador para adicionar
          o e-mail <span className="font-medium text-foreground">{email}</span> à equipe dele.
        </p>
        <CreateStoreForm onCreated={onCreated} />
        <Button variant="ghost" className="mt-4 w-full" onClick={signOut}>
          <LogOut /> Sair
        </Button>
      </div>
    </div>
  );
}

const NEW_STORE = "__new__";

function StoreSwitcher() {
  const { stores, storeId, setStoreId } = useStore();
  const [creating, setCreating] = useState(false);
  return (
    <>
      <Select
        value={storeId}
        onValueChange={(v) => (v === NEW_STORE ? setCreating(true) : setStoreId(v))}
      >
        <SelectTrigger className="h-9 w-full" aria-label="Loja ativa">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {stores.map((s) => (
            <SelectItem key={s.id} value={s.id}>
              {s.name}
            </SelectItem>
          ))}
          <SelectSeparator />
          <SelectItem value={NEW_STORE}>
            <span className="flex items-center gap-2">
              <Plus className="h-3.5 w-3.5" /> Nova loja
            </span>
          </SelectItem>
        </SelectContent>
      </Select>
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nova loja</DialogTitle>
            <DialogDescription>Você será o administrador da nova loja.</DialogDescription>
          </DialogHeader>
          <CreateStoreForm
            onCreated={(id) => {
              setStoreId(id);
              setCreating(false);
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

export function AppShell() {
  const user = useQuery(authUserQuery);
  const stores = useQuery(storesQuery(user.data?.id));
  const [justCreated, setJustCreated] = useState<string | null>(null);

  if (user.isLoading || stores.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }
  if (!user.data) return null; // the route guard redirects to /auth
  if (stores.isError) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 text-sm text-destructive">
        Não foi possível carregar suas lojas. Atualize a página.
      </div>
    );
  }
  const list = stores.data ?? [];
  if (list.length === 0) {
    return <NoStoreScreen email={user.data.email} onCreated={setJustCreated} />;
  }
  return (
    <StoreProvider stores={list} key={justCreated ?? "main"}>
      <Shell />
    </StoreProvider>
  );
}

function Shell() {
  const [open, setOpen] = useState(false);
  const { storeId } = useStore();

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col gap-6 border-r border-sidebar-border bg-sidebar p-4 lg:flex">
        <div className="space-y-3">
          <Brand />
          <StoreSwitcher />
        </div>
        <div className="flex-1 overflow-y-auto">
          <NavLinks />
        </div>
        <UserBox />
      </aside>

      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-background/90 px-4 py-3 backdrop-blur lg:hidden">
        <Brand />
        <Button variant="ghost" size="icon" aria-label="Abrir menu" onClick={() => setOpen(true)}>
          <Menu className="h-5 w-5" />
        </Button>
      </header>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="flex w-72 flex-col gap-6 border-sidebar-border bg-sidebar p-4">
          <SheetHeader className="p-0 text-left">
            <SheetTitle className="sr-only">Menu</SheetTitle>
            <Brand />
          </SheetHeader>
          <StoreSwitcher />
          <div className="flex-1 overflow-y-auto">
            <NavLinks onNavigate={() => setOpen(false)} />
          </div>
          <UserBox />
        </SheetContent>
      </Sheet>

      <main className="lg:pl-64">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <Outlet key={storeId} />
        </div>
      </main>
    </div>
  );
}
