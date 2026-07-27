import { describe, it, expect } from "vitest";
import { estimateFuelLiters, fuelSummary, fuelFeedback, monthlyConsumption } from "@shared/domain";

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

describe("fuelFeedback (cierre por llenado + mensual)", () => {
  const base = { odometer_km: 100000, liters: 300, is_full: true, logged_at: "2026-07-01 08:00:00" };

  it("cierra el tramo al llenar y calcula consumo", () => {
    const cur = { odometer_km: 100450, liters: 157, is_full: true, logged_at: "2026-07-20 08:00:00" };
    const r = fuelFeedback([base, cur], cur);
    expect(r.closed).toBe(true);
    expect(r.segment_km).toBe(450);
    expect(r.segment_liters).toBe(157);
    expect(r.segment_l100).toBeCloseTo(34.9, 1);
  });

  it("un 'chorro' (no llenó) no cierra el tramo", () => {
    const cur = { odometer_km: 100200, liters: 100, is_full: false, logged_at: "2026-07-10 08:00:00" };
    const r = fuelFeedback([base, cur], cur);
    expect(r.closed).toBe(false);
    expect(r.segment_l100).toBeNull();
  });

  it("incluye el chorro intermedio en el consumo del tramo al llenar", () => {
    const chorro = { odometer_km: 100200, liters: 100, is_full: false, logged_at: "2026-07-10 08:00:00" };
    const cur = { odometer_km: 100450, liters: 57, is_full: true, logged_at: "2026-07-20 08:00:00" };
    const r = fuelFeedback([base, chorro, cur], cur);
    expect(r.segment_km).toBe(450);
    expect(r.segment_liters).toBe(157); // 100 (chorro) + 57 (llenado)
  });

  it("calcula el acumulado del mes desde el primer llenado", () => {
    const cur = { odometer_km: 100450, liters: 157, is_full: true, logged_at: "2026-07-20 08:00:00" };
    const r = fuelFeedback([base, cur], cur);
    expect(r.month_km).toBe(450);
    expect(r.month_l100).toBeCloseTo(34.9, 1);
  });
});

describe("monthlyConsumption (cierre con el primer llenado del mes siguiente)", () => {
  it("cierra julio con la primera surtida de agosto", () => {
    const logs = [
      { odometer_km: 100000, liters: 300, is_full: true, logged_at: "2026-07-05 08:00:00" },
      { odometer_km: 100450, liters: 150, is_full: true, logged_at: "2026-07-27 08:00:00" },
      { odometer_km: 100900, liters: 160, is_full: true, logged_at: "2026-08-02 08:00:00" },
    ];
    const r = monthlyConsumption(logs); // más reciente primero
    const julio = r.find((m) => m.month === "2026-07")!;
    expect(julio.closed).toBe(true);
    expect(julio.km).toBe(900); // de la 1ª de julio a la 1ª de agosto
    expect(julio.liters).toBe(310); // 150 + 160, no cuenta el llenado base
    expect(julio.l100).toBeCloseTo(34.4, 1);

    const agosto = r.find((m) => m.month === "2026-08")!;
    expect(agosto.closed).toBe(false); // mes en curso
  });
});
