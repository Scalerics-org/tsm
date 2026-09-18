import { describe, it, expect } from "vitest";
import { consumoPorSurtida } from "../api/lib/surtidas-a-revisar";

/**
 * "Una columna con el consumo, que muestre ahí. Así puedo ver y observar visualmente cada
 * camión." — Rodrigo, 18/9/2026, en la tabla de surtidas de la ficha del camión.
 *
 * Es la misma cuenta que el aviso de "revisar la boleta" (`tramosDeConsumo`): si la columna
 * usara otra, la pantalla mostraría un número y el aviso marcaría por otro.
 */
const s = (id: number, logged_at: string, odometer_km: number, liters: number, is_full = 1) =>
  ({ id, logged_at, odometer_km, liters, is_full }) as any;

describe("consumoPorSurtida", () => {
  it("cada llenado muestra el tramo que cierra; el primero es la base", () => {
    const c = consumoPorSurtida([s(1, "2026-09-01 12:00:00", 1000, 300), s(2, "2026-09-04 12:00:00", 2000, 400)]);
    expect(c[1]).toBeUndefined();
    expect(c[2]).toEqual({ kml: 2.5, km: 1000, litros: 400 });
  });

  it("el chorro no tiene consumo propio: sus litros van al llenado siguiente", () => {
    const c = consumoPorSurtida([
      s(1, "2026-09-01 12:00:00", 1000, 300),
      s(2, "2026-09-02 12:00:00", 1000, 100, 0),
      s(3, "2026-09-04 12:00:00", 2000, 300),
    ]);
    expect(c[2]).toBeUndefined();
    expect(c[3]).toEqual({ kml: 2.5, km: 1000, litros: 400 });
  });
});
