import { describe, it, expect } from "vitest";
import { haversineKm, totalPathKm, robustPathKm, isPlausibleStep } from "@shared/geo";

describe("haversineKm", () => {
  it("es 0 para el mismo punto", () => {
    expect(haversineKm({ lat: -34.9, lon: -56.16 }, { lat: -34.9, lon: -56.16 })).toBe(0);
  });

  it("aproxima la distancia Montevideo → Colonia (~140 km en línea recta)", () => {
    const km = haversineKm({ lat: -34.9011, lon: -56.1645 }, { lat: -34.4626, lon: -57.84 });
    expect(km).toBeGreaterThan(130);
    expect(km).toBeLessThan(180);
  });
});

describe("totalPathKm", () => {
  it("suma los tramos de una traza", () => {
    const pts = [
      { lat: -34.9011, lon: -56.1645 },
      { lat: -34.83, lon: -56.3 },
      { lat: -34.76, lon: -56.45 },
    ];
    const total = totalPathKm(pts);
    const manual =
      haversineKm(pts[0], pts[1]) + haversineKm(pts[1], pts[2]);
    expect(total).toBeCloseTo(manual, 5);
  });

  it("es 0 con menos de 2 puntos", () => {
    expect(totalPathKm([{ lat: 0, lon: 0 }])).toBe(0);
  });
});

describe("robustPathKm", () => {
  it("ignora saltos implausibles (GPS fuera de la ruta)", () => {
    // Traza normal cerca de Montevideo + una lectura basura en Paysandú (~350 km) y vuelta.
    const pts = [
      { lat: -34.9011, lon: -56.1645 },
      { lat: -34.871, lon: -56.22 }, // ~6 km, cuenta
      { lat: -32.3214, lon: -58.0756 }, // salto a Paysandú, se ignora
      { lat: -34.845, lon: -56.278 }, // vuelta, se ignora
    ];
    const km = robustPathKm(pts);
    expect(km).toBeGreaterThan(3);
    expect(km).toBeLessThan(15); // no se dispara a miles como haría totalPathKm
    expect(totalPathKm(pts)).toBeGreaterThan(600); // el crudo sí se dispara
  });
});

describe("isPlausibleStep", () => {
  it("acepta el primer punto", () => {
    expect(isPlausibleStep(null, { lat: 0, lon: 0 })).toBe(true);
  });
  it("descarta ruido de GPS (movimiento < 15 m)", () => {
    const prev = { lat: -34.9, lon: -56.16 };
    const next = { lat: -34.90001, lon: -56.16001 };
    expect(isPlausibleStep(prev, next)).toBe(false);
  });
  it("descarta saltos implausibles (teletransporte > 30 km entre fixes)", () => {
    expect(isPlausibleStep({ lat: -34.9, lon: -56.16 }, { lat: -34.0, lon: -56.16 })).toBe(false);
  });
});
