import { describe, expect, it } from "vitest";
import { slugify } from "@/lib/store";

describe("slugify", () => {
  it("remove acentos e troca símbolos por hífen", () => {
    expect(slugify("Boutique Ébano & Cia")).toBe("boutique-ebano-cia");
  });
  it("não deixa hífen nas pontas e respeita 40 caracteres", () => {
    expect(slugify("  --Loja  da Maria!! ")).toBe("loja-da-maria");
    expect(slugify("a".repeat(60))).toHaveLength(40);
  });
});
