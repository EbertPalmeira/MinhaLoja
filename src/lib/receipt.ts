import { brl, dateTime, paymentLabel } from "@/lib/format";

export interface SaleDetails {
  id: string;
  number: number;
  status: string;
  created_at: string;
  subtotal: number;
  discount: number;
  total: number;
  items_count: number;
  canceled_at: string | null;
  cancel_reason: string | null;
  seller_email: string | null;
  canceled_by_email: string | null;
  total_cost: number | null;
  gross_profit: number | null;
  items: {
    product_name: string;
    sku: string;
    size: string;
    color: string;
    quantity: number;
    unit_price: number;
    line_total: number;
    unit_cost: number | null;
  }[];
  payments: { method: string; amount: number }[];
}

interface StoreInfo {
  store_name: string;
  phone: string | null;
  address: string | null;
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function receiptHtml(sale: SaleDetails, store: StoreInfo): string {
  const items = sale.items
    .map(
      (i) => `<tr><td>${esc(i.product_name)}<br><small>${esc(i.size)}${i.color ? " · " + esc(i.color) : ""} — ${i.quantity} x ${brl(i.unit_price)}</small></td><td class="r">${brl(i.line_total)}</td></tr>`,
    )
    .join("");
  const pays = sale.payments.map((p) => `<tr><td>${esc(paymentLabel(p.method))}</td><td class="r">${brl(p.amount)}</td></tr>`).join("");
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Comprovante nº ${sale.number}</title>
<style>
  *{box-sizing:border-box} body{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;color:#000;margin:0;padding:12px;width:300px}
  h1{font-size:15px;margin:0;text-align:center} p{margin:2px 0;text-align:center} table{width:100%;border-collapse:collapse;margin-top:6px}
  td{padding:3px 0;vertical-align:top} .r{text-align:right;white-space:nowrap} hr{border:0;border-top:1px dashed #000;margin:8px 0}
  .t td{font-weight:bold;font-size:14px} small{color:#333}
</style></head><body>
<h1>${esc(store.store_name)}</h1>
${store.address ? `<p>${esc(store.address)}</p>` : ""}${store.phone ? `<p>${esc(store.phone)}</p>` : ""}
<hr><p><b>Comprovante de venda nº ${sale.number}</b></p><p>${dateTime(sale.created_at)}</p>
${sale.status === "cancelada" ? "<p><b>VENDA CANCELADA</b></p>" : ""}
<hr><table>${items}</table><hr>
<table><tr><td>Subtotal</td><td class="r">${brl(sale.subtotal)}</td></tr>
${Number(sale.discount) > 0 ? `<tr><td>Desconto</td><td class="r">- ${brl(sale.discount)}</td></tr>` : ""}
<tr class="t"><td>Total</td><td class="r">${brl(sale.total)}</td></tr></table>
<hr><table>${pays}</table><hr><p>Obrigado pela preferência!</p><p><small>Documento sem valor fiscal</small></p>
</body></html>`;
}

/** Prints a simple receipt using a hidden iframe (works inside embedded previews). */
export function printReceipt(sale: SaleDetails, store: StoreInfo) {
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument!;
  doc.open();
  doc.write(receiptHtml(sale, store));
  doc.close();
  setTimeout(() => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    setTimeout(() => iframe.remove(), 1000);
  }, 150);
}
