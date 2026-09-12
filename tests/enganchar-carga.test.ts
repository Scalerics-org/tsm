import { describe, it, expect } from "vitest";
import { engancharEnViajes, type ViajeEnganchable } from "../api/lib/enganchar-carga";
import type { CobroRegla } from "@shared/domain";

/**
 * Las cargas que ninguna regla puede alcanzar.
 *
 * 15 cargas de producción no tienen `remitente_id`: las de "OTROS VIAJES", donde el chofer
 * escribe el lugar a mano, y las precargadas de Manassi. `resolveCobro` corta en seco sin id,
 * así que no se cobran por regla nunca, y no había pantalla para arreglarlo: están en viajes
 * cerrados y las rutas del chofer exigen viaje en curso.
 */

const carga = (remitente: string, remitente_id: number | null = null) =>
  ({
    sid: `s-${remitente}`,
    origen: null,
    destino: null,
    remitente,
    remitente_id,
    clientes: [],
    cliente_ids: [],
    cantidad: 10,
    unidad: "pallets",
    remito: null,
    cobro_tipo: null,
    cobro_a: null,
  }) as any;

const viaje = (id: number, segments: any[], extra: Partial<ViajeEnganchable> = {}): ViajeEnganchable => ({
  id,
  status: "COMPLETADO" as any,
  segments,
  ...extra,
});

const REGLAS: CobroRegla[] = [
  { id: 1, remitente_id: 2, destinatario_id: null, cobro_tipo: "proveedor", cobro_a: "Agencia" } as any,
];

describe("enganchar una carga suelta a la libreta", () => {
  it("le pone el id y el nombre de la libreta a la carga que coincide", () => {
    const r = engancharEnViajes([viaje(1, [carga("AGENCIA")])], REGLAS, {
      texto: "AGENCIA",
      libreta_id: 2,
      nombre: "Agencia",
    });
    expect(r).toHaveLength(1);
    expect(r[0].cargas).toBe(1);
    expect(r[0].segments[0].remitente_id).toBe(2);
    expect(r[0].segments[0].remitente).toBe("Agencia");
  });

  it("y con el id puesto, la regla que ya existía resuelve el cobro sola", () => {
    const r = engancharEnViajes([viaje(1, [carga("agencia ")])], REGLAS, {
      texto: "AGENCIA",
      libreta_id: 2,
      nombre: "Agencia",
    });
    expect(r[0].segments[0].cobro_a).toBe("Agencia");
    expect(r[0].segments[0].cobro_tipo).toBe("proveedor");
  });

  it("empareja como escribe el chofer: mayúsculas, tildes y espacios de más no cuentan", () => {
    const r = engancharEnViajes([viaje(1, [carga("  Molino  Cañuelas ")])], REGLAS, {
      texto: "MOLINO CANUELAS",
      libreta_id: 9,
      nombre: "MOLINO CAÑUELAS",
    });
    expect(r).toHaveLength(1);
  });

  it("no toca la carga que ya tiene lugar identificado", () => {
    expect(engancharEnViajes([viaje(1, [carga("AGENCIA", 7)])], REGLAS, { texto: "AGENCIA", libreta_id: 2, nombre: "Agencia" })).toEqual([]);
  });

  it("no toca un viaje ya facturado: eso ya salió en una factura", () => {
    const v = viaje(1, [carga("AGENCIA")], { factura_numero: "A-1" });
    expect(engancharEnViajes([v], REGLAS, { texto: "AGENCIA", libreta_id: 2, nombre: "Agencia" })).toEqual([]);
  });

  it("ni uno cancelado: no se cobra", () => {
    const v = viaje(1, [carga("AGENCIA")], { status: "CANCELADO" as any });
    expect(engancharEnViajes([v], REGLAS, { texto: "AGENCIA", libreta_id: 2, nombre: "Agencia" })).toEqual([]);
  });

  /**
   * El enganche toca SÓLO la carga que engancha. Pasar el viaje entero por `aplicarCobro` le
   * recalculaba el cobro a las hermanas contra las reglas de hoy: una que ya estaba resuelta
   * podía cambiar de pagador —o quedarse sin ninguno— sin que nadie lo hubiera pedido.
   */
  it("no le toca el cobro a las otras cargas del mismo viaje", () => {
    const hermana = { ...carga("TIMBER", 44), cobro_a: "Casarone", cobro_tipo: "cliente" };
    const r = engancharEnViajes([viaje(1, [carga("AGENCIA"), hermana])], REGLAS, {
      texto: "AGENCIA",
      libreta_id: 2,
      nombre: "Agencia",
    });
    expect(r[0].segments[1].cobro_a).toBe("Casarone");
    expect(r[0].cargas).toBe(1);
  });

  it("cuenta como destrabada sólo la que se enganchó y quedó con cobro", () => {
    const hermana = { ...carga("TIMBER", 44), cobro_a: "Casarone", cobro_tipo: "cliente" };
    const r = engancharEnViajes([viaje(1, [carga("AGENCIA"), hermana])], REGLAS, {
      texto: "AGENCIA",
      libreta_id: 2,
      nombre: "Agencia",
    });
    expect(r[0].con_cobro).toBe(1);
  });

  it("respeta el cobro que la oficina fijó a mano en la carga que engancha", () => {
    const aMano = { ...carga("AGENCIA"), cobro_a: "Otro", cobro_tipo: "cliente", cobro_manual: true };
    const r = engancharEnViajes([viaje(1, [aMano])], REGLAS, {
      texto: "AGENCIA",
      libreta_id: 2,
      nombre: "Agencia",
    });
    expect(r[0].segments[0].remitente_id).toBe(2);
    expect(r[0].segments[0].cobro_a).toBe("Otro");
  });

  it("devuelve sólo los viajes que cambian", () => {
    const r = engancharEnViajes(
      [viaje(1, [carga("ISUSA")]), viaje(2, [carga("OTRA COSA")]), viaje(3, [carga("isusa"), carga("ISUSA")])],
      [],
      { texto: "ISUSA", libreta_id: 5, nombre: "ISUSA" },
    );
    expect(r.map((x) => x.id)).toEqual([1, 3]);
    expect(r[1].cargas).toBe(2);
  });
});
