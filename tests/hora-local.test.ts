import { describe, it, expect } from "vitest";
import { fmtDate, fmtDateTime } from "../src/lib/format";

/**
 * "¿Qué pasó con la hora?" — Gonzalo, 18/9/2026, con una captura: el chofer salió a las 14:14 y
 * la app decía 05:14 p. m. El servidor guarda en UTC ("2026-09-18 17:14:00", sin zona) y
 * `fmtDateTime` lo leía como hora local: todas las horas de la app salían tres horas adelantadas.
 *
 * Los tests comparan contra la conversión del propio entorno para no depender de la zona de la
 * máquina que los corre: lo que importa es que el texto guardado se lea como UTC.
 */
const OPCIONES: Intl.DateTimeFormatOptions = {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
};

describe("fmtDateTime", () => {
  it("lee lo guardado como UTC y lo muestra en la hora de acá", () => {
    const esperado = new Date(Date.UTC(2026, 8, 18, 17, 14)).toLocaleString("es-UY", OPCIONES);
    expect(fmtDateTime("2026-09-18 17:14:00")).toBe(esperado);
  });

  it("lo que ya trae zona no se toca", () => {
    const esperado = new Date("2026-09-18T17:14:00Z").toLocaleString("es-UY", OPCIONES);
    expect(fmtDateTime("2026-09-18T17:14:00Z")).toBe(esperado);
    expect(fmtDateTime("2026-09-18T17:14:00.000Z")).toBe(esperado);
  });

  it("sin fecha, guion", () => {
    expect(fmtDateTime(null)).toBe("—");
  });
});

describe("fmtDate", () => {
  it("una fecha sola es ese día, en cualquier zona (vencimiento de licencia)", () => {
    expect(fmtDate("2026-10-01")).toBe("01/10/2026");
  });

  it("una fecha con hora se pasa a la de acá: cerrar a las 22 no puede caer al otro día", () => {
    const esperado = new Date(Date.UTC(2026, 8, 19, 1, 0)).toLocaleDateString("es-UY", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
    expect(fmtDate("2026-09-19 01:00:00")).toBe(esperado);
  });
});
