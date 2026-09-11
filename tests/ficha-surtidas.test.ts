import { describe, it, expect } from "vitest";
import { surtidasParaLaFicha } from "../api/lib/surtidas-a-revisar";

/**
 * Qué surtidas muestra la ficha del camión.
 *
 * Mostraba sólo las últimas 20, y encima recalculaba el aviso de litros con esas 20: con más
 * de 20 surtidas la ficha y Control marcaban cosas distintas, y una surtida marcada que quedara
 * más atrás no se podía tildar nunca. El aviso ahora se calcula en el servidor con todas; esto
 * decide sólo cuáles se listan.
 */

/** 25 surtidas, de la más nueva (id 25) a la más vieja (id 1), como las devuelve el repo. */
const FUEL = Array.from({ length: 25 }, (_, i) => ({ id: 25 - i }));

describe("las surtidas de la ficha", () => {
  it("sin nada para revisar, son las últimas 20", () => {
    const r = surtidasParaLaFicha(FUEL, new Set());
    expect(r).toHaveLength(20);
    expect(r[0].id).toBe(25);
    expect(r[19].id).toBe(6);
  });

  it("una marcada más vieja que las 20 se suma al final, para que se pueda tildar", () => {
    const r = surtidasParaLaFicha(FUEL, new Set([3]));
    expect(r).toHaveLength(21);
    expect(r[20].id).toBe(3);
  });

  it("una marcada que ya está entre las 20 no se repite", () => {
    const r = surtidasParaLaFicha(FUEL, new Set([23, 3]));
    expect(r.filter((f) => f.id === 23)).toHaveLength(1);
    expect(r.map((f) => f.id).slice(-1)).toEqual([3]);
  });

  it("el orden sigue siendo de la más nueva a la más vieja", () => {
    const ids = surtidasParaLaFicha(FUEL, new Set([4, 2])).map((f) => f.id);
    expect(ids).toEqual([...ids].sort((a, b) => b - a));
  });

  it("un camión con pocas surtidas las muestra todas", () => {
    expect(surtidasParaLaFicha(FUEL.slice(0, 5), new Set([23]))).toHaveLength(5);
  });
});
