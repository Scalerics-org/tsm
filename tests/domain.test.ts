import { describe, it, expect } from "vitest";
import { estimateFuelLiters, fuelSummary } from "@shared/domain";

describe("estimateFuelLiters", () => {
  it("km × (L/100km) / 100", () => {
    expect(estimateFuelLiters(100, 35)).toBeCloseTo(35, 5);
    expect(estimateFuelLiters(0, 35)).toBe(0);
  });
});

describe("fuelSummary (llenado a llenado)", () => {
  it("no cuenta el llenado inicial (línea de base)", () => {
    // Base a 182000 con 300 L (no cuenta); rellena a 182450 con 157 L → consumo 157/450×100.
    const r = fuelSummary([
      { odometer_km: 182000, liters: 300 },
      { odometer_km: 182450, liters: 157 },
    ]);
    expect(r.km).toBe(450);
    expect(r.liters).toBe(157);
    expect(r.consumption_l100).toBeCloseTo(34.9, 1);
  });

  it("ordena por odómetro e incluye 'chorros' intermedios", () => {
    const r = fuelSummary([
      { odometer_km: 200500, liters: 100 }, // chorro intermedio
      { odometer_km: 200000, liters: 250 }, // base
      { odometer_km: 201000, liters: 150 }, // rellena
    ]);
    expect(r.km).toBe(1000);
    expect(r.liters).toBe(250); // 100 + 150, la base (250) no cuenta
    expect(r.consumption_l100).toBeCloseTo(25, 5);
  });

  it("sin datos suficientes devuelve consumo null", () => {
    expect(fuelSummary([{ odometer_km: 1, liters: 10 }]).consumption_l100).toBeNull();
    expect(fuelSummary([]).consumption_l100).toBeNull();
  });
});
