import { createFileRoute, redirect } from "@tanstack/react-router";

// The app's home is the dashboard; signed-out visitors are sent to /auth by the gate.
export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard" });
  },
  head: () => ({
    meta: [
      { title: "Gestão da Loja" },
      { name: "description", content: "Sistema de gestão para loja de roupas." },
      { property: "og:title", content: "Gestão da Loja" },
      { property: "og:description", content: "Sistema de gestão para loja de roupas." },
    ],
  }),
});
