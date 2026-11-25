import { useState } from "react";
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
  ShieldAlert,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { settingsQuery, useMe } from "@/lib/session";
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
  const { data: settings } = useQuery(settingsQuery);
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
        {me?.isAdmin ? "Administrador" : me?.role === "vendedor" ? "Vendedor" : "Sem acesso"}
      </p>
      <Button variant="ghost" size="sm" className="mt-2 w-full justify-start px-2" onClick={signOut}>
        <LogOut /> Sair
      </Button>
    </div>
  );
}

function PendingAccess() {
  const { data: me } = useMe();
  const signOut = useSignOut();
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="card-surface max-w-md p-8 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-warning-soft text-warning">
          <ShieldAlert className="h-6 w-6" />
        </div>
        <h1 className="mt-4 text-xl font-semibold">Aguardando liberação</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Sua conta ({me?.email}) foi criada, mas ainda não tem acesso à loja. Peça ao administrador para
          liberar seu acesso em Configurações → Usuários.
        </p>
        <Button variant="outline" className="mt-6" onClick={signOut}>
          <LogOut /> Sair
        </Button>
      </div>
    </div>
  );
}

export function AppShell() {
  const [open, setOpen] = useState(false);
  const { data: me, isLoading } = useMe();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }
  if (!me?.isStaff) return <PendingAccess />;

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col gap-6 border-r border-sidebar-border bg-sidebar p-4 lg:flex">
        <Brand />
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
          <div className="flex-1 overflow-y-auto">
            <NavLinks onNavigate={() => setOpen(false)} />
          </div>
          <UserBox />
        </SheetContent>
      </Sheet>

      <main className="lg:pl-64">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
