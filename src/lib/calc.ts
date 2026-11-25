/** Money helpers: work in cents to avoid floating point errors. */
export function toCents(value: number): number {
  return Math.round((Number.isFinite(value) ? value : 0) * 100);
}

export function fromCents(cents: number): number {
  return cents / 100;
}

/** Gross profit per unit = sale price − cost price. */
export function unitProfit(salePrice: number, costPrice: number): number {
  return fromCents(toCents(salePrice) - toCents(costPrice));
}

/** Gross margin % = profit ÷ sale price × 100. Returns 0 when the sale price is 0. */
export function grossMargin(salePrice: number, costPrice: number): number {
  const sale = toCents(salePrice);
  if (sale <= 0) return 0;
  return Math.round(((sale - toCents(costPrice)) / sale) * 10000) / 100;
}

export interface CartLine {
  unitPrice: number;
  quantity: number;
}

export function cartSubtotal(lines: CartLine[]): number {
  return fromCents(lines.reduce((sum, l) => sum + toCents(l.unitPrice) * l.quantity, 0));
}

/** Discount in R$, clamped to [0, subtotal]. */
export function clampDiscount(discount: number, subtotal: number): number {
  const d = toCents(discount);
  const s = toCents(subtotal);
  return fromCents(Math.min(Math.max(d, 0), s));
}

export function discountFromPercent(percent: number, subtotal: number): number {
  const p = Math.min(Math.max(Number.isFinite(percent) ? percent : 0, 0), 100);
  return fromCents(Math.round((toCents(subtotal) * p) / 100));
}

export function cartTotal(subtotal: number, discount: number): number {
  return fromCents(toCents(subtotal) - toCents(clampDiscount(discount, subtotal)));
}

export interface PaymentLine {
  method: string;
  amount: number;
}

export function paymentsSum(payments: PaymentLine[]): number {
  return fromCents(payments.reduce((s, p) => s + toCents(p.amount), 0));
}

/** Remaining amount to be paid (negative = paid too much). */
export function paymentsRemaining(total: number, payments: PaymentLine[]): number {
  return fromCents(toCents(total) - toCents(paymentsSum(payments)));
}

export type PaymentCheck = { ok: true } | { ok: false; message: string };

export function validatePayments(total: number, payments: PaymentLine[]): PaymentCheck {
  if (toCents(total) > 0 && payments.length === 0) {
    return { ok: false, message: "Informe a forma de pagamento." };
  }
  if (payments.some((p) => !p.method)) {
    return { ok: false, message: "Escolha a forma de cada pagamento." };
  }
  if (payments.some((p) => toCents(p.amount) <= 0)) {
    return { ok: false, message: "Cada pagamento precisa ter um valor maior que zero." };
  }
  const remaining = toCents(paymentsRemaining(total, payments));
  if (remaining > 0) return { ok: false, message: "A soma dos pagamentos é menor que o total." };
  if (remaining < 0) return { ok: false, message: "A soma dos pagamentos é maior que o total." };
  return { ok: true };
}

/** Simple SKU suggestion: CODE-SIZE-COLOR, uppercase, no accents/spaces. */
export function suggestSku(code: string, size: string, color: string): string {
  return [code, size, color]
    .map((part) =>
      part
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, ""),
    )
    .filter(Boolean)
    .join("-");
}

/** Parse a pt-BR money input ("1.234,56" or "1234.56"). */
export function parseMoney(input: string): number {
  const raw = input.trim();
  if (!raw) return 0;
  const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  const n = Number(normalized);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}
