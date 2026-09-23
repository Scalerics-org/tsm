import { describe, it, expect } from "vitest";
import { clienteDelViaje } from "@shared/domain";

/**
 * La columna "Cliente" de Viajes: a quién se le cobra, sólo para VERLO.
 *
 * "Que cada renglón tenga el filtro para elegir cliente… o poder agregar uno nuevo." — Rodrigo,
 * 23/9/2026. Gonzalo decidió empezar por mostrarla y filtrarla: nada de esto escribe en la base.
 *
 * Lo que tiene que ser cierto: que el cobro asignado gane sobre el nombre del viaje; que en los
 * combinados el nombre del viaje ("Combinados", "OTROS VIAJES") NO se pase por cliente; y que lo
 * que no tiene a quién cobrarle se distinga, porque es lo que la oficina tiene que mirar.
 */

const carga = (cobro_a: string | null) => ({ cobro_a });

describe("clienteDelViaje", () => {
  it("el cobro de las cargas manda", () => {
    expect(clienteDelViaje({ provider_name: "UAM", segments: [carga("Agencia")] }, false)).toEqual({
      nombre: "Agencia",
      mas: 0,
      deTipo: false,
      faltaAsignar: false,
    });
  });

  it("con más de un cliente distinto: el primero y un +N, sin contar dos veces al mismo", () => {
    const r = clienteDelViaje(
      { provider_name: "Combinados", segments: [carga("Armco"), carga("ARMCO "), carga("Agencia"), carga("Jair")] },
      true,
    );
    expect(r.nombre).toBe("Armco");
    expect(r.mas).toBe(2);
  });

  it("un clásico de un solo tramo se cobra al cliente del viaje, y se marca que es el tipo", () => {
    expect(clienteDelViaje({ provider_name: "Casarone", segments: [] }, false)).toEqual({
      nombre: "Casarone",
      mas: 0,
      deTipo: true,
      faltaAsignar: false,
    });
  });

  it("en un combinado sin cobro el nombre del viaje NO es el cliente: queda sin asignar", () => {
    const r = clienteDelViaje({ provider_name: "OTROS VIAJES", segments: [carga(null), carga("")] }, true);
    expect(r).toEqual({ nombre: null, mas: 0, deTipo: false, faltaAsignar: true });
  });

  it("un combinado que todavía no tiene cargas tampoco se cobra a 'Combinados'", () => {
    expect(clienteDelViaje({ provider_name: "Combinados", segments: [] }, true).nombre).toBeNull();
  });

  it("con algunas cargas resueltas y otras no: muestra el cliente y avisa que falta una", () => {
    const r = clienteDelViaje({ provider_name: "Combinados", segments: [carga("Armco"), carga(null)] }, true);
    expect(r.nombre).toBe("Armco");
    expect(r.faltaAsignar).toBe(true);
  });

  it("un clásico con cargas y ninguna con cobro está sin asignar, no cobrado al nombre del viaje", () => {
    expect(clienteDelViaje({ provider_name: "UAM", segments: [carga(null)] }, false).nombre).toBeNull();
  });
});
