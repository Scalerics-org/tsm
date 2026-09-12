import { describe, it, expect } from "vitest";
import { columnasDeCampos, resumenParaElCliente } from "../api/lib/export-viajes";
import type { Trip, TripTemplate } from "@shared/domain";

/**
 * El resumen para mandarle al cliente.
 *
 * "Eso es un archivo que exporté los viajes y le eliminé un montón de celdas y lo dejé con
 * lo que realmente me interesa. Cuando exporte un resumen del molino me interesaría esos
 * datos nomás." — el cliente, con una planilla de cinco columnas: Fecha, Destino, Clientes
 * de la carga, N° hoja de ruta y Cantidad de pallets.
 *
 * Esa planilla era NUESTRO Excel con 5 de sus 20 columnas. Tres son las del viaje (cuándo,
 * adónde, para quién) y dos son los campos propios de la plantilla de Cañuelas. La regla que
 * sale de ahí sirve para cualquier cliente: lo básico, más lo que es propio de su viaje.
 */

const CANUELAS = {
  id: 3,
  provider_id: 3,
  name: "Viajes Molino Cañuelas",
  fields: [
    { key: "hoja_ruta", label: "N° hoja de ruta", type: "texto", stage: "carga", required: true },
    { key: "pallets", label: "Cantidad de pallets", type: "numero", stage: "carga", required: true },
  ],
} as unknown as TripTemplate;

const viaje = (p: Partial<Trip> = {}): Trip =>
  ({
    id: 41,
    template_id: 3,
    provider_name: "Molino Cañuelas",
    origin: "Montevideo",
    remite: "Cañuelas",
    destination: "Rivera",
    destinatario: "Jhon",
    driver_id: 1,
    truck_id: 1,
    cargo_type: "Pallets",
    kilos_carga: null,
    field_values: { hoja_ruta: "59667", pallets: "23" },
    status: "COMPLETADO",
    started_at: "2026-08-28 06:00:00",
    finished_at: "2026-08-28 14:00:00",
    notes: "Entrega sin novedad",
    created_at: "2026-08-28 06:00:00",
    segments: [],
    kilometros: 498,
    driver_name: "Carlos Méndez",
    truck_plate: "GTP 4325",
    ...p,
  }) as Trip;

const resumen = (trips: Trip[], templates: TripTemplate[] = [CANUELAS]) =>
  resumenParaElCliente(trips, columnasDeCampos(trips, templates));

/** Tres filas reales de la planilla que armó el cliente. */
const DE_SU_PLANILLA = [
  viaje({ id: 41, started_at: "2026-08-28 06:00:00", destination: "Rivera", destinatario: "Jhon",
    field_values: { hoja_ruta: "59667", pallets: "23" } }),
  viaje({ id: 39, started_at: "2026-08-26 06:00:00", destination: "Salto", destinatario: "Depósito, Roig, Polacof",
    field_values: { hoja_ruta: "59614 59623", pallets: "15" } }),
  viaje({ id: 33, started_at: "2026-08-19 06:00:00", destination: "Tacuarembó", destinatario: "Hexion",
    field_values: { hoja_ruta: "48532", pallets: "22" } }),
];

describe("el resumen para el cliente", () => {
  it("para Cañuelas sale igual a la planilla que armó el cliente a mano", () => {
    const [encabezado, ...filas] = resumen(DE_SU_PLANILLA);
    expect(encabezado).toEqual(["Fecha", "Destino", "Clientes de la carga", "N° hoja de ruta", "Cantidad de pallets"]);
    expect(filas).toEqual([
      ["2026-08-28", "Rivera", "Jhon", "59667", 23],
      ["2026-08-26", "Salto", "Depósito, Roig, Polacof", "59614 59623", 15],
      ["2026-08-19", "Tacuarembó", "Hexion", "48532", 22],
    ]);
  });

  it("NUNCA lleva nada de facturación ni de la operación interna, aunque esté cargado", () => {
    // Es un papel que se le manda al cliente. "Se cobra a" y "Tipo" son las reglas de cobro
    // de la oficina; chofer, camión y km son cómo trabaja la empresa por dentro.
    const combinado = viaje({
      template_id: 5,
      field_values: {},
      segments: [
        { sid: "a", origen: null, destino: null, remitente: "TIMBER", clientes: ["Jair"],
          cantidad: 12, unidad: "pallets", remito: "114586", cobro_a: "Armco", cobro_tipo: "cliente" },
      ] as unknown as Trip["segments"],
    });
    const [encabezado, ...filas] = resumen([combinado], []);
    for (const prohibida of ["Se cobra a", "Tipo", "Chofer", "Camión", "Km", "Estado", "Observaciones",
      "ID viaje", "Inicio", "Fin", "Cliente", "Origen", "Lugar de carga"]) {
      expect(encabezado).not.toContain(prohibida);
    }
    expect(filas.flat()).not.toContain("Armco");
    expect(filas.flat()).not.toContain("Carlos Méndez");
  });

  it("en un combinado sale una fila por carga, con la cantidad y el remito de cada una", () => {
    const combinado = viaje({
      template_id: 5,
      destination: "Bella Unión",
      field_values: {},
      segments: [
        { sid: "a", origen: null, destino: null, remitente: "TIMBER", clientes: ["Jair", "Agronorte"],
          cantidad: 12, unidad: "pallets", remito: "114586", cobro_a: null, cobro_tipo: null },
        { sid: "b", origen: null, destino: null, remitente: "ARMCO", clientes: ["Armco"],
          cantidad: 4, unidad: "bultos", remito: "114590", cobro_a: null, cobro_tipo: null },
      ] as unknown as Trip["segments"],
    });
    const [encabezado, ...filas] = resumen([combinado], []);
    /**
     * Una columna por unidad, y sólo las que tienen dato. Antes eran "Cantidad" y "Unidad": el
     * cliente arrastraba la columna Cantidad y sumaba pallets con kilos. "bultos" no es una de
     * las dos unidades de la app, así que cae en la columna de las que no tienen unidad — el
     * número sale igual, pero no suma con los pallets.
     */
    expect(encabezado).toEqual([
      "Fecha",
      "Destino",
      "Clientes de la carga",
      "Cantidad (pallets)",
      "Cantidad (sin unidad)",
      "N° remito",
    ]);
    expect(filas).toEqual([
      ["2026-08-28", "Bella Unión", "Jair / Agronorte", 12, "", "114586"],
      ["2026-08-28", "Bella Unión", "Armco", "", 4, "114590"],
    ]);
  });

  it("al cliente que se le cobra por peso le sale la columna Kilos, una sola vez", () => {
    const casarone = {
      id: 1, provider_id: 1, name: "Carga Casarone",
      fields: [
        { key: "remito_carga", label: "Remito de carga", type: "numero", stage: "carga", required: false },
        { key: "toneladas", label: "Kilos de carga", type: "numero", stage: "carga", required: false, is_weight: true },
      ],
    } as unknown as TripTemplate;
    const t = viaje({ template_id: 1, kilos_carga: 29539,
      field_values: { remito_carga: "0114649", toneladas: "29.539" } });
    const [encabezado, fila] = resumen([t], [casarone]);
    expect(encabezado).toEqual(["Fecha", "Destino", "Clientes de la carga", "Kilos", "Remito de carga"]);
    // El peso sale corregido desde `kilos_carga`, no el texto crudo "29.539" del chofer.
    expect(fila).toEqual(["2026-08-28", "Rivera", "Jhon", 29539, "0114649"]);
  });

  it("un viaje cancelado no va: no se entregó nada", () => {
    const filas = resumen([...DE_SU_PLANILLA, viaje({ id: 99, status: "CANCELADO" })]).slice(1);
    expect(filas).toHaveLength(3);
  });

  it("una columna que nadie llenó en todo el período no aparece", () => {
    const conOpcional = {
      ...CANUELAS,
      fields: [...CANUELAS.fields,
        { key: "obs_entrega", label: "Observación de entrega", type: "texto", stage: "llegada", required: false }],
    } as unknown as TripTemplate;
    const [encabezado] = resumen(DE_SU_PLANILLA, [conOpcional]);
    expect(encabezado).not.toContain("Observación de entrega");
  });
});
