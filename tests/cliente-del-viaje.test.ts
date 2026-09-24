import { describe, it, expect } from "vitest";
import { clienteDelViaje } from "@shared/domain";

/**
 * La columna "Cliente" de Viajes: a quién se le cobra, sólo para VERLO.
 *
 * "Que cada renglón tenga el filtro para elegir cliente… o poder agregar uno nuevo." — Rodrigo,
 * 23/9/2026. Gonzalo decidió empezar por mostrarla y filtrarla: nada de esto escribe en la base.
 *
 * Lo que tiene que ser cierto: que la columna tenga sólo dos estados —los nombres del cobro, o
 * "sin asignar"—, que el nombre del tipo de viaje NO se pase por cliente (ya está en la columna
 * del recorrido), y que lo que no tiene a quién cobrarle se distinga.
 */

const carga = (cobro_a: string | null) => ({ cobro_a });

describe("clienteDelViaje", () => {
  it("el cobro de las cargas manda", () => {
    expect(clienteDelViaje({ segments: [carga("Agencia")] })).toEqual({
      nombres: ["Agencia"],
      mas: 0,
      todos: ["Agencia"],
      faltaAsignar: false,
    });
  });

  // Los dos casos reales de producción: Argenzio y Agencia, Armco y Agencia. Con un "+1" se veía
  // sólo "Agencia" y el cliente de verdad quedaba escondido.
  it("con dos clientes distintos se ven los dos, en el orden de las cargas y sin un +N", () => {
    const r = clienteDelViaje({ segments: [carga("Agencia"), carga("Argenzio")] });
    expect(r.nombres).toEqual(["Agencia", "Argenzio"]);
    expect(r.mas).toBe(0);
  });

  it("de tres para arriba: dos nombres y un +N, con todos en el detalle, sin contar dos veces al mismo", () => {
    const r = clienteDelViaje({ segments: [carga("Armco"), carga("ARMCO "), carga("Agencia"), carga("Jair")] });
    expect(r.nombres).toEqual(["Armco", "Agencia"]);
    expect(r.mas).toBe(1);
    expect(r.todos).toEqual(["Armco", "Agencia", "Jair"]);
  });

  // El tipo de viaje ya se ve en la columna del recorrido: repetirlo acá se leía como "se le cobra
  // a Casarone". Sin cobro asignado la columna dice que falta, sea cual sea el viaje.
  it("un viaje sin cobro dice 'sin asignar', aunque sea un clásico sin ninguna carga", () => {
    expect(clienteDelViaje({ segments: [] })).toEqual({ nombres: [], mas: 0, todos: [], faltaAsignar: true });
    expect(clienteDelViaje({})).toEqual({ nombres: [], mas: 0, todos: [], faltaAsignar: true });
  });

  it("con cargas y ninguna con cobro tampoco hay cliente: queda sin asignar", () => {
    const r = clienteDelViaje({ segments: [carga(null), carga("")] });
    expect(r).toEqual({ nombres: [], mas: 0, todos: [], faltaAsignar: true });
  });

  it("con algunas cargas resueltas y otras no: muestra el cliente y avisa que falta una", () => {
    const r = clienteDelViaje({ segments: [carga("Armco"), carga(null)] });
    expect(r.nombres).toEqual(["Armco"]);
    expect(r.faltaAsignar).toBe(true);
  });
});
