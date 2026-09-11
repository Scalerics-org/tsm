import { describe, it, expect } from "vitest";
import { llegadaCorregida } from "../api/lib/llegada";

/**
 * Corregir sólo la llegada de un viaje cerrado.
 *
 * El cierre graba la hora en que el chofer toca el botón. Si se olvida y lo cierra días
 * después, el viaje queda de varios días (el 48 y el 94 ya figuran así), y la oficina no
 * podía corregirlo: cambiar la fecha corre salida y llegada juntas.
 */

const SALIDA = "2026-09-04 10:00:00"; // UTC, como se guarda
const AHORA = new Date("2026-09-11T15:00:00Z");

describe("la llegada corregida", () => {
  it("se guarda en UTC con el formato de la base", () => {
    // La oficina tipeó 04/09 18:00 en Uruguay (UTC-3): llega del navegador como 21:00 UTC.
    const r = llegadaCorregida(SALIDA, "2026-09-04T21:00:00.000Z", AHORA);
    expect(r).toEqual({ ok: true, valor: "2026-09-04 21:00:00" });
  });

  it("también acepta el desfase explícito en vez de la Z", () => {
    const r = llegadaCorregida(SALIDA, "2026-09-04T18:00:00-03:00", AHORA);
    expect(r).toEqual({ ok: true, valor: "2026-09-04 21:00:00" });
  });

  it("sin zona horaria no se acepta: no se sabe si son las 18 de acá o las 18 UTC", () => {
    const r = llegadaCorregida(SALIDA, "2026-09-04 18:00", AHORA);
    expect(r.ok).toBe(false);
  });

  it("no puede ser antes de la salida", () => {
    const r = llegadaCorregida(SALIDA, "2026-09-04T09:00:00Z", AHORA);
    expect(r).toEqual({ ok: false, motivo: "La llegada no puede ser antes de la salida" });
  });

  it("no puede ser en el futuro", () => {
    const r = llegadaCorregida(SALIDA, "2026-09-12T09:00:00Z", AHORA);
    expect(r).toEqual({ ok: false, motivo: "La llegada no puede ser en el futuro" });
  });

  it("un texto cualquiera no pasa", () => {
    expect(llegadaCorregida(SALIDA, "ayer a la tarde", AHORA).ok).toBe(false);
    expect(llegadaCorregida(SALIDA, undefined, AHORA).ok).toBe(false);
  });
});
