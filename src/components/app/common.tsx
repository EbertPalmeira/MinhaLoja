import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: LucideIcon;
  tone?: "default" | "primary" | "warning" | "destructive";
}) {
  return (
    <div className="card-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-muted-foreground">{label}</p>
        {Icon && (
          <span
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-lg",
              tone === "primary" && "bg-primary-soft text-primary",
              tone === "warning" && "bg-warning-soft text-warning",
              tone === "destructive" && "bg-destructive-soft text-destructive",
              tone === "default" && "bg-muted text-muted-foreground",
            )}
          >
            <Icon className="h-4 w-4" />
          </span>
        )}
      </div>
      <p className="tabular mt-3 font-display text-2xl font-semibold text-foreground">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function Panel({
  title,
  actions,
  children,
  className,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("card-surface overflow-hidden", className)}>
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-4">
          {title && <h2 className="text-base font-semibold">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function EmptyState({ icon: Icon, title, text }: { icon: LucideIcon; title: string; text?: string }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <Icon className="h-8 w-8 text-muted-foreground" />
      <p className="mt-3 font-medium">{title}</p>
      {text && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{text}</p>}
    </div>
  );
}

export function StockBadge({ stock, min }: { stock: number; min: number }) {
  if (stock <= 0)
    return (
      <span className="inline-flex rounded-full bg-destructive-soft px-2 py-0.5 text-xs font-semibold text-destructive">
        Zerado
      </span>
    );
  if (stock <= min)
    return (
      <span className="inline-flex rounded-full bg-warning-soft px-2 py-0.5 text-xs font-semibold text-warning">
        Baixo
      </span>
    );
  return (
    <span className="inline-flex rounded-full bg-primary-soft px-2 py-0.5 text-xs font-semibold text-primary">
      OK
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  return status === "cancelada" ? (
    <span className="inline-flex rounded-full bg-destructive-soft px-2 py-0.5 text-xs font-semibold text-destructive">
      Cancelada
    </span>
  ) : (
    <span className="inline-flex rounded-full bg-primary-soft px-2 py-0.5 text-xs font-semibold text-primary">
      Concluída
    </span>
  );
}

export function LoadingRows({ label = "Carregando..." }: { label?: string }) {
  return <p className="px-5 py-10 text-center text-sm text-muted-foreground">{label}</p>;
}
