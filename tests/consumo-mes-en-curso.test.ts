import { describe, expect, it } from "vitest";
import {
  consumoDelMesEnCurso,
  consumoMensualParaMostrar,
  fuelFeedback,
  monthlyConsumption,
} from "@shared/domain";
import { consumoMensualDelCamion } from "../api/lib/consumo-camiones";

/**
 * El mes ABIERTO se ve igual en la oficina y en el celular del chofer; los meses CERRADOS siguen por calendario.
 *
 * "Mientras no altere cómo medir el consumo y lo que te pedí acorde a los cierres, me gustaría ver lo mismo que
 * ellos, para estar alineados." — Rodrigo, 8/10. Lo que cierra contra las facturas (agosto, cerrado) no se toca.
 */

// Las surtidas reales de GTP 4382 (las mismas de consumo-calendario.test.ts): agosto cerrado, setiembre abierto.
const GTP_4382 = [
  { logged_at: "2026-07-31 21:08:15", odometer_km: 355804, liters: 424.56, is_full: true },
  { logged_at: "2026-08-04 21:09:55", odometer_km: 357077, liters: 390.17, is_full: true },
  { logged_at: "2026-08-06 21:11:02", odometer_km: 358307, liters: 392.92, is_full: true },
  { logged_at: "2026-08-11 21:12:25", odometer_km: 359552, liters: 378.49, is_full: true },
  { logged_at: "2026-08-14 21:13:29", odometer_km: 360810, liters: 433.79, is_full: true },
  { logged_at: "2026-08-18 21:14:30", odometer_km: 362063, liters: 373.61, is_full: true },
  { logged_at: "2026-08-21 21:15:31", odometer_km: 363316, liters: 371.12, is_full: true },
  { logged_at: "2026-08-25 21:16:32", odometer_km: 364577, liters: 399.72, is_full: true },
  { logged_at: "2026-08-28 21:17:33", odometer_km: 365831, liters: 350.44, is_full: true },
  { logged_at: "2026-09-01 21:18:34", odometer_km: 367106, liters: 401.33, is_full: true },
  { logged_at: "2026-09-05 21:19:35", odometer_km: 367829, liters: 230.79, is_full: true },
];

const mes = <T extends { month: string }>(r: T[], m: string) => r.find((x) => x.month === m);

describe("el mes en curso: oficina y chofer dan EXACTAMENTE lo mismo", () => {
  it("el km/L del mes abierto de la oficina es el acumulado que ve el chofer al cargar la última surtida", () => {
    const ultima = GTP_4382[GTP_4382.length - 1];
    const chofer = fuelFeedback(GTP_4382, ultima);
    const oficina = mes(consumoMensualParaMostrar(GTP_4382), "2026-09");

    expect(oficina?.closed).toBe(false);
    expect(oficina?.kml).toBe(chofer.month_kml);
    expect(oficina?.km).toBe(chofer.month_km);
    expect(oficina?.liters).toBe(chofer.month_liters);
  });

  it("de primer a último llenado de setiembre: 723 km con los 230,79 L del llenado de cierre", () => {
    const abierto = consumoDelMesEnCurso(GTP_4382, "2026-09");
    expect(abierto.km).toBe(723);
    expect(abierto.liters).toBeCloseTo(230.79, 2);
    expect(abierto.kml).toBeCloseTo(3.1325, 3);
  });

  it("no cuenta los litros cargados después del último llenado (siguen en el tanque), y la oficina tampoco", () => {
    const conChorro = [
      ...GTP_4382,
      { logged_at: "2026-09-07 10:00:00", odometer_km: 367900, liters: 120, is_full: false },
    ];
    const chorro = conChorro[conChorro.length - 1];
    const chofer = fuelFeedback(conChorro, chorro);
    const oficina = mes(consumoMensualParaMostrar(conChorro), "2026-09");
    expect(oficina?.kml).toBe(chofer.month_kml);
    expect(oficina?.liters).toBeCloseTo(230.79, 2);
  });

  it("la oficina ya no da el número de calendario en el mes abierto (eran distintos)", () => {
    const calendario = mes(monthlyConsumption(GTP_4382), "2026-09");
    const mostrado = mes(consumoMensualParaMostrar(GTP_4382), "2026-09");
    expect(calendario?.kml).not.toBe(mostrado?.kml);
  });
});

describe("los meses cerrados no se tocan", () => {
  it("agosto de GTP 4382 sigue en 10.027 km / 3.090,26 L / 3,24 km/L por calendario", () => {
    const agosto = mes(consumoMensualParaMostrar(GTP_4382), "2026-08");
    expect(agosto?.closed).toBe(true);
    expect(agosto?.km).toBe(10027);
    expect(agosto?.liters).toBeCloseTo(3090.26, 2);
    expect(agosto?.kml).toBeCloseTo(3.245, 3);
  });

  it("es idéntico a monthlyConsumption en todo mes cerrado", () => {
    const viejos = monthlyConsumption(GTP_4382).filter((m) => m.closed);
    const nuevos = consumoMensualParaMostrar(GTP_4382).filter((m) => m.closed);
    expect(nuevos).toEqual(viejos);
  });

  it("aparecen los mismos meses y en el mismo orden", () => {
    expect(consumoMensualParaMostrar(GTP_4382).map((m) => m.month)).toEqual(
      monthlyConsumption(GTP_4382).map((m) => m.month),
    );
  });

  it("lo que manda la API (redondeado) conserva agosto cerrado y pone setiembre con la cuenta del chofer", () => {
    const filas = consumoMensualDelCamion(
      GTP_4382.map((l, i) => ({ id: i, truck_id: 1, ...l })) as any,
    );
    expect(filas.find((m) => m.month === "2026-08")).toMatchObject({ km: 10027, liters: 3090, kml: 3.24, closed: true });
    expect(filas.find((m) => m.month === "2026-09")).toMatchObject({ km: 723, liters: 231, closed: false });
  });
});

describe("con menos de dos llenados en el mes abierto", () => {
  const poco = [
    { logged_at: "2026-08-28 21:17:33", odometer_km: 365831, liters: 350.44, is_full: true },
    { logged_at: "2026-09-01 21:18:34", odometer_km: 367106, liters: 401.33, is_full: true },
  ];

  it("no hay tramo en el mes: km/L vacío, como en el celular", () => {
    const chofer = fuelFeedback(poco, poco[1]);
    const setiembre = mes(consumoMensualParaMostrar(poco), "2026-09");
    expect(chofer.month_kml).toBeNull();
    expect(setiembre?.kml).toBeNull();
  });

  it("el mes sigue apareciendo y conserva los km y litros del calendario", () => {
    const calendario = mes(monthlyConsumption(poco), "2026-09");
    const setiembre = mes(consumoMensualParaMostrar(poco), "2026-09");
    expect(setiembre).toBeDefined();
    expect(setiembre?.km).toBe(calendario?.km);
    expect(setiembre?.liters).toBe(calendario?.liters);
  });
});
