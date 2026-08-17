import { describe, it, expect } from "vitest";
import { estimateFuelLiters } from "@shared/domain";

describe("estimateFuelLiters", () => {
  it("litros = km ÷ rendimiento esperado", () => {
    expect(estimateFuelLiters(1000, 2.5)).toBeCloseTo(400, 5);
    expect(estimateFuelLiters(600, 3)).toBeCloseTo(200, 5);
  });

  it("un camión que rinde más gasta menos en el mismo viaje", () => {
    // La dirección importa: en km/L, más rendimiento = menos litros.
    expect(estimateFuelLiters(1000, 3)).toBeLessThan(estimateFuelLiters(1000, 2.5));
  });

  it("sin km o sin rendimiento no estima nada", () => {
    expect(estimateFuelLiters(0, 2.5)).toBe(0);
    expect(estimateFuelLiters(100, 0)).toBe(0);
    expect(estimateFuelLiters(-5, 2.5)).toBe(0);
  });
});
