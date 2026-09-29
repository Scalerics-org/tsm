import { describe, it, expect } from "vitest";
import {
  DIAS_REPETIDAS_VIGENTES,
  repetidasVigentes,
  surtidasRepetidas,
  VENTANA_REPETIDA_MIN,
} from "../shared/surtidas-repetidas";

const base = Date.parse("2026-09-20T12:00:00Z");
const en = (min: number) => new Date(base + min * 60_000).toISOString().replace("T", " ").slice(0, 19);

let id = 0;
const s = (o: Partial<{ truck_id: number; odometer_km: number | null; liters: number; min: number }> = {}) => ({
  id: ++id,
  truck_id: o.truck_id ?? 1,
  odometer_km: o.odometer_km === undefined ? 481_250 : o.odometer_km,
  liters: o.liters ?? 220.8,
  logged_at: en(o.min ?? 0),
});

describe("surtidasRepetidas", () => {
  it("dos iguales con pocos minutos de por medio son un par", () => {
    const a = s({ min: 0 });
    const b = s({ min: 3 });
    const r = surtidasRepetidas([a, b]);
    expect(r).toHaveLength(1);
    expect(r[0].primera.id).toBe(a.id);
    expect(r[0].segunda.id).toBe(b.id);
    expect(r[0].minutos).toBe(3);
  });

  it("dos surtidas reales parecidas el mismo día, con OTRO odómetro, no son un par", () => {
    expect(surtidasRepetidas([s({ min: 0 }), s({ min: 3, odometer_km: 481_900 })])).toEqual([]);
  });

  it("otros litros, no", () => {
    expect(surtidasRepetidas([s({ min: 0 }), s({ min: 3, liters: 200 })])).toEqual([]);
  });

  it("de camiones distintos, no", () => {
    expect(surtidasRepetidas([s({ min: 0 }), s({ min: 3, truck_id: 2 })])).toEqual([]);
  });

  it("iguales pero separadas por más de la ventana, no", () => {
    expect(surtidasRepetidas([s({ min: 0 }), s({ min: VENTANA_REPETIDA_MIN })])).toHaveLength(1);
    expect(surtidasRepetidas([s({ min: 0 }), s({ min: VENTANA_REPETIDA_MIN + 1 })])).toEqual([]);
  });

  it("tres iguales seguidas dan dos pares", () => {
    expect(surtidasRepetidas([s({ min: 0 }), s({ min: 2 }), s({ min: 4 })])).toHaveLength(2);
  });

  it("no depende del orden en que vienen", () => {
    const a = s({ min: 0 });
    const b = s({ min: 5 });
    const r = surtidasRepetidas([b, a]);
    expect(r[0].primera.id).toBe(a.id);
  });

  it("la cámara de frío (sin odómetro) se compara por camión y litros", () => {
    const r = surtidasRepetidas([s({ odometer_km: null, liters: 85.5, min: 0 }), s({ odometer_km: null, liters: 85.5, min: 4 })]);
    expect(r).toHaveLength(1);
    expect(surtidasRepetidas([s({ odometer_km: null, liters: 85.5 }), s({ odometer_km: null, liters: 90, min: 4 })])).toEqual([]);
  });

  it("los litros con ruido de decimales cuentan como iguales", () => {
    expect(surtidasRepetidas([s({ liters: 220.8 }), s({ liters: 120.5 + 100.3, min: 2 })])).toHaveLength(1);
  });

  it("sin surtidas o con una sola, nada", () => {
    expect(surtidasRepetidas([])).toEqual([]);
    expect(surtidasRepetidas([s()])).toEqual([]);
  });
});

describe("repetidasVigentes", () => {
  it("deja los recientes y saca los viejos", () => {
    const viejo = surtidasRepetidas([s({ min: 0 }), s({ min: 2 })]);
    const ahora = new Date(base + (DIAS_REPETIDAS_VIGENTES + 1) * 86_400_000);
    expect(repetidasVigentes(viejo, ahora)).toEqual([]);
    expect(repetidasVigentes(viejo, new Date(base + 86_400_000))).toHaveLength(1);
  });
});
