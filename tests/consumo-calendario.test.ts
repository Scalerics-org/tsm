import { describe, expect, it } from "vitest";
import { consumoDelPeriodo, monthlyConsumption } from "@shared/domain";

/**
 * El consumo se mide por CALENDARIO, no llenado a llenado.
 *
 * "Creo q yo te pedí que tome la primera surtida del mes próximo. Pero tiene q tomar la
 * última surtida del mes anterior como inicial. 357.077 - 355.804 = 1.273 esos kilómetros no
 * lo está tomando en el resumen de agosto."
 *
 * Con el modelo viejo esos 1.273 km no se perdían: caían en JULIO, y con ellos los 390,17
 * litros que se cargaron el 4 de agosto. O sea que gasoil comprado en agosto se contabilizaba
 * en julio, y contra las facturas no cerraba nunca. La regla nueva es la de él:
 *
 *   km del mes     = último odómetro del mes − último odómetro del mes anterior
 *   litros del mes = TODO lo cargado dentro del mes
 *
 * Cada litro cae en el mes en que se compró. El costo es que el km/L de un mes suelto queda
 * aproximado —en el corte el tanque no está necesariamente lleno— y eso se compensa de un mes
 * al otro. Para quien concilia contra facturas, es el cambio correcto.
 */

/** Las surtidas reales de GTP 4382 en producción, que son las del reclamo. */
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

const mes = (r: ReturnType<typeof monthlyConsumption>, m: string) => r.find((x) => x.month === m);

describe("monthlyConsumption por calendario", () => {
  it("arranca agosto en la última surtida de julio, no en la primera de agosto", () => {
    const agosto = mes(monthlyConsumption(GTP_4382), "2026-08");
    // 365.831 (última de agosto) − 355.804 (última de julio)
    expect(agosto?.km).toBe(10027);
  });

  it("cuenta en agosto TODOS los litros cargados en agosto, incluida la del 4", () => {
    const agosto = mes(monthlyConsumption(GTP_4382), "2026-08");
    // Los 390,17 del 4 de agosto ahora caen en agosto; antes se iban a julio.
    expect(agosto?.liters).toBeCloseTo(3090.26, 2);
    expect(agosto?.kml).toBeCloseTo(3.245, 3);
  });

  it("no deja julio como un mes fantasma de 1.273 km", () => {
    // Julio tiene una sola surtida y ninguna anterior contra la cual medir: no hay mes.
    expect(mes(monthlyConsumption(GTP_4382), "2026-07")).toBeUndefined();
  });

  it("los km de meses consecutivos suman lo mismo que el odómetro punta a punta", () => {
    const r = monthlyConsumption(GTP_4382);
    const suma = r.reduce((s, m) => s + m.km, 0);
    // De la primera surtida a la última, sin que se pierda ni se duplique un solo kilómetro.
    expect(suma).toBe(367829 - 355804);
  });

  it("marca cerrado el mes que ya tiene surtidas posteriores, y abierto el último", () => {
    const r = monthlyConsumption(GTP_4382);
    expect(mes(r, "2026-08")?.closed).toBe(true);
    expect(mes(r, "2026-09")?.closed).toBe(false);
  });

  it("devuelve el más reciente primero", () => {
    expect(monthlyConsumption(GTP_4382).map((m) => m.month)).toEqual(["2026-09", "2026-08"]);
  });
});

describe("consumoDelPeriodo, la misma regla para cualquier rango", () => {
  it("da lo mismo que el mes cuando el rango ES el mes", () => {
    const porPeriodo = consumoDelPeriodo(GTP_4382, "2026-08-01", "2026-08-31");
    const porMes = mes(monthlyConsumption(GTP_4382), "2026-08");
    // La tarjeta "Por camión" y la de "Consumo mensual" tienen que decir lo mismo. Que no lo
    // dijeran es justo lo que reportó el cliente: 10.816 km / 2,74 contra 11.197 / 2,77.
    expect(porPeriodo.km).toBe(porMes?.km);
    expect(porPeriodo.liters).toBeCloseTo(porMes?.liters ?? 0, 2);
    expect(porPeriodo.kml).toBeCloseTo(porMes?.kml ?? 0, 4);
  });

  it("sin surtida previa al rango, la primera de adentro es la línea de base", () => {
    const r = consumoDelPeriodo(GTP_4382, "2026-07-01", "2026-08-31");
    // Arranca en 355.804 (su propia primera) y llega a 365.831.
    expect(r.km).toBe(10027);
    // Y esos 424,56 litros del 31/7 NO cuentan: son la base, llenaron el tanque para km
    // que se hicieron antes del rango.
    expect(r.liters).toBeCloseTo(3090.26, 2);
  });

  it("un rango sin ninguna surtida no inventa consumo", () => {
    const r = consumoDelPeriodo(GTP_4382, "2026-06-01", "2026-06-30");
    expect(r).toEqual({ km: 0, liters: 0, kml: null, base_propia: true });
  });

  it("avisa cuándo el período se midió desde adentro y le falta el arranque", () => {
    // Con surtida anterior, el período está medido de punta a punta.
    expect(consumoDelPeriodo(GTP_4382, "2026-08-01", "2026-08-31").base_propia).toBe(false);
    // Sin nada antes, arranca en su propia primera y el tramo previo queda afuera.
    expect(consumoDelPeriodo(GTP_4382, "2026-07-01", "2026-07-31").base_propia).toBe(true);
  });
});

describe("corrección de odómetro en el medio", () => {
  // La oficina puede corregir el odómetro para abajo. Dos escalas distintas no se restan.
  const conSalto = [
    { logged_at: "2026-08-02 10:00:00", odometer_km: 393000, liters: 400, is_full: true },
    { logged_at: "2026-08-05 10:00:00", odometer_km: 394000, liters: 300, is_full: true },
    { logged_at: "2026-08-10 10:00:00", odometer_km: 140000, liters: 350, is_full: true },
    { logged_at: "2026-08-20 10:00:00", odometer_km: 141500, liters: 380, is_full: true },
    { logged_at: "2026-09-03 10:00:00", odometer_km: 143000, liters: 390, is_full: true },
  ];

  it("no devuelve kilómetros negativos cuando cambió la escala", () => {
    for (const m of monthlyConsumption(conSalto)) expect(m.km).toBeGreaterThanOrEqual(0);
  });

  it("mide agosto sobre la escala nueva, ignorando lo de antes del salto", () => {
    const agosto = mes(monthlyConsumption(conSalto), "2026-08");
    expect(agosto?.km).toBe(141500 - 140000);
  });
});
