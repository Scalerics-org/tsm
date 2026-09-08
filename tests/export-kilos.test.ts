import { describe, it, expect } from "vitest";
import { columnasDeCampos, filasDeViaje, encabezado, COLUMNAS_ANTES } from "../api/lib/export-viajes";
import { csvCell } from "../api/lib/csv";
import type { Trip, TripTemplate } from "@shared/domain";

/**
 * El peso en el Excel: un solo hecho, una sola columna.
 *
 * La migración 0039 normalizó `trips.kilos` a kilos —"confirmado con el cliente"— y a
 * propósito NO tocó `field_values`, porque el texto crudo es la evidencia de lo que el chofer
 * escribió. Al pasar los campos de plantilla a columnas, el Excel empezó a publicar las dos:
 * la columna "Kilos" con el valor corregido, y una columna "Kilos de carga" con el texto
 * crudo convertido a número.
 *
 * Los datos reales de producción muestran por qué eso no puede salir así. El mismo peso,
 * escrito de tres formas, contra la columna `kilos` que ya está bien:
 *
 *     viaje 27:  kilos 29539   campo "29.539"   <- el punto es separador de MILES
 *     viaje 31:  kilos 29000   campo "29"       <- son toneladas
 *     viaje 40:  kilos 29690   campo "29690"    <- kilos redondos
 *
 * `Number("29.539")` da 29,539: el peso dividido por mil, en una columna que la oficina suma
 * para facturar. Y como `toneladas` y `ton_carga` llevan las dos la etiqueta "Kilos de carga",
 * salían además DOS columnas con el título idéntico, cada una llena para viajes distintos.
 */

const tpl = (p: Partial<TripTemplate> = {}): TripTemplate =>
  ({
    id: 1,
    provider_id: 1,
    name: "Carga Casarone",
    fields: [
      { key: "remito_carga", label: "Remito de carga", type: "numero", stage: "carga", required: false },
      { key: "toneladas", label: "Kilos de carga", type: "numero", stage: "carga", required: false, is_weight: true },
    ],
    ...p,
  }) as TripTemplate;

const viaje = (p: Partial<Trip> = {}): Trip =>
  ({
    id: 27,
    template_id: 1,
    provider_name: "Nayna",
    origin: "Artigas",
    remite: "Casarone",
    destination: "Montevideo",
    destinatario: "Tifecom",
    driver_id: 1,
    truck_id: 1,
    cargo_type: "Arroz",
    kilos_carga: 29539,
    field_values: { remito_carga: "0114649", toneladas: "29.539" },
    status: "COMPLETADO",
    started_at: "2026-08-18 07:30:00",
    finished_at: "2026-08-18 19:10:00",
    notes: null,
    created_at: "2026-08-18 07:30:00",
    segments: [],
    kilometros: 627,
    driver_name: "Carlos Méndez",
    truck_plate: "GTP 4382",
    ...p,
  }) as Trip;

describe("el peso de la plantilla no sale como columna aparte", () => {
  it("el campo marcado como peso no genera columna: ya está en «Kilos»", () => {
    const cols = columnasDeCampos([viaje()], [tpl()]);
    expect(cols.map((c) => c.key)).toEqual(["remito_carga"]);
  });

  it("no quedan dos columnas con el título «Kilos de carga»", () => {
    // `toneladas` (Casarone, Nayna) y `ton_carga` (las Internacional) llevan las dos esa
    // etiqueta: juntas en un export daban dos columnas indistinguibles.
    const otra = tpl({
      id: 8,
      name: "Internacional TYCSUR",
      fields: [
        { key: "ton_carga", label: "Kilos de carga", type: "numero", stage: "carga", required: false, is_weight: true },
      ],
    } as Partial<TripTemplate>);
    const v2 = viaje({ id: 78, template_id: 8, field_values: { ton_carga: "25100" }, kilos_carga: 25100 });
    const titulos = encabezado(columnasDeCampos([viaje(), v2], [tpl(), otra]));
    const repetidos = titulos.filter((t) => t === "Kilos de carga");
    expect(repetidos).toHaveLength(0);
  });

  it("«Kilos» sigue trayendo el valor corregido, no el texto que tipeó el chofer", () => {
    const cols = columnasDeCampos([viaje()], [tpl()]);
    const fila = filasDeViaje(viaje(), cols)[0];
    expect(fila[COLUMNAS_ANTES.indexOf("Kilos")]).toBe(29539);
  });

  it("el «29» que en realidad son 29 toneladas sale como 29.000 y no como 29", () => {
    const v = viaje({ id: 31, kilos_carga: 29000, field_values: { toneladas: "29" } });
    const cols = columnasDeCampos([v], [tpl()]);
    expect(filasDeViaje(v, cols)[0][COLUMNAS_ANTES.indexOf("Kilos")]).toBe(29000);
  });

  it("los demás campos numéricos siguen saliendo como columna", () => {
    const conPallets = tpl({
      fields: [
        { key: "pallets", label: "Cantidad de pallets", type: "numero", stage: "carga", required: false },
        { key: "toneladas", label: "Kilos de carga", type: "numero", stage: "carga", required: false, is_weight: true },
      ],
    } as Partial<TripTemplate>);
    const cols = columnasDeCampos([viaje({ field_values: { pallets: "20", toneladas: "29.539" } })], [conPallets]);
    expect(cols.map((c) => c.key)).toEqual(["pallets"]);
  });

  it("un campo de peso huérfano tampoco reaparece por la puerta de atrás", () => {
    // El caso real: a la plantilla del viaje le sacaron el campo, pero el valor quedó
    // guardado. La rama que rescata las keys huérfanas lo volvería a meter, con la key de
    // título. Se mira `is_weight` en TODAS las plantillas, no sólo en las exportadas.
    const sinPeso = tpl({
      id: 1,
      fields: [
        { key: "remito_carga", label: "Remito de carga", type: "numero", stage: "carga", required: false },
      ],
    } as Partial<TripTemplate>);
    const otraQueSiLoDeclara = tpl({ id: 2, name: "Carga Nayna" });
    const cols = columnasDeCampos([viaje()], [sinPeso, otraQueSiLoDeclara]);
    expect(cols.map((c) => c.key)).not.toContain("toneladas");
  });
});

describe("csvCell no puede convertir sus propios números en texto", () => {
  /**
   * El separador de columnas es `;`. La celda numérica se emite con coma decimal para que el
   * Excel en español la lea como número — y la regla de escapado, que también miraba la coma,
   * la entrecomillaba justo por eso. Los enteros salían limpios y todo decimal salía
   * entrecomillado: exactamente el valor que la mejora venía a arreglar.
   */
  it("un decimal sale con coma y SIN comillas", () => {
    expect(csvCell(29.539)).toBe("29,539");
  });

  it("un entero sale pelado", () => {
    expect(csvCell(29690)).toBe("29690");
  });

  it("el texto con punto y coma sí se entrecomilla: ahí el separador es de verdad", () => {
    expect(csvCell("Salto; Artigas")).toBe('"Salto; Artigas"');
  });

  it("el texto con una coma no necesita comillas", () => {
    expect(csvCell("Pallets, rotos")).toBe("Pallets, rotos");
  });

  it("las comillas de adentro se duplican", () => {
    expect(csvCell('El "grande"')).toBe('"El ""grande"""');
  });

  it("un salto de línea se entrecomilla", () => {
    expect(csvCell("uno\ndos")).toBe('"uno\ndos"');
  });

  it("una celda que arranca con = no se le entrega a Excel como fórmula", () => {
    // `Observaciones` es texto libre del chofer y el archivo lo abre la oficina del cliente.
    expect(csvCell("=1+1").startsWith("=")).toBe(false);
  });

  it("pero un número negativo sigue siendo un número", () => {
    expect(csvCell(-5)).toBe("-5");
  });

  it("vacío y null salen vacíos", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });
});
