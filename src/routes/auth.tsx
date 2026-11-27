import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2, Shirt } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { errorMessage } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function safeRedirect(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/auth"))
    return undefined;
  return value;
}

export const Route = createFileRoute("/auth")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): { redirect?: string | undefined } => ({
    redirect: safeRedirect(search["redirect"]),
  }),
  head: () => ({
    meta: [
      { title: "Entrar — Gestão da Loja" },
      { name: "description", content: "Acesse o sistema de gestão da sua loja de roupas." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const search = Route.useSearch();
  const [mode, setMode] = useState<"entrar" | "criar">("entrar");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const goNext = () => navigate({ to: search.redirect ?? "/dashboard", replace: true });

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) goNext();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === "criar" && password.length < 6) {
      toast.error("A senha precisa ter pelo menos 6 caracteres.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "entrar") {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        queryClient.clear();
        goNext();
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: `${window.location.origin}/dashboard` },
        });
        if (error) throw error;
        if (data.session) {
          queryClient.clear();
          goNext();
        } else {
          toast.success("Conta criada. Confirme seu e-mail para entrar.");
          setMode("entrar");
        }
      }
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function forgotPassword() {
    if (!email.trim()) {
      toast.error("Digite seu e-mail para receber o link.");
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) toast.error(errorMessage(error));
    else toast.success("Se o e-mail existir, enviamos um link para criar uma nova senha.");
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-soft text-primary">
            <Shirt className="h-6 w-6" />
          </div>
          <h1 className="mt-4 text-2xl font-semibold">
            {mode === "entrar" ? "Entrar" : "Criar conta"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Gestão da loja</p>
        </div>

        <div className="card-surface p-6">
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                autoComplete={mode === "entrar" ? "current-password" : "new-password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy && <Loader2 className="animate-spin" />}
              {mode === "entrar" ? "Entrar" : "Criar conta"}
            </Button>
          </form>
          <div className="mt-4 flex items-center justify-between text-sm">
            <button
              type="button"
              className="text-primary hover:underline"
              onClick={() => setMode(mode === "entrar" ? "criar" : "entrar")}
            >
              {mode === "entrar" ? "Criar conta" : "Já tenho conta"}
            </button>
            {mode === "entrar" && (
              <button type="button" className="text-muted-foreground hover:underline" onClick={forgotPassword}>
                Esqueci a senha
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
