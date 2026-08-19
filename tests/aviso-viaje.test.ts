import { describe, it, expect } from "vitest";
import { avisoViajeCerrado } from "@shared/domain";
import type { TemplateField, Trip, TripSegment } from "@shared/domain";

/**
 * "Que al finalizar un viaje le mande un aviso con toda la info: qué viaje fue, quién lo
 * hizo, etc." Va a la pantalla bloqueada del celular, así que el orden importa.
 */

const viaje = (p: Partial<Trip> = {}) =>
  ({
    id: 42,
    provider_name: "Casarone",
    origin: "Artigas",
    destination: "Montevideo",
    destinatario: "Tifecom",
    driver_name: "Carlos Méndez",
    truck_plate: "STZ 4821",
    field_values: {},
    segments: [],
    notes: null,
    ...p,
  }) as Trip;

const campo = (key: string, label: string) => ({ key, label }) as TemplateField;
const carga = (p: Partial<TripSegment>) =>
  ({ remitente: "TIMBER", clientes: [], cantidad: null, unidad: null, ...p }) as TripSegment;

describe("avisoViajeCerrado", () => {
  it("el título dice de qué cliente es", () => {
    expect(avisoViajeCerrado(viaje(), []).title).toBe("Viaje cerrado · Casarone");
  });

  it("arranca por el tramo, que es lo que identifica el viaje", () => {
    const a = avisoViajeCerrado(viaje(), []);
    expect(a.body.split("\n")[0]).toBe("Artigas → Montevideo (Tifecom)");
  });

  it("sin destinatario no deja el paréntesis vacío", () => {
    const a = avisoViajeCerrado(viaje({ destinatario: null }), []);
    expect(a.body.split("\n")[0]).toBe("Artigas → Montevideo");
  });

  it("después el chofer y el camión", () => {
    expect(avisoViajeCerrado(viaje(), []).body).toContain("Carlos Méndez · STZ 4821");
  });

  it("muestra los campos del cliente, con su etiqueta", () => {
    const t = viaje({ field_values: { remito_carga: "113430", toneladas: "28.07" } });
    const cs = [campo("remito_carga", "Remito de carga"), campo("toneladas", "Toneladas")];
    expect(avisoViajeCerrado(t, cs).body).toContain("Remito de carga: 113430 · Toneladas: 28.07");
  });

  it("los campos vacíos no ocupan lugar", () => {
    // En una notificación el espacio se cuenta: una etiqueta con nada al lado es ruido.
    const t = viaje({ field_values: { remito_carga: "113430", toneladas: "" } });
    const cs = [campo("remito_carga", "Remito de carga"), campo("toneladas", "Toneladas")];
    const body = avisoViajeCerrado(t, cs).body;
    expect(body).toContain("Remito de carga: 113430");
    expect(body).not.toContain("Toneladas");
  });

  it("en un combinado van TODAS las cargas: cada una es facturable", () => {
    const t = viaje({
      provider_name: "Combinados",
      segments: [
        carga({ remitente: "TIMBER", cantidad: 6, unidad: "pallets", clientes: ["Jair"] }),
        carga({ remitente: "ONTIL", cantidad: 4, unidad: "pallets", clientes: ["BMR"] }),
      ],
    });
    const body = avisoViajeCerrado(t, []).body;
    expect(body).toContain("TIMBER 6 pallets → Jair");
    expect(body).toContain("ONTIL 4 pallets → BMR");
  });

  it("una carga sin cantidad no inventa un número", () => {
    const t = viaje({ segments: [carga({ remitente: "PUESTOS", cantidad: null })] });
    expect(avisoViajeCerrado(t, []).body).toContain("PUESTOS");
    expect(avisoViajeCerrado(t, []).body).not.toContain("null");
  });

  it("las observaciones del chofer van al final, entre comillas", () => {
    const t = viaje({ notes: "faltaron 2 pallets, avisé al depósito" });
    expect(avisoViajeCerrado(t, []).body).toContain('"faltaron 2 pallets, avisé al depósito"');
  });

  it("al tocarlo abre ese viaje en la oficina", () => {
    expect(avisoViajeCerrado(viaje(), []).url).toBe("/panel/viajes/42");
  });

  it("cada viaje tiene su etiqueta, así dos avisos juntos no se pisan", () => {
    expect(avisoViajeCerrado(viaje({ id: 7 }), []).tag).toBe("viaje-7");
    expect(avisoViajeCerrado(viaje({ id: 8 }), []).tag).not.toBe(
      avisoViajeCerrado(viaje({ id: 7 }), []).tag,
    );
  });

  it("nunca menciona a quién se factura: el aviso puede terminar en cualquier celular", () => {
    const t = viaje({
      segments: [carga({ remitente: "Armco", cobro_a: "SECRETO", cobro_tipo: "cliente" } as Partial<TripSegment>)],
    });
    const a = avisoViajeCerrado(t, []);
    expect(JSON.stringify(a)).not.toContain("SECRETO");
    expect(JSON.stringify(a)).not.toContain("cobro");
  });
});
