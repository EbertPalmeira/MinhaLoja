import { describe, expect, it } from "vitest";
import {
  cartSubtotal,
  cartTotal,
  clampDiscount,
  discountFromPercent,
  grossMargin,
  parseMoney,
  unitProfit,
  validatePayments,
} from "./calc";

describe("lucro e margem", () => {
  it("lucro bruto por unidade = venda − custo", () => {
    expect(unitProfit(79.9, 35.5)).toBe(44.4);
  });

  it("margem bruta = lucro ÷ venda × 100", () => {
    expect(grossMargin(100, 40)).toBe(60);
  });

  it("margem é 0 (sem erro) quando o preço de venda é zero", () => {
    expect(grossMargin(0, 10)).toBe(0);
  });
});

describe("carrinho", () => {
  it("soma itens sem erro de centavos", () => {
    expect(cartSubtotal([{ unitPrice: 0.1, quantity: 3 }, { unitPrice: 0.2, quantity: 1 }])).toBe(0.5);
  });

  it("desconto não passa do subtotal nem fica negativo", () => {
    expect(clampDiscount(150, 100)).toBe(100);
    expect(clampDiscount(-5, 100)).toBe(0);
  });

  it("total = subtotal − desconto", () => {
    expect(cartTotal(199.8, 19.8)).toBe(180);
  });

  it("desconto em % vira valor em reais", () => {
    expect(discountFromPercent(10, 159.9)).toBe(15.99);
  });
});

describe("pagamentos", () => {
  it("aceita vários pagamentos que somam o total", () => {
    expect(
      validatePayments(180, [
        { method: "pix", amount: 100 },
        { method: "dinheiro", amount: 80 },
      ]),
    ).toEqual({ ok: true });
  });

  it("recusa quando a soma é menor que o total", () => {
    expect(validatePayments(180, [{ method: "pix", amount: 100 }]).ok).toBe(false);
  });

  it("recusa quando a soma é maior que o total", () => {
    expect(validatePayments(180, [{ method: "pix", amount: 200 }]).ok).toBe(false);
  });

  it("recusa venda com valor sem forma de pagamento", () => {
    expect(validatePayments(50, []).ok).toBe(false);
  });
});

describe("valores digitados", () => {
  it("entende vírgula como separador decimal", () => {
    expect(parseMoney("1.234,56")).toBe(1234.56);
    expect(parseMoney("79,9")).toBe(79.9);
  });
});
