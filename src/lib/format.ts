export const TIME_ZONE = "America/Sao_Paulo";

const brlFormatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function brl(value: number | string | null | undefined): string {
  const n = typeof value === "string" ? Number(value) : (value ?? 0);
  return brlFormatter.format(Number.isFinite(n) ? n : 0);
}

export function pct(value: number | null | undefined): string {
  const n = value ?? 0;
  return `${n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

export function num(value: number | string | null | undefined): string {
  return Number(value ?? 0).toLocaleString("pt-BR");
}

export function dateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

/** yyyy-mm-dd for "today" in São Paulo. */
export function todayISO(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(new Date());
}

export function firstOfMonthISO(): string {
  return `${todayISO().slice(0, 8)}01`;
}

export function daysAgoISO(days: number): string {
  const d = new Date(Date.now() - days * 86400000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(d);
}

/** yyyy-mm-dd -> dd/mm/yyyy */
export function brDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/** Start of a São Paulo calendar day as an ISO instant (UTC-3, no DST since 2019). */
export function spDayStartUTC(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00-03:00`).toISOString();
}

export function spDayEndExclusiveUTC(isoDate: string): string {
  return new Date(new Date(`${isoDate}T00:00:00-03:00`).getTime() + 86400000).toISOString();
}

export const PAYMENT_METHODS = [
  { value: "dinheiro", label: "Dinheiro" },
  { value: "pix", label: "Pix" },
  { value: "debito", label: "Cartão de débito" },
  { value: "credito", label: "Cartão de crédito" },
  { value: "outros", label: "Outros" },
] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number]["value"];

export function paymentLabel(method: string): string {
  return PAYMENT_METHODS.find((m) => m.value === method)?.label ?? method;
}

export function paymentLabels(methods: string | string[] | null | undefined): string {
  if (!methods) return "—";
  const list = Array.isArray(methods) ? methods : methods.split(",");
  return [...new Set(list.filter(Boolean))].map(paymentLabel).join(" + ") || "—";
}

/** Friendly message from a database/RPC error. */
export function errorMessage(error: unknown): string {
  if (!error) return "Erro desconhecido";
  if (typeof error === "string") return error;
  const e = error as { message?: string };
  return e.message ?? "Erro inesperado. Tente novamente.";
}
