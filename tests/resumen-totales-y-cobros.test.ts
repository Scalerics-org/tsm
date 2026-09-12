import { describe, it, expect } from "vitest";
import { cantidadesDeCargas, cobrosAjenos, type FilaResumen } from "../api/lib/resumen-cliente";

/**
 * Dos agujeros de la pantalla desde la que se factura.
 *
 * 1. Los clientes que no tienen campos propios de plantilla —Montevideo - BU, Otros Viajes, UAM,
 *    Agencia, Manassi— ponen la cantidad en cada carga, y el resumen no sumaba ninguna: mostraba
 *    "Viajes: 13" y nada más. Montevideo - BU son 61.758 kg y 145 pallets que había que sumar a
 *    mano de la pantalla para poder facturar.
 *
 * 2. El resumen se arma por el cliente del VIAJE (`trips.provider_name`), que es el nombre del
 *    viaje y no siempre quien paga: hoy 15 de las 23 cargas con cobro resuelto se le tendrían
 *    que cobrar a Agencia, Armco o Agronorte, y salen adentro del resumen de UAM y de
 *    Montevideo - BU.
 */

const carga = (cantidad: number | null, unidad: string | null, cobro_a: string | null = null) => ({
  remitente: "TIMBER",
  clientes: "",
  cantidad,
  unidad,
  remito: null,
  cobro_a,
});

const fila = (cargas: ReturnType<typeof carga>[]): FilaResumen => ({
  trip_id: 1,
  fecha: "2026-09-01",
  origen: "Mdeo",
  destino: "Bella Unión",
  destinatario: null,
  chofer: "Carlos",
  camion: "GTP 4325",
  estado: "COMPLETADO",
  valores: {},
  cargas,
  factura_numero: null,
  factura_quitada: null,
});

describe("lo que suman las cargas", () => {
  it("suma por unidad, sin mezclar", () => {
    const filas = [fila([carga(1000, "kilos"), carga(12, "pallets")]), fila([carga(500, "kilos")])];
    expect(cantidadesDeCargas(filas)).toEqual({ kilos: 1500, pallets: 12 });
  });

  it("la carga sin cantidad no rompe ni suma", () => {
    expect(cantidadesDeCargas([fila([carga(null, "kilos"), carga(300, "kilos")])])).toEqual({ kilos: 300 });
  });

  it("la carga sin unidad se cuenta aparte: no se sabe qué es", () => {
    expect(cantidadesDeCargas([fila([carga(7, null)])])).toEqual({ "sin unidad": 7 });
  });

  it("sin cargas no inventa totales", () => {
    expect(cantidadesDeCargas([fila([])])).toEqual({});
  });
});

describe("cargas que la regla manda cobrarle a otro", () => {
  it("las junta por quién paga, la que más cargas tiene primero", () => {
    const filas = [
      fila([carga(1, "pallets", "Agencia"), carga(1, "pallets", "Armco")]),
      fila([carga(1, "pallets", "Agencia")]),
    ];
    expect(cobrosAjenos(filas, "UAM")).toEqual([
      { cobro_a: "Agencia", cargas: 2 },
      { cobro_a: "Armco", cargas: 1 },
    ]);
  });

  it("lo que se le cobra al cliente del resumen no es un aviso", () => {
    expect(cobrosAjenos([fila([carga(1, "pallets", "Casarone")])], "Casarone")).toEqual([]);
  });

  it("una carga sin regla tampoco: eso ya lo cuenta la libreta", () => {
    expect(cobrosAjenos([fila([carga(1, "pallets", null)])], "UAM")).toEqual([]);
  });
});
