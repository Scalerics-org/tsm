import { describe, it, expect } from "vitest";
import { columnasDeCampos, filasDeViaje, encabezado, COLUMNAS_ANTES } from "../api/lib/export-viajes";
import type { Trip, TripSegment, TripTemplate } from "@shared/domain";

/**
 * Los datos de CABECERA no se repiten en cada carga.
 *
 * El Excel saca una fila por carga, que es la unidad facturable. Pero los kilómetros y los
 * kilos son del VIAJE, no de cada carga: pegados en las tres filas de un combinado, la
 * columna que la oficina arrastra para sumar cuenta el mismo viaje tres veces.
 *
 * Sobre los datos reales de producción son 7 viajes multi-tramo con kilómetros cargados
 * -ids 30, 46, 54, 81, 83, 85 y 89- y la columna "Km" sumaba 42.902 contra 34.089 reales:
 * 8.813 km de más, un 25,8%.
 *
 * Los km los carga el chofer UNA vez al cerrar el viaje (`setKilometros`), y el consumo
 * mensual del dominio los suma una vez por viaje. Repetirlos por carga es duplicación, no
 * un dato por renglón.
 */

const idx = (n: string) => COLUMNAS_ANTES.indexOf(n);

const carga = (p: Partial<TripSegment> = {}): TripSegment =>
  ({
    sid: "a",
    origen: null,
    destino: null,
    remitente: "TIMBER",
    clientes: ["Jair"],
    cantidad: 6,
    unidad: "pallets",
    remito: null,
    cobro_tipo: null,
    cobro_a: null,
    ...p,
  }) as TripSegment;

const viaje = (p: Partial<Trip> = {}): Trip =>
  ({
    id: 30,
    template_id: 26,
    provider_name: "Combinados",
    origin: "Mdeo",
    remite: "Armco",
    destination: "Bella Unión",
    destinatario: "Galpón",
    driver_id: 1,
    truck_id: 1,
    cargo_type: "Varios",
    kilos_carga: 12000,
    field_values: {},
    status: "COMPLETADO",
    started_at: "2026-08-18 07:30:00",
    finished_at: "2026-08-18 19:10:00",
    notes: null,
    created_at: "2026-08-18 07:30:00",
    segments: [carga({ sid: "a" }), carga({ sid: "b" }), carga({ sid: "c" })],
    kilometros: 667,
    driver_name: "Carlos Méndez",
    truck_plate: "GTP 4382",
    ...p,
  }) as Trip;

describe("los km del viaje no se repiten por carga", () => {
  it("un combinado de tres cargas trae los km una sola vez", () => {
    const filas = filasDeViaje(viaje(), []);
    expect(filas).toHaveLength(3);
    expect(filas.map((f) => f[idx("Km")])).toEqual([667, "", ""]);
  });

  it("sumando la columna da los km del viaje, no el triple", () => {
    const filas = filasDeViaje(viaje(), []);
    const total = filas.reduce((s, f) => s + (typeof f[idx("Km")] === "number" ? (f[idx("Km")] as number) : 0), 0);
    expect(total).toBe(667);
  });

  it("los kilos de cabecera tampoco se repiten", () => {
    const filas = filasDeViaje(viaje(), []);
    expect(filas.map((f) => f[idx("Kilos")])).toEqual([12000, "", ""]);
  });

  it("un viaje de una sola carga sigue trayendo todo en su fila", () => {
    const filas = filasDeViaje(viaje({ segments: [carga()] }), []);
    expect(filas[0][idx("Km")]).toBe(667);
    expect(filas[0][idx("Kilos")]).toBe(12000);
  });

  it("un viaje sin cargas sigue trayendo todo: existió y tiene kilómetros", () => {
    const filas = filasDeViaje(viaje({ segments: [] }), []);
    expect(filas).toHaveLength(1);
    expect(filas[0][idx("Km")]).toBe(667);
  });

  it("lo que identifica la carga sí cambia fila a fila", () => {
    const filas = filasDeViaje(
      viaje({
        segments: [
          carga({ sid: "a", remitente: "TIMBER", cantidad: 6 }),
          carga({ sid: "b", remitente: "ONTIL", cantidad: 4 }),
        ],
      }),
      [],
    );
    expect(filas.map((f) => f[idx("Lugar de carga")])).toEqual(["TIMBER", "ONTIL"]);
    expect(filas.map((f) => f[idx("Cantidad")])).toEqual([6, 4]);
  });

  it("el chofer y el camión SÍ se repiten: no se suman, y ayudan a leer la fila suelta", () => {
    const filas = filasDeViaje(viaje(), []);
    const chofer = encabezado([]).indexOf("Chofer");
    expect(filas.map((f) => f[chofer])).toEqual(["Carlos Méndez", "Carlos Méndez", "Carlos Méndez"]);
  });

  it("y el id del viaje se repite: es lo que ata las tres filas", () => {
    const filas = filasDeViaje(viaje(), []);
    expect(filas.map((f) => f[idx("ID viaje")])).toEqual([30, 30, 30]);
  });

  it("un campo de plantilla que se totaliza tampoco se repite", () => {
    const tpl = {
      id: 26,
      fields: [
        { key: "pallets", label: "Cantidad de pallets", type: "numero", stage: "carga", required: false },
      ],
    } as unknown as TripTemplate;
    const t = viaje({ field_values: { pallets: "20" } });
    const cols = columnasDeCampos([t], [tpl]);
    const i = encabezado(cols).indexOf("Cantidad de pallets");
    expect(filasDeViaje(t, cols).map((f) => f[i])).toEqual([20, "", ""]);
  });

  it("pero un identificador de plantilla se repite: no se suma y sirve para cruzar", () => {
    const tpl = {
      id: 26,
      fields: [
        { key: "remito", label: "N° de remito", type: "texto", stage: "carga", required: false },
      ],
    } as unknown as TripTemplate;
    const t = viaje({ field_values: { remito: "113430" } });
    const cols = columnasDeCampos([t], [tpl]);
    const i = encabezado(cols).indexOf("N° de remito");
    expect(filasDeViaje(t, cols).map((f) => f[i])).toEqual(["113430", "113430", "113430"]);
  });
});
