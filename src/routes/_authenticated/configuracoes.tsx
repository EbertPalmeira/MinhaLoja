import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, ExternalLink, Loader2, Save, Share2, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { settingsQuery, useMe } from "@/lib/session";
import { slugify, useStore } from "@/lib/store";
import { dateTime, errorMessage } from "@/lib/format";
import { LoadingRows, PageHeader, Panel } from "@/components/app/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/configuracoes")({
  head: () => ({
    meta: [
      { title: "Configurações — Gestão da Loja" },
      { name: "description", content: "Dados da loja, estoque mínimo padrão e acesso da equipe." },
      { property: "og:title", content: "Configurações — Gestão da Loja" },
      { property: "og:description", content: "Dados da loja e acesso da equipe." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { data: me } = useMe();
  const queryClient = useQueryClient();
  const { storeId, store } = useStore();
  const settings = useQuery(settingsQuery(storeId));
  const [form, setForm] = useState({ store_name: "", phone: "", address: "", logo_url: "", default_min_stock: "2", slug: "" });
  const isAdmin = !!me?.isAdmin;

  useEffect(() => {
    if (settings.data)
      setForm({
        store_name: settings.data.store_name,
        phone: settings.data.phone ?? "",
        address: settings.data.address ?? "",
        logo_url: settings.data.logo_url ?? "",
        default_min_stock: String(settings.data.default_min_stock),
        slug: store.slug,
      });
  }, [settings.data, store.slug]);

  const save = useMutation({
    mutationFn: async () => {
      if (!form.store_name.trim()) throw new Error("Informe o nome da loja.");
      const logo = form.logo_url.trim();
      if (logo && !/^https:\/\/\S+$/i.test(logo)) throw new Error("O logotipo deve ser um link que começa com https://");
      const min = Number(form.default_min_stock);
      if (!Number.isInteger(min) || min < 0) throw new Error("Estoque mínimo padrão inválido.");
      const slug = slugify(form.slug);
      if (slug.length < 3) throw new Error("O endereço do catálogo precisa de ao menos 3 letras ou números.");
      const { error } = await supabase.rpc("update_store_settings", {
        p_store_id: storeId,
        p_store_name: form.store_name.trim(),
        p_phone: form.phone.trim(),
        p_address: form.address.trim(),
        p_logo_url: logo,
        p_default_min_stock: min,
        p_slug: slug,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Configurações salvas.");
      queryClient.invalidateQueries({ queryKey: ["store_settings"] });
      queryClient.invalidateQueries({ queryKey: ["stores"] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const catalogPath = `/catalogo/${store.slug}`;
  const catalogUrl = typeof window === "undefined" ? catalogPath : `${window.location.origin}${catalogPath}`;

  const copyCatalogLink = async () => {
    try {
      await navigator.clipboard.writeText(catalogUrl);
      toast.success("Link do catálogo copiado.");
    } catch {
      toast.error("Não foi possível copiar o link.");
    }
  };

  const shareCatalogLink = async () => {
    if (navigator.share) {
      await navigator.share({
        title: form.store_name || "Catálogo da loja",
        text: "Confira nosso catálogo:",
        url: catalogUrl,
      }).catch(() => undefined);
      return;
    }
    await copyCatalogLink();
  };

  return (
    <>
      <PageHeader title="Configurações" description={isAdmin ? "Dados que aparecem no menu, comprovantes e relatórios." : "Somente o administrador pode alterar."} />

      <Panel title="Dados da loja">
        {settings.isLoading ? (
          <LoadingRows />
        ) : (
          <form
            className="grid grid-cols-1 gap-4 p-5 md:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate();
            }}
          >
            <fieldset disabled={!isAdmin} className="contents">
              <div className="space-y-1.5">
                <Label htmlFor="s-name">Nome da loja</Label>
                <Input id="s-name" value={form.store_name} onChange={set("store_name")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="s-slug">Endereço do catálogo</Label>
                <Input id="s-slug" value={form.slug} onChange={(e) => setForm((f) => ({ ...f, slug: slugify(e.target.value) }))} />
                <p className="text-xs text-muted-foreground">Ao mudar, o link antigo do catálogo deixa de funcionar.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="s-phone">Telefone (opcional)</Label>
                <Input id="s-phone" value={form.phone} onChange={set("phone")} placeholder="(11) 99999-9999" />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="s-address">Endereço (opcional)</Label>
                <Input id="s-address" value={form.address} onChange={set("address")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="s-logo">Link do logotipo (opcional)</Label>
                <Input id="s-logo" value={form.logo_url} onChange={set("logo_url")} placeholder="https://..." />
                <p className="text-xs text-muted-foreground">Cole um link de imagem. Nada é enviado ao sistema.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="s-min">Estoque mínimo padrão</Label>
                <Input id="s-min" inputMode="numeric" value={form.default_min_stock} onChange={(e) => setForm((f) => ({ ...f, default_min_stock: e.target.value.replace(/\D/g, "") }))} />
                <p className="text-xs text-muted-foreground">Usado ao cadastrar novos tamanhos/cores.</p>
              </div>
            </fieldset>
            {isAdmin && (
              <div className="md:col-span-2">
                <Button type="submit" disabled={save.isPending}>
                  {save.isPending ? <Loader2 className="animate-spin" /> : <Save />} Salvar
                </Button>
              </div>
            )}
          </form>
        )}
      </Panel>

      <Panel className="mt-6" title="Catálogo público">
        <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-sm text-muted-foreground">
              Envie este link para seus clientes. Ele mostra somente produtos ativos e disponibiliza o pedido pelo WhatsApp.
            </p>
            <div className="mt-3 rounded-lg border border-border bg-muted/30 px-3 py-2">
              <p className="break-all text-sm font-medium">{catalogUrl}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={copyCatalogLink}>
              <Copy /> Copiar link
            </Button>
            <Button type="button" variant="outline" onClick={shareCatalogLink}>
              <Share2 /> Compartilhar
            </Button>
            <Button type="button" asChild>
              <a href={catalogPath} target="_blank" rel="noopener noreferrer">
                <ExternalLink /> Abrir catálogo
              </a>
            </Button>
          </div>
        </div>
      </Panel>

      {isAdmin && <UsersPanel myId={me!.userId} storeId={storeId} />}
    </>
  );
}

function UsersPanel({ myId, storeId }: { myId: string; storeId: string }) {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [newRole, setNewRole] = useState<"vendedor" | "admin">("vendedor");
  const users = useQuery({
    queryKey: ["store_users", storeId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_store_users", { p_store_id: storeId });
      if (error) throw error;
      return data;
    },
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["store_users", storeId] });
  const setRole = useMutation({
    mutationFn: async ({ id, role }: { id: string; role: string }) => {
      const { error } = await supabase.rpc("set_store_user_role", { p_store_id: storeId, p_user_id: id, p_role: role });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Permissão atualizada.");
      refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const add = useMutation({
    mutationFn: async () => {
      if (!email.trim()) throw new Error("Informe o e-mail da pessoa.");
      const { error } = await supabase.rpc("add_store_user", { p_store_id: storeId, p_email: email.trim(), p_role: newRole });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Pessoa adicionada à equipe.");
      setEmail("");
      refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Panel className="mt-6" title={<span className="flex items-center gap-2"><Users className="h-4 w-4 text-primary" /> Equipe da loja</span>}>
      <p className="px-5 pt-4 text-sm text-muted-foreground">
        Adicione pessoas que já criaram uma conta, pelo e-mail. Vendedores fazem vendas e consultam produtos e estoque, sem ver custos e lucros.
      </p>
      <form
        className="flex flex-col gap-2 px-5 py-4 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          add.mutate();
        }}
      >
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@exemplo.com" aria-label="E-mail da pessoa" />
        <Select value={newRole} onValueChange={(v) => setNewRole(v as "vendedor" | "admin")}>
          <SelectTrigger className="sm:w-44" aria-label="Permissão"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="vendedor">Vendedor</SelectItem>
            <SelectItem value="admin">Administrador</SelectItem>
          </SelectContent>
        </Select>
        <Button type="submit" disabled={add.isPending}>
          {add.isPending ? <Loader2 className="animate-spin" /> : <UserPlus />} Adicionar
        </Button>
      </form>
      {users.isLoading ? (
        <LoadingRows />
      ) : (
        <ul className="divide-y divide-border border-t border-border">
          {(users.data ?? []).map((u) => (
            <li key={u.user_id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {u.email} {u.user_id === myId && <span className="text-xs text-primary">(você)</span>}
                </p>
                <p className="text-xs text-muted-foreground">Na equipe desde {dateTime(u.created_at)}</p>
              </div>
              <Select
                value={u.role}
                disabled={u.user_id === myId || setRole.isPending}
                onValueChange={(role) => setRole.mutate({ id: u.user_id, role })}
              >
                <SelectTrigger className="sm:w-44" aria-label={`Permissão de ${u.email}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Administrador</SelectItem>
                  <SelectItem value="vendedor">Vendedor</SelectItem>
                  <SelectItem value="nenhum">Remover da loja</SelectItem>
                </SelectContent>
              </Select>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
