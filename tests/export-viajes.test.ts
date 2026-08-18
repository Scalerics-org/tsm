import { describe, it, expect } from "vitest";
import { CSV_HEADER, filasDeViaje } from "../api/lib/export-viajes";
import type { Trip, TripSegment } from "@shared/domain";

/**
 * El Excel de /reports/trips.csv es el entregable del negocio: con eso se factura.
 * Una fila por CARGA, no por viaje — juntarlas perdería el detalle por el que se cobra.
 */

const COL = Object.fromEntries(CSV_HEADER.map((h, i) => [h, i])) as Record<string, number>;

function viaje(p: Partial<Trip> = {}): Trip {
  return {
    id: 7,
    template_id: 1,
    provider_name: "Combinados",
    origin: "Mdeo",
    remite: "Armco",
    destination: "Bella Unión",
    destinatario: "Galpón",
    driver_id: 1,
    truck_id: 1,
    cargo_type: "Varios",
    weight_tons: null,
    field_values: {},
    status: "COMPLETADO",
    started_at: "2026-08-18 07:30:00",
    finished_at: "2026-08-18 19:10:00",
    notes: null,
    created_at: "2026-08-18 07:30:00",
    segments: [],
    kilometros: 520,
    edited_by: null,
    edited_at: null,
    driver_name: "Carlos Méndez",
    truck_plate: "STZ 4821",
    ...p,
  } as Trip;
}

function carga(p: Partial<TripSegment>): TripSegment {
  return {
    sid: "a",
    origen: null,
    origen_id: null,
    destino: null,
    destino_id: null,
    remitente: "TIMBER",
    remitente_id: 8,
    clientes: ["Jair"],
    cliente_ids: [1],
    cantidad: 6,
    unidad: "pallets",
    remito: null,
    cobro_tipo: null,
    cobro_a: null,
    cobro_manual: false,
    ...p,
  } as TripSegment;
}

describe("filasDeViaje", () => {
  it("un viaje sin cargas igual sale: existió y tiene kilómetros", () => {
    const filas = filasDeViaje(viaje(), "");
    expect(filas).toHaveLength(1);
    expect(filas[0][COL["Lugar de carga"]]).toBe("Armco");
    expect(filas[0][COL["Clientes de la carga"]]).toBe("Galpón");
    expect(filas[0][COL["Km"]]).toBe(520);
  });

  it("un combinado de tres cargas da tres filas, una por unidad facturable", () => {
    const t = viaje({
      segments: [
        carga({ sid: "a", remitente: "TIMBER", clientes: ["Jair"], cobro_a: "TIMBER", cobro_tipo: "cliente" }),
        carga({ sid: "b", remitente: "ONTIL", clientes: ["BMR"], cantidad: 4 }),
        carga({ sid: "c", remitente: "Armco", clientes: ["Varios Clientes"], cantidad: 12, cobro_a: "Armco", cobro_tipo: "cliente" }),
      ],
    });
    const filas = filasDeViaje(t, "");
    expect(filas).toHaveLength(3);
    expect(filas.map((f) => f[COL["Lugar de carga"]])).toEqual(["TIMBER", "ONTIL", "Armco"]);
    expect(filas.map((f) => f[COL["Se cobra a"]])).toEqual(["TIMBER", "", "Armco"]);
    // Las tres comparten el id del viaje: es el mismo viaje, tres renglones.
    expect(new Set(filas.map((f) => f[COL["ID viaje"]]))).toEqual(new Set([7]));
  });

  it("una carga sin regla de cobro deja la celda vacía, no inventa un cobro", () => {
    const t = viaje({ segments: [carga({ cobro_a: null, cobro_tipo: null })] });
    const [fila] = filasDeViaje(t, "");
    expect(fila[COL["Se cobra a"]]).toBe("");
    expect(fila[COL["Tipo"]]).toBe("");
  });

  it("el combinado genérico usa el tramo del renglón, no el del viaje", () => {
    const t = viaje({
      origin: "",
      destination: "",
      segments: [
        carga({ sid: "a", origen: "Salto", destino: "Paysandú", remitente: "ROIG" }),
        carga({ sid: "b", origen: "Rivera", destino: "Artigas", remitente: "ONTIL" }),
      ],
    });
    const filas = filasDeViaje(t, "");
    expect(filas.map((f) => [f[COL["Origen"]], f[COL["Destino"]]])).toEqual([
      ["Salto", "Paysandú"],
      ["Rivera", "Artigas"],
    ]);
  });

  it("y en los demás viajes cada carga hereda el tramo del viaje", () => {
    const t = viaje({ segments: [carga({ origen: null, destino: null })] });
    const [fila] = filasDeViaje(t, "");
    expect(fila[COL["Origen"]]).toBe("Mdeo");
    expect(fila[COL["Destino"]]).toBe("Bella Unión");
  });

  it("varios clientes de una misma carga van en una sola celda", () => {
    const t = viaje({ segments: [carga({ clientes: ["Jair", "Agronorte"] })] });
    expect(filasDeViaje(t, "")[0][COL["Clientes de la carga"]]).toBe("Jair / Agronorte");
  });

  it("cada fila tiene tantas celdas como columnas el encabezado", () => {
    const conCargas = filasDeViaje(viaje({ segments: [carga({})] }), "x");
    const sinCargas = filasDeViaje(viaje(), "x");
    for (const fila of [...conCargas, ...sinCargas]) {
      expect(fila).toHaveLength(CSV_HEADER.length);
    }
  });
});
