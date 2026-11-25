import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2, Shirt } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const ADMIN_EMAIL = "admin@loja.com";
const ADMIN_PASS = "admin123";
export const DEV_AUTH_KEY = "dev_admin_logged_in";

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
  const search = Route.useSearch();
  const [email, setEmail] = useState(ADMIN_EMAIL);
  const [password, setPassword] = useState(ADMIN_PASS);
  const [busy, setBusy] = useState(false);

  const goNext = () => navigate({ to: search.redirect ?? "/dashboard", replace: true });

  useEffect(() => {
    if (localStorage.getItem(DEV_AUTH_KEY) === "true") {
      goNext();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);

    if (email.trim() === ADMIN_EMAIL && password === ADMIN_PASS) {
      localStorage.setItem(DEV_AUTH_KEY, "true");
      toast.success("Bem-vindo, Admin!");
      goNext();
    } else {
      toast.error("E-mail ou senha incorretos.");
    }

    setBusy(false);
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-soft text-primary">
            <Shirt className="h-6 w-6" />
          </div>
          <h1 className="mt-4 text-2xl font-semibold">Entrar na loja</h1>
          <p className="mt-1 text-sm text-muted-foreground">Modo local de desenvolvimento</p>
        </div>

        <div className="card-surface p-6">
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
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
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy && <Loader2 className="animate-spin" />}
              Entrar
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
