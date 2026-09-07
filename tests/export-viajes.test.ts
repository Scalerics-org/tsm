import { describe, it, expect } from "vitest";
import { columnasDeCampos, encabezado, filasDeViaje } from "../api/lib/export-viajes";
import type { Trip, TripSegment, TripTemplate } from "@shared/domain";

/**
 * El Excel de /reports/trips.csv es el entregable del negocio: con eso se factura.
 * Una fila por CARGA, no por viaje — juntarlas perdería el detalle por el que se cobra.
 */

/** Sin campos de plantilla el encabezado es sólo el fijo: es la base de los índices. */
const CSV_HEADER = encabezado([]);
const COL = Object.fromEntries(CSV_HEADER.map((h, i) => [h, i])) as Record<string, number>;
const col = (campos: Parameters<typeof encabezado>[0], nombre: string) =>
  encabezado(campos).indexOf(nombre);

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
      expect(fila).toHaveLength(CSV_HEADER.length);
    }
  });
});

/**
 * Los campos de plantilla como columnas.
 *
 * "NO HAY CÓMO MEJORAR LOS ARCHIVOS Q EXPORTÁS? ES DECIR EN UN FORMATO MÁS ORDENADO." Iban
 * los tres en una sola celda ("remito: 113430 · boleta: 8842"), así que no se podía ordenar
 * ni filtrar por el remito, que es justo lo que la oficina busca cuando cruza una factura.
 */
function plantilla(p: Partial<TripTemplate> = {}): TripTemplate {
  return {
    id: 1,
    provider_id: 1,
    provider_name: "Casarone",
    name: "Casarone",
    origin: "Mdeo",
    dest_options: [],
    cargo_type: "Arroz",
    fields: [
      { key: "remito", label: "N° de remito", type: "texto", required: true, stage: "carga" },
      { key: "boleta", label: "Boleta", type: "texto", required: false, stage: "descarga" },
      { key: "kilos", label: "Kilos de carga", type: "numero", required: false, stage: "carga", is_weight: true },
    ],
    ...p,
  } as unknown as TripTemplate;
}

describe("columnasDeCampos (cada campo de plantilla, su columna)", () => {
  it("saca una columna por campo, con el título que ve la oficina", () => {
    const campos = columnasDeCampos([viaje({ template_id: 1 })], [plantilla()]);
    expect(campos.map((c) => c.label)).toEqual(["N° de remito", "Boleta", "Kilos de carga"]);
    expect(encabezado(campos)).toContain("N° de remito");
  });

  it("el valor del viaje cae en la columna de su campo", () => {
    const campos = columnasDeCampos(
      [viaje({ template_id: 1, field_values: { remito: "113430", boleta: "8842" } })],
      [plantilla()],
    );
    const [fila] = filasDeViaje(
      viaje({ template_id: 1, field_values: { remito: "113430", boleta: "8842" } }),
      campos,
    );
    expect(fila[col(campos, "N° de remito")]).toBe("113430");
    expect(fila[col(campos, "Boleta")]).toBe("8842");
  });

  it("un viaje sin ese campo deja la celda vacía, no corre las columnas", () => {
    const campos = columnasDeCampos([viaje({ template_id: 1 })], [plantilla()]);
    const [fila] = filasDeViaje(viaje({ template_id: 1, field_values: { remito: "113430" } }), campos);
    expect(fila[col(campos, "Boleta")]).toBe("");
    expect(fila).toHaveLength(encabezado(campos).length);
  });

  /**
   * Es la razón por la que las columnas salen de las plantillas USADAS y no de todas: con las
   * 26 que hay, el Excel de un cliente se llenaría de columnas vacías de los otros.
   */
  it("las plantillas que no se exportaron no aportan columnas", () => {
    const otra = plantilla({
      id: 9,
      fields: [{ key: "mic", label: "N° de MIC", type: "texto", required: true, stage: "carga" }],
    } as Partial<TripTemplate>);
    const campos = columnasDeCampos([viaje({ template_id: 1 })], [plantilla(), otra]);
    expect(campos.map((c) => c.key)).toEqual(["remito", "boleta", "kilos"]);
  });

  /**
   * Un campo que quedó guardado en un viaje viejo pero que la plantilla ya no tiene se veía
   * en la celda apelmazada. Pasar a columnas no puede ser la excusa para perderlo.
   */
  it("un campo que ya no está en la plantilla sale igual, con su key de título", () => {
    const campos = columnasDeCampos(
      [viaje({ template_id: 1, field_values: { remito: "1", orden_vieja: "17" } })],
      [plantilla()],
    );
    expect(campos.map((c) => c.label)).toEqual(["N° de remito", "Boleta", "Kilos de carga", "orden_vieja"]);
    const [fila] = filasDeViaje(viaje({ template_id: 1, field_values: { orden_vieja: "17" } }), campos);
    expect(fila[col(campos, "orden_vieja")]).toBe("17");
  });

  /**
   * Los `field_values` se guardan como texto. Los kilos llegaban al Excel como "28.07" y con
   * el Excel en español eso entra como TEXTO: la columna no se puede sumar ni ordenar. La
   * plantilla ya sabe cuál es cantidad y cuál identificador, así que se usa eso.
   */
  it("una cantidad sale como número; un remito sigue siendo texto", () => {
    const campos = columnasDeCampos([viaje({ template_id: 1 })], [plantilla()]);
    const [fila] = filasDeViaje(
      viaje({ template_id: 1, field_values: { kilos: "28.07", remito: "0012345" } }),
      campos,
    );
    expect(fila[col(campos, "Kilos de carga")]).toBe(28.07);
    // Como número, "0012345" llegaría al Excel convertido en 12345 y el remito no cerraría.
    expect(fila[col(campos, "N° de remito")]).toBe("0012345");
  });

  it("una cantidad escrita cualquier cosa no se convierte en un número inventado", () => {
    const campos = columnasDeCampos([viaje({ template_id: 1 })], [plantilla()]);
    const [fila] = filasDeViaje(viaje({ template_id: 1, field_values: { kilos: "28 y pico" } }), campos);
    expect(fila[col(campos, "Kilos de carga")]).toBe("28 y pico");
  });

  it("un viaje cargado sin plantilla no rompe el encabezado", () => {
    const campos = columnasDeCampos([viaje({ template_id: null })], [plantilla()]);
    expect(campos).toEqual([]);
  });
});
