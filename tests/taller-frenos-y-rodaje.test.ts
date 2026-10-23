import { describe, expect, it } from "vitest";
import type { Truck } from "../shared/domain";
import { vehiculoDeCamion } from "../src/features/taller/flota-real";
import { componentesDe, piezasDeRueda } from "../src/features/taller/datos-extra";

/**
 * "Frenos y rodaje" con los camiones REALES. Un camión que viene de la base no sabe cuántos km hace por día
 * (`kmPorDia = 0`, "no se sabe"): las pantallas no pueden estimar fechas con eso. Dividir por ese cero daba
 * Infinity, la fecha quedaba inválida y `toISOString` tiraba RangeError al abrir la ficha de una cubierta.
 *
 * El día de hoy va por parámetro (no el del reloj) para que estos tests digan siempre lo mismo.
 */

const HOY = "2026-10-23";

const camion = (p: Partial<Truck> = {}): Truck =>
  ({ id: 1, plate: "GTP 4238", brand: "SCANIA", model: "G 420", year: 2012, type: "TRACTOR DOBLE EJE", capacity_kg: 0, odometer_km: 463818, avg_km_litro: 2.8, status: "disponible", ...p }) as Truck;

describe("piezasDeRueda con un camión real (kmPorDia = 0)", () => {
  const real = vehiculoDeCamion(camion(), "", HOY);

  it("el camión real no sabe cuánto anda por día", () => {
    expect(real.kmPorDia).toBe(0);
  });

  it("no tira error al armar las piezas de una rueda", () => {
    expect(() => piezasDeRueda(real, 1, HOY)).not.toThrow();
  });

  it("no inventa una fecha: sin km por día queda «sin dato»", () => {
    const piezas = piezasDeRueda(real, 1, HOY);
    expect(piezas.length).toBeGreaterThan(0);
    expect(piezas.every((p) => p.fecha === null)).toBe(true);
  });

  it("también con un camión de 0 km (un acoplado recién cargado)", () => {
    const nuevo = vehiculoDeCamion(camion({ odometer_km: 0 }), "", HOY);
    expect(() => piezasDeRueda(nuevo, 3, HOY)).not.toThrow();
    expect(piezasDeRueda(nuevo, 3, HOY).every((p) => p.fecha === null)).toBe(true);
  });
});

describe("piezasDeRueda con km por día (los vehículos de ejemplo de la maqueta)", () => {
  it("la fecha se cuenta hacia atrás desde el día que se le pasa, no desde el reloj", () => {
    const v = { patente: "GTP 4238", km: 100_000, kmPorDia: 400 };
    const piezas = piezasDeRueda(v, 1, HOY);
    for (const p of piezas) {
      expect(p.fecha).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(p.fecha! <= HOY).toBe(true);
    }
    // El mismo vehículo, otro "hoy": las fechas se corren con él.
    const otra = piezasDeRueda(v, 1, "2030-01-01");
    expect(otra[0].fecha).not.toBe(piezas[0].fecha);
    expect(otra[0].fecha! <= "2030-01-01").toBe(true);
  });
});

describe("componentesDe con km por día cero", () => {
  it("no tira error ni inventa fechas inválidas", () => {
    expect(() => componentesDe({ patente: "GTP 4238", tipo: "camion", km: 463818, kmPorDia: 0 }, HOY)).not.toThrow();
  });
});
