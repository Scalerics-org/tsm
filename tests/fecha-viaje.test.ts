import { describe, it, expect } from "vitest";
import { corrimientoEnDias, esFechaValida } from "@shared/domain";

/**
 * "Pidió que pueda cambiar la fecha porque si quiere ingresar un viaje pasado, no puede
 * ahora." — el cliente.
 *
 * Al CREAR el viaje la oficina ya podía elegir la fecha. Lo que faltaba era corregirla
 * después, que es el caso de verdad: el viaje se carga rápido y la fecha se mira al otro día.
 *
 * El viaje se corre ENTERO, salida y llegada juntas. Plantarle la fecha nueva a cada extremo
 * dejaría un viaje de dos días convertido en uno de cero.
 */
describe("corrimientoEnDias", () => {
  it("un viaje de agosto que en realidad fue en mayo se corre para atrás", () => {
    expect(corrimientoEnDias("2026-08-21 09:30:00", "2026-05-14")).toBe(-99);
  });

  it("para adelante también", () => {
    expect(corrimientoEnDias("2026-08-01 00:00:00", "2026-08-05")).toBe(4);
  });

  it("la misma fecha no mueve nada", () => {
    expect(corrimientoEnDias("2026-08-21 09:30:00", "2026-08-21")).toBe(0);
  });

  it("la hora del día no cuenta: se corren días enteros", () => {
    // Las 23:50 y las 00:10 del mismo día tienen que dar el mismo corrimiento, o un viaje
    // cargado de noche se iría un día de más.
    expect(corrimientoEnDias("2026-08-21 23:50:00", "2026-08-20")).toBe(-1);
    expect(corrimientoEnDias("2026-08-21 00:10:00", "2026-08-20")).toBe(-1);
  });

  it("cruza el cambio de mes y el de año sin romperse", () => {
    expect(corrimientoEnDias("2026-01-02", "2025-12-31")).toBe(-2);
  });

  it("una fecha que no se entiende no mueve el viaje en vez de dejarlo en la nada", () => {
    expect(corrimientoEnDias("2026-08-21", "cualquier cosa")).toBe(0);
    expect(corrimientoEnDias("", "2026-08-21")).toBe(0);
  });
});

describe("esFechaValida", () => {
  it("acepta lo que manda el input de fecha", () => {
    expect(esFechaValida("2026-08-21")).toBe(true);
    expect(esFechaValida("2024-02-29")).toBe(true); // bisiesto de verdad
  });

  it("rechaza un día que no existe, no sólo un formato feo", () => {
    // Es el punto: "2026-02-29" pasa cualquier regex de formato y 2026 no es bisiesto.
    expect(esFechaValida("2026-02-29")).toBe(false);
    expect(esFechaValida("2026-02-30")).toBe(false);
    expect(esFechaValida("2026-13-01")).toBe(false);
  });

  it("rechaza lo que no es una fecha", () => {
    expect(esFechaValida("21/08/2026")).toBe(false);
    expect(esFechaValida("2026-8-1")).toBe(false);
    expect(esFechaValida(null)).toBe(false);
    expect(esFechaValida(20260821)).toBe(false);
    expect(esFechaValida("")).toBe(false);
  });
});
