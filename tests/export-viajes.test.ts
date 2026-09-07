import { describe, it, expect } from "vitest";
import { columnasDeExport, encabezadoDeExport, filasDeViaje } from "../api/lib/export-viajes";
import type { Trip, TripSegment, TripTemplate } from "@shared/domain";

/**
 * El Excel de /reports/trips.csv es el entregable del negocio: con eso se factura.
 * Una fila por CARGA, no por viaje — juntarlas perdería el detalle por el que se cobra.
 */

/** El encabezado sin campos de plantilla: las columnas fijas del viaje y de la carga. */
const CABECERA = encabezadoDeExport([]);
const COL = Object.fromEntries(CABECERA.map((h, i) => [h, i])) as Record<string, number>;

/** Índice de una columna en un encabezado armado con campos de plantilla. */
const indice = (encabezado: string[], label: string) => encabezado.indexOf(label);

function plantilla(id: number, fields: TripTemplate["fields"]): TripTemplate {
  return { id, provider_id: 1, name: `Plantilla ${id}`, fields } as unknown as TripTemplate;
}

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
    const filas = filasDeViaje(viaje(), []);
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
    const filas = filasDeViaje(t, []);
    expect(filas).toHaveLength(3);
    expect(filas.map((f) => f[COL["Lugar de carga"]])).toEqual(["TIMBER", "ONTIL", "Armco"]);
    expect(filas.map((f) => f[COL["Se cobra a"]])).toEqual(["TIMBER", "", "Armco"]);
    // Las tres comparten el id del viaje: es el mismo viaje, tres renglones.
    expect(new Set(filas.map((f) => f[COL["ID viaje"]]))).toEqual(new Set([7]));
  });

  it("una carga sin regla de cobro deja la celda vacía, no inventa un cobro", () => {
    const t = viaje({ segments: [carga({ cobro_a: null, cobro_tipo: null })] });
    const [fila] = filasDeViaje(t, []);
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
    const filas = filasDeViaje(t, []);
    expect(filas.map((f) => [f[COL["Origen"]], f[COL["Destino"]]])).toEqual([
      ["Salto", "Paysandú"],
      ["Rivera", "Artigas"],
    ]);
  });

  it("y en los demás viajes cada carga hereda el tramo del viaje", () => {
    const t = viaje({ segments: [carga({ origen: null, destino: null })] });
    const [fila] = filasDeViaje(t, []);
    expect(fila[COL["Origen"]]).toBe("Mdeo");
    expect(fila[COL["Destino"]]).toBe("Bella Unión");
  });

  it("varios clientes de una misma carga van en una sola celda", () => {
    const t = viaje({ segments: [carga({ clientes: ["Jair", "Agronorte"] })] });
    expect(filasDeViaje(t, [])[0][COL["Clientes de la carga"]]).toBe("Jair / Agronorte");
  });

  it("cada fila tiene tantas celdas como columnas el encabezado", () => {
    const conCargas = filasDeViaje(viaje({ segments: [carga({})] }), []);
    const sinCargas = filasDeViaje(viaje(), []);
    for (const fila of [...conCargas, ...sinCargas]) {
      expect(fila).toHaveLength(CABECERA.length);
    }
  });

  it("y eso también vale con campos de plantilla puestos", () => {
    const columnas = [
      { key: "remito_carga", label: "Remito de carga", totaliza: false },
      { key: "toneladas", label: "Toneladas", totaliza: true },
    ];
    const encabezado = encabezadoDeExport(columnas);
    const filas = filasDeViaje(viaje({ segments: [carga({}), carga({ sid: "b" })] }), columnas);
    for (const fila of filas) expect(fila).toHaveLength(encabezado.length);
  });
});

/**
 * Los campos de plantilla como columnas de verdad.
 *
 * "NO HAY CÓMO MEJORAR LOS ARCHIVOS Q EXPORTÁS? ES DECIR EN UN FORMATO MÁS ORDENADO QUE ME
 * QUEDE PARA GUARDAR MÁS PROLIJO." — el cliente. Todos los campos se aplastaban en una sola
 * celda unidos con "·": el remito, la boleta y el número de orden juntos en el mismo texto.
 * Así no se puede filtrar por remito, ni ordenar por él, ni sumar las toneladas.
 */
describe("las columnas del export", () => {
  const CASARONE = plantilla(1, [
    { key: "remito_carga", label: "Remito de carga", type: "numero", required: true, stage: "carga" },
    { key: "toneladas", label: "Toneladas", type: "numero", required: true, stage: "carga", is_weight: true },
  ] as TripTemplate["fields"]);
  const CANUELAS = plantilla(3, [
    { key: "hoja_ruta", label: "N° hoja de ruta", type: "texto", required: false, stage: "carga" },
  ] as TripTemplate["fields"]);

  it("cada campo de la plantilla es una columna, con el nombre que le puso la oficina", () => {
    const columnas = columnasDeExport([viaje({ template_id: 1 })], [CASARONE, CANUELAS]);
    expect(encabezadoDeExport(columnas)).toContain("Remito de carga");
    expect(encabezadoDeExport(columnas)).toContain("Toneladas");
  });

  it("y su valor cae en la celda de esa columna", () => {
    const columnas = columnasDeExport(
      [viaje({ template_id: 1, field_values: { remito_carga: "113430", toneladas: "28.07" } })],
      [CASARONE],
    );
    const encabezado = encabezadoDeExport(columnas);
    const [fila] = filasDeViaje(
      viaje({ field_values: { remito_carga: "113430", toneladas: "28.07" } }),
      columnas,
    );
    expect(fila[indice(encabezado, "Remito de carga")]).toBe("113430");
    expect(fila[indice(encabezado, "Toneladas")]).toBe("28.07");
  });

  it("no aparecen las columnas de plantillas que no están en lo exportado", () => {
    // Filtrando por Casarone no tiene por qué venir la hoja de ruta de Cañuelas vacía.
    const columnas = columnasDeExport([viaje({ template_id: 1 })], [CASARONE, CANUELAS]);
    expect(encabezadoDeExport(columnas)).not.toContain("N° hoja de ruta");
  });

  it("un viaje sin campos no agrega columnas", () => {
    expect(columnasDeExport([viaje({ template_id: null, field_values: {} })], [CASARONE])).toEqual([]);
  });

  /**
   * El riesgo de pasar de "una celda con todo" a columnas: lo que no tiene columna se pierde,
   * y en silencio. La celda vieja mostraba TODAS las claves guardadas, incluidas las de un
   * campo que la oficina después sacó de la plantilla. Cambiar un Excel feo por uno incompleto
   * sería peor que no tocarlo.
   */
  it("un valor guardado cuyo campo ya no está en la plantilla igual sale", () => {
    const columnas = columnasDeExport(
      [viaje({ template_id: 1, field_values: { remito_carga: "113430", campo_viejo: "no se pierde" } })],
      [CASARONE],
    );
    const encabezado = encabezadoDeExport(columnas);
    expect(encabezado).toContain("campo_viejo");

    const [fila] = filasDeViaje(viaje({ field_values: { campo_viejo: "no se pierde" } }), columnas);
    expect(fila[indice(encabezado, "campo_viejo")]).toBe("no se pierde");
  });

  it("las columnas no se repiten aunque dos viajes usen la misma plantilla", () => {
    const columnas = columnasDeExport(
      [viaje({ id: 1, template_id: 1 }), viaje({ id: 2, template_id: 1 })],
      [CASARONE],
    );
    expect(columnas.map((c) => c.key)).toEqual(["remito_carga", "toneladas"]);
  });
});
