import { describe, it, expect } from "vitest";
import { planillaParaFacturar, ENCABEZADO_FACTURAR } from "../api/lib/export-viajes";

/**
 * La planilla con la que Rodrigo facturó la 6029 (19/9/2026): bajó el Excel completo y le borró
 * columnas a mano hasta dejar Fecha · Cliente · Clientes de la carga · Kilos · Nro Fac. ·
 * Remito de carga · Chofer · Camión · Estado · Observaciones, con el total de kilos abajo.
 * Ésta sale así de una.
 */
const viaje = (p: Record<string, unknown> = {}) =>
  ({
    id: 1,
    started_at: "2026-09-18 12:00:00",
    provider_name: "Casarone",
    kilos_carga: 30180,
    factura_numero: "6029",
    field_values: { remito_carga: "114868", toneladas: "30.180" },
    driver_name: "Raul La Luz Del Horno",
    truck_plate: "GTP 4384",
    status: "COMPLETADO",
    notes: "Se cargaron 600 bolsas por falta personal",
    segments: [{ remitente: "Casarone", clientes: ["Tifecom"] }],
    ...p,
  }) as any;
const campos = [{ key: "remito_carga", label: "Remito de carga", totaliza: false }];

describe("planillaParaFacturar", () => {
  it("sale con las columnas de la planilla de Rodrigo, en su orden", () => {
    const [enc] = planillaParaFacturar([viaje()], campos);
    expect(enc).toEqual([...ENCABEZADO_FACTURAR.slice(0, 5), "Remito de carga", ...ENCABEZADO_FACTURAR.slice(5)]);
    expect(enc).toEqual(["Fecha", "Cliente", "Clientes de la carga", "Kilos", "Nro Fac.", "Remito de carga", "Chofer", "Camión", "Estado", "Observaciones"]);
  });

  it("una fila por viaje con sus datos, y el total de kilos al final", () => {
    const filas = planillaParaFacturar([viaje(), viaje({ id: 2, kilos_carga: 31210 })], campos);
    expect(filas[1]).toEqual(["2026-09-18", "Casarone", "Tifecom", 30180, "6029", "114868", "Raul La Luz Del Horno", "GTP 4384", "COMPLETADO", "Se cargaron 600 bolsas por falta personal"]);
    expect(filas[filas.length - 1].slice(0, 4)).toEqual(["", "", "Total", 61390]);
  });

  it("los clientes de todas las cargas del viaje van juntos, sin repetir", () => {
    const filas = planillaParaFacturar(
      [viaje({ segments: [{ remitente: "A", clientes: ["Jair"] }, { remitente: "B", clientes: ["Agronorte", "Jair"] }] })],
      campos,
    );
    expect(filas[1][2]).toBe("Jair / Agronorte");
  });

  it("sin factura todavía, la celda queda vacía", () => {
    expect(planillaParaFacturar([viaje({ factura_numero: null })], campos)[1][4]).toBe("");
  });
});
