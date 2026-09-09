import { describe, it, expect } from "vitest";
import { fechaDeFoto } from "../api/lib/lectura-periodo";

/**
 * La fecha de la foto del tacógrafo, corregible desde oficina.
 *
 * `tomada_at` se llenaba con `datetime('now')` en el momento de guardar, y nadie podía
 * decirle cuándo se había sacado la foto. Mientras el chofer la sacaba parado en la ruta eso
 * era lo mismo. Pero hoy TODO lo carga la oficina de atrás: los choferes todavía no usan la
 * app. Así que `tomada_at` venía siendo la fecha en que se subió el archivo, no la del
 * tacógrafo.
 *
 * Y de ahí salía el descuadre entero: la auditoría compara la ventana que va de una foto a la
 * otra, así que estaba comparando ventanas definidas por fechas de carga. La foto real de la
 * GTP 4382 marca 367.106 —el odómetro del 1 de setiembre— y figuraba como del 5, que es el día
 * que Rodrigo la subió.
 *
 * LA HORA. Cuando sólo se da el día se guarda al MEDIODÍA, y no a las 00:00 ni a las 23:59:
 * esta fecha es a la vez el final de la ventana de su mes y el arranque de la del siguiente.
 * Cualquiera de los dos extremos deja media jornada de viajes del lado equivocado; el mediodía
 * reparte el error.
 */

const HOY = "2026-09-09";

describe("la fecha de la foto", () => {
  it("acepta un día y lo guarda al mediodía", () => {
    const r = fechaDeFoto("2026-09-01", { hoy: HOY });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.fecha).toBe("2026-09-01 12:00:00");
  });

  it("acepta día y hora cuando se sabe, y la respeta", () => {
    const r = fechaDeFoto("2026-09-01 19:15:00", { hoy: HOY });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.fecha).toBe("2026-09-01 19:15:00");
  });

  it("rechaza lo que no es una fecha", () => {
    for (const v of ["", "ayer", "01/09/2026", "2026-13-01", null, undefined, 42]) {
      expect(fechaDeFoto(v, { hoy: HOY }).ok, String(v)).toBe(false);
    }
  });

  it("no deja poner una fecha futura: una foto del futuro no existe", () => {
    const r = fechaDeFoto("2026-09-10", { hoy: HOY });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toMatch(/futuro|todav/i);
  });

  it("hoy sí se acepta", () => {
    expect(fechaDeFoto(HOY, { hoy: HOY }).ok).toBe(true);
  });
});

describe("el orden entre lecturas no se puede romper", () => {
  /**
   * Las fotos van una detrás de otra: la de agosto se saca antes que la de setiembre. Si una
   * queda con fecha posterior a la siguiente, la ventana que compara la auditoría se da vuelta
   * y pasa a medir kilómetros negativos, en silencio.
   */
  it("frena una fecha posterior a la de la lectura siguiente", () => {
    const r = fechaDeFoto("2026-09-20", {
      hoy: "2026-10-01",
      siguiente: "2026-09-05 12:00:00",
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toContain("2026-09-05");
  });

  it("frena una fecha anterior a la de la lectura previa", () => {
    const r = fechaDeFoto("2026-08-01", { hoy: HOY, previa: "2026-08-20 12:00:00" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toContain("2026-08-20");
  });

  it("entre las dos, pasa", () => {
    const r = fechaDeFoto("2026-09-01", {
      hoy: HOY,
      previa: "2026-08-20 12:00:00",
      siguiente: "2026-09-05 12:00:00",
    });
    expect(r.ok).toBe(true);
  });

  it("sin vecinos, cualquier fecha pasada sirve", () => {
    expect(fechaDeFoto("2026-07-15", { hoy: HOY }).ok).toBe(true);
  });

  /**
   * El caso real que motivó todo esto: la foto que CIERRA agosto se saca en los primeros días
   * de setiembre. La fecha tiene que poder quedar fuera del mes de la lectura — es justo lo
   * que la pantalla muestra aparte para que se vea la ventana que de verdad se comparó.
   */
  it("la foto de una lectura de agosto puede ser de setiembre", () => {
    const r = fechaDeFoto("2026-09-01", { hoy: HOY, previa: "2026-08-01 12:00:00" });
    expect(r.ok).toBe(true);
  });
});
