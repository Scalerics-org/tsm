import { describe, it, expect } from "vitest";
import {
  esReciente,
  surtidaFrioYaGuardada,
  surtidaYaGuardada,
  VENTANA_REENVIO_MIN,
} from "../shared/envio-ya-llego";

const AHORA = "2026-09-29 17:14:00";
const hace = (min: number) =>
  new Date(Date.parse("2026-09-29T17:14:00Z") - min * 60_000).toISOString().replace("T", " ").slice(0, 19);

const enviada = { driver_id: 2, odometer_km: 481_250, liters: 220.8 };
const log = (o: Partial<{ driver_id: number | null; odometer_km: number; liters: number; logged_at: string }> = {}) => ({
  driver_id: 2,
  odometer_km: 481_250,
  liters: 220.8,
  logged_at: hace(1),
  ...o,
});

describe("esReciente", () => {
  it("dentro de la ventana sí, fuera no", () => {
    expect(esReciente(hace(1), AHORA)).toBe(true);
    expect(esReciente(hace(VENTANA_REENVIO_MIN), AHORA)).toBe(true);
    expect(esReciente(hace(VENTANA_REENVIO_MIN + 1), AHORA)).toBe(false);
  });
  it("una fecha del futuro o ilegible no es reciente", () => {
    expect(esReciente(hace(-5), AHORA)).toBe(false);
    expect(esReciente("no es fecha", AHORA)).toBe(false);
  });
});

describe("surtidaYaGuardada", () => {
  it("la misma surtida de hace un minuto ya está guardada", () => {
    expect(surtidaYaGuardada(enviada, { ahora: AHORA, surtidas: [log()] })).toBe(true);
  });
  it("dos surtidas parecidas con OTRO odómetro no son la misma", () => {
    expect(surtidaYaGuardada(enviada, { ahora: AHORA, surtidas: [log({ odometer_km: 481_251 })] })).toBe(false);
  });
  it("mismo odómetro y otros litros: no es la misma", () => {
    expect(surtidaYaGuardada(enviada, { ahora: AHORA, surtidas: [log({ liters: 200 })] })).toBe(false);
  });
  it("una igual pero de hace una hora es una surtida distinta (no se la traga)", () => {
    expect(surtidaYaGuardada(enviada, { ahora: AHORA, surtidas: [log({ logged_at: hace(60) })] })).toBe(false);
  });
  it("de otro chofer no cuenta", () => {
    expect(surtidaYaGuardada(enviada, { ahora: AHORA, surtidas: [log({ driver_id: 3 })] })).toBe(false);
  });
  it("absorbe el error de sumar los dos tanques", () => {
    expect(surtidaYaGuardada({ ...enviada, liters: 120.5 + 100.3 }, { ahora: AHORA, surtidas: [log()] })).toBe(true);
  });
  it("sin surtidas, no está", () => {
    expect(surtidaYaGuardada(enviada, { ahora: AHORA, surtidas: [] })).toBe(false);
  });
});

describe("surtidaFrioYaGuardada", () => {
  const frio = { driver_id: 2, liters: 85.5, logged_at: hace(2) };
  it("mismos litros, mismo chofer, hace pocos minutos", () => {
    expect(surtidaFrioYaGuardada({ driver_id: 2, liters: 85.5 }, { ahora: AHORA, surtidas: [frio] })).toBe(true);
  });
  it("otros litros o mucho tiempo antes: no", () => {
    expect(surtidaFrioYaGuardada({ driver_id: 2, liters: 90 }, { ahora: AHORA, surtidas: [frio] })).toBe(false);
    expect(
      surtidaFrioYaGuardada({ driver_id: 2, liters: 85.5 }, { ahora: AHORA, surtidas: [{ ...frio, logged_at: hace(300) }] }),
    ).toBe(false);
  });
});
