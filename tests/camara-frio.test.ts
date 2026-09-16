import { describe, it, expect } from "vitest";
import { consumoFrioPorMes, validarHorasFrio } from "@shared/camara-frio";

/**
 * El consumo de la cámara de frío.
 *
 * "Agregale surtida cámara frío, solo para la boleta del gas oil. Y yo desde la oficina le
 * agrego las horas inicio de mes, final de mes, y ahí me da litros por hora que gasta." —
 * Rodrigo, 16/9/2026. El chofer no puede leer las horas del equipo: las pone la oficina una
 * vez por mes.
 *
 * Misma regla que el camión: los litros del mes son TODO lo cargado dentro del mes.
 */

const s = (logged_at: string, liters: number) => ({ logged_at, liters });

describe("consumoFrioPorMes", () => {
  it("litros del mes sobre las horas del mes", () => {
    const meses = consumoFrioPorMes(
      [s("2026-09-03 10:00:00", 120), s("2026-09-20 08:00:00", 80)],
      [{ mes: "2026-09", horas_inicio: 1_000, horas_fin: 1_100 }],
    );
    expect(meses).toEqual([
      { mes: "2026-09", litros: 200, surtidas: 2, horas_inicio: 1_000, horas_fin: 1_100, horas: 100, litros_por_hora: 2 },
    ]);
  });

  it("cada litro cae en el mes en que se cargó", () => {
    const meses = consumoFrioPorMes([s("2026-08-31 23:00:00", 50), s("2026-09-01 01:00:00", 70)], []);
    expect(meses.map((m) => [m.mes, m.litros])).toEqual([
      ["2026-09", 70],
      ["2026-08", 50],
    ]);
  });

  it("sin las dos horas no hay litros por hora, pero los litros se ven igual", () => {
    const [m] = consumoFrioPorMes([s("2026-09-03 10:00:00", 120)], [
      { mes: "2026-09", horas_inicio: 1_000, horas_fin: null },
    ]);
    expect(m.litros).toBe(120);
    expect(m.horas).toBeNull();
    expect(m.litros_por_hora).toBeNull();
  });

  it("un mes con horas cargadas y sin surtidas aparece, con 0 litros", () => {
    const [m] = consumoFrioPorMes([], [{ mes: "2026-09", horas_inicio: 1_000, horas_fin: 1_050 }]);
    expect(m).toMatchObject({ mes: "2026-09", litros: 0, horas: 50, litros_por_hora: null });
  });

  it("si las horas no avanzan no se inventa un número", () => {
    const [m] = consumoFrioPorMes([s("2026-09-03 10:00:00", 120)], [
      { mes: "2026-09", horas_inicio: 1_000, horas_fin: 1_000 },
    ]);
    expect(m.horas).toBeNull();
    expect(m.litros_por_hora).toBeNull();
  });

  it("el mes más nuevo va primero", () => {
    const meses = consumoFrioPorMes([s("2026-07-10 10:00:00", 1), s("2026-09-10 10:00:00", 1)], [
      { mes: "2026-08", horas_inicio: 1, horas_fin: 2 },
    ]);
    expect(meses.map((m) => m.mes)).toEqual(["2026-09", "2026-08", "2026-07"]);
  });
});

describe("validarHorasFrio", () => {
  it("acepta las dos horas, una sola o ninguna", () => {
    expect(validarHorasFrio(1_000, 1_100)).toBeNull();
    expect(validarHorasFrio(1_000, null)).toBeNull();
    expect(validarHorasFrio(null, 1_100)).toBeNull();
    expect(validarHorasFrio(null, null)).toBeNull();
  });

  it("el final no puede ser menor que el inicio", () => {
    expect(validarHorasFrio(1_100, 1_000)).toMatch(/final/i);
  });

  it("no acepta horas negativas ni que no sean números", () => {
    expect(validarHorasFrio(-1, null)).not.toBeNull();
    expect(validarHorasFrio(Number.NaN, null)).not.toBeNull();
  });
});
