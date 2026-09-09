import { describe, it, expect } from "vitest";
import { aTexto, aIso, tipeando } from "../src/lib/fecha";

/**
 * Las fechas se escriben y se leen como acá: día/mes/año.
 *
 * `<input type="date">` NO elige su formato: lo elige el navegador según el idioma que tenga
 * configurado. Con Chrome en inglés muestra 08/03/2026 para el 3 de agosto, justo al lado del
 * texto que nosotros sí formateamos y que dice 03/08/2026. Dos formatos contradiciéndose en
 * la misma pantalla, en un campo que decide a qué mes va a parar un viaje.
 *
 * No se puede arreglar con `lang`: Chrome mira su propio idioma, no el del documento. Así que
 * el campo pasa a ser nuestro y el formato deja de depender de cómo tenga el navegador cada
 * uno.
 */

describe("de ISO a lo que se lee", () => {
  it("da vuelta el orden", () => {
    expect(aTexto("2026-08-03")).toBe("03/08/2026");
  });

  it("sin fecha, campo vacío", () => {
    expect(aTexto("")).toBe("");
    expect(aTexto(null)).toBe("");
  });

  it("aguanta una fecha con hora pegada", () => {
    expect(aTexto("2026-08-03 21:34:00")).toBe("03/08/2026");
  });
});

describe("de lo que se escribe a ISO", () => {
  it("lee dd/mm/aaaa", () => {
    expect(aIso("03/08/2026")).toBe("2026-08-03");
  });

  it("acepta un día o un mes de un solo dígito", () => {
    expect(aIso("3/8/2026")).toBe("2026-08-03");
  });

  it("acepta guiones y puntos, que es como se tipea rápido", () => {
    expect(aIso("03-08-2026")).toBe("2026-08-03");
    expect(aIso("03.08.2026")).toBe("2026-08-03");
  });

  it("devuelve vacío mientras la fecha está a medio escribir", () => {
    for (const v of ["", "0", "03", "03/", "03/08", "03/08/20"]) {
      expect(aIso(v), v).toBe("");
    }
  });

  it("rechaza un día o un mes que no existen", () => {
    expect(aIso("32/08/2026")).toBe("");
    expect(aIso("03/13/2026")).toBe("");
    expect(aIso("00/08/2026")).toBe("");
  });

  /**
   * El 31 de un mes de 30 no es un error de tipeo cualquiera: puesto en un viaje lo manda al
   * mes que no es, y ahí cambia el resumen con el que se factura.
   */
  it("rechaza un día que ese mes no tiene", () => {
    expect(aIso("31/04/2026")).toBe("");
    expect(aIso("30/02/2026")).toBe("");
  });

  it("acepta el 29 de febrero cuando el año es bisiesto", () => {
    expect(aIso("29/02/2028")).toBe("2028-02-29");
    expect(aIso("29/02/2026")).toBe("");
  });
});

describe("mientras se escribe", () => {
  /** Las barras las pone el campo: tipear ocho números tiene que alcanzar. */
  it("va poniendo las barras solo", () => {
    expect(tipeando("0")).toBe("0");
    expect(tipeando("03")).toBe("03/");
    expect(tipeando("038")).toBe("03/8");
    expect(tipeando("0308")).toBe("03/08/");
    expect(tipeando("03082026")).toBe("03/08/2026");
  });

  it("ignora lo que no sea número", () => {
    expect(tipeando("03/08/2026")).toBe("03/08/2026");
    expect(tipeando("03-08-2026")).toBe("03/08/2026");
    expect(tipeando("abc")).toBe("");
  });

  it("no deja escribir de más", () => {
    expect(tipeando("030820261234")).toBe("03/08/2026");
  });

  /** Borrar tiene que poder borrar la barra, o el campo se traba en "03/". */
  it("borrar hacia atrás no vuelve a poner la barra", () => {
    expect(tipeando("03/", { borrando: true })).toBe("03");
    expect(tipeando("03/08/", { borrando: true })).toBe("03/08");
  });
});
