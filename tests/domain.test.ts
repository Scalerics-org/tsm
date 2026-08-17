import { describe, it, expect } from "vitest";
import {
  estimateFuelLiters,
  fmtConsumo,
  fuelSummary,
  fuelFeedback,
  kmPorLitro,
  monthlyConsumption,
} from "@shared/domain";

describe("kmPorLitro (la unidad del cliente)", () => {
  it("reproduce el número de su planilla", () => {
    // Su ejemplo real: tacógrafo 393051 → 394300 (1249 km) con 474,7 L da 2,63.
    expect(kmPorLitro(394300 - 393051, 474.7)).toBeCloseTo(2.63, 2);
  });

  it("más alto es mejor: el mismo recorrido con menos litros rinde más", () => {
    // Es al revés que L/100km, y de eso depende la alerta de consumo anómalo.
    const flojo = kmPorLitro(1000, 400)!;
    const bueno = kmPorLitro(1000, 300)!;
    expect(bueno).toBeGreaterThan(flojo);
  });

  it("sin km o sin litros no hay rendimiento", () => {
    expect(kmPorLitro(0, 100)).toBeNull();
    expect(kmPorLitro(100, 0)).toBeNull();
  });
});

describe("fmtConsumo (formato pedido: 2,63)", () => {
  it("dos decimales y coma", () => {
    expect(fmtConsumo(2.63)).toBe("2,63");
    expect(fmtConsumo(2.8)).toBe("2,80");
    expect(fmtConsumo(3.214)).toBe("3,21");
  });

  it("sin dato muestra raya, no cero", () => {
    // Un 0,00 se leería como "rindió pésimo"; la raya dice "todavía no se sabe".
    expect(fmtConsumo(null)).toBe("—");
  });
});

describe("estimateFuelLiters", () => {
  it("litros = km ÷ rendimiento", () => {
    expect(estimateFuelLiters(1249, 2.63)).toBeCloseTo(474.9, 1);
    expect(estimateFuelLiters(0, 2.63)).toBe(0);
  });
});

describe("fuelSummary (llenado a llenado)", () => {
  it("no cuenta el llenado inicial (línea de base)", () => {
    // Base a 182000 con 300 L (no cuenta); rellena a 182450 con 157 L → 450 km ÷ 157 L.
    const r = fuelSummary([
      { odometer_km: 182000, liters: 300 },
      { odometer_km: 182450, liters: 157 },
    ]);
    expect(r.km).toBe(450);
    expect(r.liters).toBe(157);
    expect(r.consumption_kml).toBeCloseTo(2.87, 2);
  });

  it("ordena por odómetro e incluye 'chorros' intermedios", () => {
    const r = fuelSummary([
      { odometer_km: 200500, liters: 100 }, // chorro intermedio
      { odometer_km: 200000, liters: 250 }, // base
      { odometer_km: 201000, liters: 150 }, // rellena
    ]);
    expect(r.km).toBe(1000);
    expect(r.liters).toBe(250); // 100 + 150, la base (250) no cuenta
    expect(r.consumption_kml).toBeCloseTo(4, 5);
  });

  it("sin datos suficientes devuelve consumo null", () => {
    expect(fuelSummary([{ odometer_km: 1, liters: 10 }]).consumption_kml).toBeNull();
    expect(fuelSummary([]).consumption_kml).toBeNull();
  });
});

describe("fuelFeedback (cierre por llenado + mensual)", () => {
  const base = { odometer_km: 100000, liters: 300, is_full: true, logged_at: "2026-07-01 08:00:00" };

  it("cierra el tramo al llenar y calcula el rendimiento", () => {
    const cur = { odometer_km: 100450, liters: 157, is_full: true, logged_at: "2026-07-20 08:00:00" };
    const r = fuelFeedback([base, cur], cur);
    expect(r.closed).toBe(true);
    expect(r.segment_km).toBe(450);
    expect(r.segment_liters).toBe(157);
    expect(r.segment_kml).toBeCloseTo(2.87, 2);
  });

  it("un 'chorro' (no llenó) no cierra el tramo", () => {
    // En la pantalla del chofer esto sale como 0,00: el consumo se sabe recién al llenar.
    const cur = { odometer_km: 100200, liters: 100, is_full: false, logged_at: "2026-07-10 08:00:00" };
    const r = fuelFeedback([base, cur], cur);
    expect(r.closed).toBe(false);
    expect(r.segment_kml).toBeNull();
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
    expect(r.month_kml).toBeCloseTo(2.87, 2);
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
    expect(julio.kml).toBeCloseTo(2.9, 2);

    const agosto = r.find((m) => m.month === "2026-08")!;
    expect(agosto.closed).toBe(false); // mes en curso
  });
});
