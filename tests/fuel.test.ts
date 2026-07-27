import { describe, it, expect } from "vitest";
import { estimateFuelLiters } from "@shared/domain";

describe("estimateFuelLiters", () => {
  it("calcula km × (L/100km) / 100", () => {
    expect(estimateFuelLiters(100, 32.5)).toBeCloseTo(32.5, 5);
    expect(estimateFuelLiters(200, 35)).toBeCloseTo(70, 5);
  });
  it("es 0 para km o consumo no positivos", () => {
    expect(estimateFuelLiters(0, 35)).toBe(0);
    expect(estimateFuelLiters(100, 0)).toBe(0);
    expect(estimateFuelLiters(-5, 35)).toBe(0);
  });
});
