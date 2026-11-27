import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errorMessage } from "@/lib/format";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Nova senha — Gestão da Loja" },
      { name: "description", content: "Defina uma nova senha de acesso." },
      { property: "og:title", content: "Nova senha — Gestão da Loja" },
      { property: "og:description", content: "Defina uma nova senha de acesso." },
    ],
  }),
  component: ResetPassword,
});

function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const isRecovery = window.location.hash.includes("type=recovery");
    supabase.auth.getSession().then(({ data }) => setReady(isRecovery || !!data.session));
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("A senha precisa ter pelo menos 6 caracteres.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      toast.error(errorMessage(error));
      return;
    }
    toast.success("Senha alterada com sucesso.");
    navigate({ to: "/dashboard", replace: true });
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="card-surface w-full max-w-sm p-6">
        <h1 className="text-xl font-semibold">Criar nova senha</h1>
        {!ready ? (
          <p className="mt-3 text-sm text-muted-foreground">Abra esta página pelo link enviado ao seu e-mail.</p>
        ) : (
          <form onSubmit={submit} className="mt-5 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="new-password">Nova senha</Label>
              <Input id="new-password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy && <Loader2 className="animate-spin" />} Salvar senha
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
