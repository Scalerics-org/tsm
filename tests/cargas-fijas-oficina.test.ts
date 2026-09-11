import { describe, it, expect } from "vitest";
import { conCantidadesFijas, problemaDeCantidad, UNIDAD, type Unidad } from "@shared/domain";

/**
 * Las cargas fijas cuando la oficina carga el viaje a mano, y la cantidad de cualquier carga.
 *
 * "+ Cargar viaje" no sabía nada de las cargas fijas, pero el servidor las crea siempre. En
 * las seis plantillas que las tienen (Manassi ida y vuelta, tres de UAM, Agencia Mdeo) el viaje
 * nacía con la carga fija SIN cantidad —y como nace cerrado, no había forma de ponérsela—, o
 * duplicada, si la oficina la volvía a cargar en la "Carga 1" que la pantalla le ofrecía vacía.
 * Las dos cosas se facturan mal.
 */

type Fija = { remitente: string; cantidad: number | null; unidad: Unidad | null };

/** La ida y la vuelta de Manassi: dos cargas fijas, sin cantidad, como vienen de la plantilla. */
const MANASSI: Fija[] = [
  { remitente: "ALUR", cantidad: null, unidad: UNIDAD.PALLETS },
  { remitente: "Salus", cantidad: null, unidad: UNIDAD.PALLETS },
];

describe("las cantidades de las cargas fijas", () => {
  it("se emparejan por posición con las fijas de la plantilla", () => {
    const r = conCantidadesFijas(MANASSI, [{ cantidad: 24, unidad: "pallets" }, { cantidad: "22" }]);
    expect(r.map((f) => [f.remitente, f.cantidad])).toEqual([["ALUR", 24], ["Salus", 22]]);
  });

  it("si no llega la unidad, queda la de la plantilla; una unidad inventada se ignora", () => {
    const r = conCantidadesFijas(MANASSI, [{ cantidad: 24 }, { cantidad: 22, unidad: "toneladas" }]);
    expect(r.map((f) => f.unidad)).toEqual([UNIDAD.PALLETS, UNIDAD.PALLETS]);
  });

  it("la que no viene queda sin cantidad, y el servidor la rechaza para la oficina", () => {
    const r = conCantidadesFijas(MANASSI, [{ cantidad: 24 }]);
    expect(r[1].cantidad).toBeNull();
    expect(r.find((f) => f.cantidad == null)?.remitente).toBe("Salus");
  });

  it("sin cantidades se devuelven tal cual: es el camino del chofer, que las completa en ruta", () => {
    expect(conCantidadesFijas(MANASSI, undefined)).toEqual(MANASSI);
  });

  it("no toca las fijas originales", () => {
    conCantidadesFijas(MANASSI, [{ cantidad: 24 }, { cantidad: 22 }]);
    expect(MANASSI.every((f) => f.cantidad === null)).toBe(true);
  });
});

describe("la cantidad de una carga", () => {
  it("vacía todavía no es un error: se completa después", () => {
    expect(problemaDeCantidad(null)).toBeNull();
    expect(problemaDeCantidad(undefined)).toBeNull();
  });

  it("tiene que ser mayor a cero — en producción entró una carga de Agencia con −3 kg", () => {
    expect(problemaDeCantidad(-3)).toBe("La cantidad tiene que ser mayor a cero");
    expect(problemaDeCantidad(0)).toBe("La cantidad tiene que ser mayor a cero");
  });

  it("un texto que no es número no pasa", () => {
    expect(problemaDeCantidad(Number("abc"))).toBe("La cantidad tiene que ser mayor a cero");
    expect(problemaDeCantidad(Infinity)).toBe("La cantidad tiene que ser mayor a cero");
  });

  it("una cantidad normal pasa, con decimales incluidos", () => {
    expect(problemaDeCantidad(24)).toBeNull();
    expect(problemaDeCantidad(1.5)).toBeNull();
  });
});
