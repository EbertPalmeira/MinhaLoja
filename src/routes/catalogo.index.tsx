import { createFileRoute } from "@tanstack/react-router";
import { Package } from "lucide-react";

export const Route = createFileRoute("/catalogo/")({
  head: () => ({ meta: [{ title: "Catálogo" }] }),
  component: () => (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-sm text-center">
        <Package className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
        <h1 className="text-lg font-semibold">Catálogo</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Use o link completo que a loja enviou, no formato /catalogo/nome-da-loja.
        </p>
      </div>
    </div>
  ),
});
