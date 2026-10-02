import { describe, it, expect } from "vitest";
import { estadoDeCobro } from "../shared/domain";
import {
  claveDeCliente,
  clientesDelViaje,
  estadoDeCobroDelViaje,
  estadoPorCliente,
  estrategiaDeFacturacion,
  pasaFiltroDeCobro,
  type CargaParaFacturar,
} from "../shared/facturacion-por-cliente";

const carga = (sid: string, cobro_a: string | null, o: Partial<CargaParaFacturar> = {}): CargaParaFacturar => ({
  sid,
  cobro_a,
  cobro_tipo: cobro_a ? "cliente" : null,
  ...o,
});
const marca = (cliente_clave: string, factura_numero: string | null, pago_at: string | null = null) => ({
  cliente_clave,
  factura_numero,
  pago_at,
});

describe("claveDeCliente", () => {
  it("usa el id de la libreta cuando lo hay", () => {
    expect(claveDeCliente({ cobro_a: "Jair", cobro_tipo: "cliente", cobro_id: 74 })).toBe("cliente:74");
  });
  it("sin id, el nombre normalizado: 'Galpón' y 'GALPON ' son el mismo", () => {
    expect(claveDeCliente({ cobro_a: "Galpón", cobro_tipo: "cliente" })).toBe(claveDeCliente({ cobro_a: " GALPON ", cobro_tipo: "cliente" }));
  });
  it("cliente y proveedor con el mismo nombre no son la misma unidad", () => {
    expect(claveDeCliente({ cobro_a: "Saman", cobro_tipo: "cliente" })).not.toBe(claveDeCliente({ cobro_a: "Saman", cobro_tipo: "proveedor" }));
  });
  it("sin a quién cobrarle no hay clave", () => {
    expect(claveDeCliente({ cobro_a: null, cobro_tipo: null })).toBeNull();
    expect(claveDeCliente({ cobro_a: "   ", cobro_tipo: "cliente" })).toBeNull();
  });
});

describe("clientesDelViaje", () => {
  it("tres cargas de un mismo cliente son una unidad; tres de tres clientes, tres", () => {
    expect(clientesDelViaje([carga("a", "Jair"), carga("b", "jair"), carga("c", "JAIR")]).clientes).toHaveLength(1);
    expect(clientesDelViaje([carga("a", "Jair"), carga("b", "BMR"), carga("c", "UAM")]).clientes).toHaveLength(3);
  });
  it("junta los sid de cada cliente y cuenta las cargas sin asignar", () => {
    const r = clientesDelViaje([carga("a", "Jair"), carga("b", null), carga("c", "Jair")]);
    expect(r.clientes).toEqual([{ clave: "cliente:jair", nombre: "Jair", tipo: "cliente", sids: ["a", "c"] }]);
    expect(r.sinAsignar).toBe(1);
  });
  it("sin cargas, nada", () => {
    expect(clientesDelViaje(undefined)).toEqual({ clientes: [], sinAsignar: 0 });
  });
});

describe("estrategiaDeFacturacion", () => {
  it("con número de factura en el viaje: por viaje, tenga o no cargas", () => {
    expect(estrategiaDeFacturacion({ factura_numero: "A-1", segments: [carga("a", "Jair")] })).toBe("por_viaje");
    expect(estrategiaDeFacturacion({ factura_numero: "A-1", segments: [] })).toBe("por_viaje");
  });
  it("sin factura y con cargas: por cliente", () => {
    expect(estrategiaDeFacturacion({ factura_numero: null, segments: [carga("a", "Jair")] })).toBe("por_cliente");
  });
  it("sin factura y sin cargas (los clásicos): por viaje", () => {
    expect(estrategiaDeFacturacion({ factura_numero: null, segments: [] })).toBe("por_viaje");
    expect(estrategiaDeFacturacion({ factura_numero: null })).toBe("por_viaje");
    expect(estrategiaDeFacturacion({ factura_numero: null, segments: null })).toBe("por_viaje");
  });
});

describe("estadoPorCliente", () => {
  const tres = [carga("a", "Jair"), carga("b", "BMR"), carga("c", "UAM")];

  it("nada marcado: sin facturar y sin pago que mostrar", () => {
    expect(estadoPorCliente(tres, [])).toMatchObject({ clientes: 3, facturados: 0, facturacion: "sin_facturar", pago: null });
  });
  it("uno de tres: facturado a medias", () => {
    const e = estadoPorCliente(tres, [marca("cliente:jair", "A-1")]);
    expect(e).toMatchObject({ facturados: 1, facturacion: "a_medias", pago: "sin_pagar" });
  });
  it("los tres: facturado, sin pagar", () => {
    const e = estadoPorCliente(tres, [marca("cliente:jair", "A-1"), marca("cliente:bmr", "A-2"), marca("cliente:uam", "A-3")]);
    expect(e).toMatchObject({ facturacion: "facturado", pago: "sin_pagar", pagados: 0 });
  });
  it("todos facturados y uno pago: pago a medias; todos pagos: pago", () => {
    const f = [marca("cliente:jair", "A-1", "2026-10-01"), marca("cliente:bmr", "A-2"), marca("cliente:uam", "A-3")];
    expect(estadoPorCliente(tres, f).pago).toBe("a_medias");
    const todos = f.map((m) => ({ ...m, pago_at: "2026-10-02" }));
    expect(estadoPorCliente(tres, todos)).toMatchObject({ facturacion: "facturado", pago: "pago", pagados: 3 });
  });
  it("pagados todos los facturados, pero falta facturar uno: pago a medias, no 'pago'", () => {
    const e = estadoPorCliente(tres, [marca("cliente:jair", "A-1", "2026-10-01")]);
    expect(e).toMatchObject({ facturacion: "a_medias", pago: "a_medias" });
  });
  it("una carga sin asignar impide el 'facturado' del todo, aunque los demás estén facturados", () => {
    const e = estadoPorCliente([carga("a", "Jair"), carga("b", null)], [marca("cliente:jair", "A-1")]);
    expect(e).toMatchObject({ facturados: 1, sinAsignar: 1, facturacion: "a_medias" });
  });
  it("una factura sacada (número null) cuenta como sin facturar", () => {
    expect(estadoPorCliente(tres, [marca("cliente:jair", null)]).facturados).toBe(0);
  });
  it("una marca de un cliente que ya no está entre las cargas no cuenta", () => {
    expect(estadoPorCliente([carga("a", "Jair")], [marca("cliente:fantasma", "A-9")])).toMatchObject({
      facturados: 0,
      facturacion: "sin_facturar",
    });
  });
  it("un viaje con un solo cliente: facturarlo es facturar el viaje", () => {
    const e = estadoPorCliente([carga("a", "Jair"), carga("b", "Jair")], [marca("cliente:jair", "A-1")]);
    expect(e).toMatchObject({ clientes: 1, facturacion: "facturado" });
  });
});

describe("estadoDeCobroDelViaje: el color de la fila", () => {
  const tres = [carga("a", "Jair"), carga("b", "BMR")];

  it("por cliente: blanco mientras algo esté sin facturar (el 'a medias' incluido)", () => {
    expect(estadoDeCobroDelViaje({ segments: tres }, [])).toBe("sin_facturar");
    expect(estadoDeCobroDelViaje({ segments: tres }, [marca("cliente:jair", "A-1", "2026-10-01")])).toBe("sin_facturar");
  });
  it("por cliente: rojo si todo está facturado y algo sin pagar", () => {
    const m = [marca("cliente:jair", "A-1", "2026-10-01"), marca("cliente:bmr", "A-2")];
    expect(estadoDeCobroDelViaje({ segments: tres }, m)).toBe("facturado");
  });
  it("por cliente: verde sólo si todo está pago", () => {
    const m = [marca("cliente:jair", "A-1", "2026-10-01"), marca("cliente:bmr", "A-2", "2026-10-02")];
    expect(estadoDeCobroDelViaje({ segments: tres }, m)).toBe("pago");
  });
});

/**
 * LO YA FACTURADO NO CAMBIA AL DESPLEGAR.
 *
 * Todo viaje que hoy tiene un número de factura, o que no tiene cargas, sigue con la estrategia por viaje y
 * da exactamente lo que daba `estadoDeCobro`. La tabla recorre todas las combinaciones, con y sin cargas y
 * con y sin marcas en la tabla nueva (que para estos viajes no puede cambiar nada).
 */
describe("lo facturado hasta hoy no cambia de estado ni de color", () => {
  const facturas = [null, "", "A-1234", "S/F", "SAMAN"];
  const pagos = [null, "2026-09-23 12:00:00"];
  const conCargas = [[], [carga("a", "Jair")], [carga("a", "Jair"), carga("b", "BMR")], [carga("a", null)]];
  const marcasSueltas = [[], [marca("cliente:jair", "A-9", "2026-10-01")]];

  for (const factura_numero of facturas) {
    for (const pago_at of pagos) {
      for (const segments of conCargas) {
        for (const marcas of marcasSueltas) {
          // Por cliente sólo si NO hay factura de viaje y SÍ hay cargas: el resto es "por viaje".
          const porCliente = !factura_numero && segments.length > 0;
          if (porCliente) continue;
          it(`factura=${JSON.stringify(factura_numero)} pago=${pago_at ? "sí" : "no"} cargas=${segments.length} marcas=${marcas.length}`, () => {
            const viaje = { factura_numero, pago_at, segments };
            expect(estrategiaDeFacturacion(viaje)).toBe("por_viaje");
            expect(estadoDeCobroDelViaje(viaje, marcas)).toBe(estadoDeCobro({ factura_numero, pago_at }));
          });
        }
      }
    }
  }

  it("un viaje con cargas facturado por viaje entero sigue verde o rojo según su pago, no 'a medias'", () => {
    const segs = [carga("a", "Jair"), carga("b", "BMR")];
    expect(estadoDeCobroDelViaje({ factura_numero: "A-1", pago_at: null, segments: segs })).toBe("facturado");
    expect(estadoDeCobroDelViaje({ factura_numero: "A-1", pago_at: "2026-09-23", segments: segs })).toBe("pago");
  });
});

describe("pasaFiltroDeCobro: los filtros de Viajes", () => {
  const v = (o: Record<string, unknown> = {}) => ({ status: "COMPLETADO", factura_numero: null as string | null, pago_at: null as string | null, segments: [] as CargaParaFacturar[], ...o });

  describe("por viaje: exactamente lo que hacía el SQL", () => {
    it("facturado = sí: tiene número; no: completado y sin número", () => {
      expect(pasaFiltroDeCobro(v({ factura_numero: "A-1" }), [], { facturado: "si" })).toBe(true);
      expect(pasaFiltroDeCobro(v(), [], { facturado: "si" })).toBe(false);
      expect(pasaFiltroDeCobro(v(), [], { facturado: "no" })).toBe(true);
      expect(pasaFiltroDeCobro(v({ factura_numero: "A-1" }), [], { facturado: "no" })).toBe(false);
      // Un viaje en curso o cancelado no está "sin facturar".
      expect(pasaFiltroDeCobro(v({ status: "EN_CURSO" }), [], { facturado: "no" })).toBe(false);
      expect(pasaFiltroDeCobro(v({ status: "CANCELADO" }), [], { facturado: "no" })).toBe(false);
    });
    it("pago = sí: tiene pago; no: facturado y sin pago", () => {
      expect(pasaFiltroDeCobro(v({ factura_numero: "A-1", pago_at: "2026-10-01" }), [], { pago: "si" })).toBe(true);
      expect(pasaFiltroDeCobro(v({ factura_numero: "A-1" }), [], { pago: "si" })).toBe(false);
      expect(pasaFiltroDeCobro(v({ factura_numero: "A-1" }), [], { pago: "no" })).toBe(true);
      expect(pasaFiltroDeCobro(v(), [], { pago: "no" })).toBe(false);
      expect(pasaFiltroDeCobro(v({ factura_numero: "A-1", pago_at: "2026-10-01" }), [], { pago: "no" })).toBe(false);
    });
    it("factura exacta, sin distinguir mayúsculas ni espacios", () => {
      expect(pasaFiltroDeCobro(v({ factura_numero: " Saman " }), [], { factura: "SAMAN" })).toBe(true);
      expect(pasaFiltroDeCobro(v({ factura_numero: "6029" }), [], { factura: "6030" })).toBe(false);
      expect(pasaFiltroDeCobro(v(), [], { factura: "6029" })).toBe(false);
    });
    it("sin filtros pasa todo", () => {
      expect(pasaFiltroDeCobro(v(), [], {})).toBe(true);
    });
    it("un viaje con cargas facturado por viaje entero se filtra como siempre", () => {
      const viaje = v({ factura_numero: "A-1", segments: [carga("a", "Jair"), carga("b", "BMR")] });
      expect(pasaFiltroDeCobro(viaje, [], { facturado: "si" })).toBe(true);
      expect(pasaFiltroDeCobro(viaje, [], { pago: "no" })).toBe(true);
    });
  });

  describe("por cliente: lo que se filtra es lo que se ve", () => {
    const segments = [carga("a", "Jair"), carga("b", "BMR")];
    const aMedias = [marca("cliente:jair", "A-1", "2026-10-01")];
    const todos = [marca("cliente:jair", "A-1", "2026-10-01"), marca("cliente:bmr", "B-2")];
    const pagos = todos.map((m) => ({ ...m, pago_at: "2026-10-02" }));

    it("el 'a medias' figura entre lo que falta facturar, y no entre lo facturado", () => {
      expect(pasaFiltroDeCobro(v({ segments }), aMedias, { facturado: "no" })).toBe(true);
      expect(pasaFiltroDeCobro(v({ segments }), aMedias, { facturado: "si" })).toBe(false);
    });
    it("todo facturado: sí; y sin pagar del todo es 'pago = no'", () => {
      expect(pasaFiltroDeCobro(v({ segments }), todos, { facturado: "si" })).toBe(true);
      expect(pasaFiltroDeCobro(v({ segments }), todos, { facturado: "no" })).toBe(false);
      expect(pasaFiltroDeCobro(v({ segments }), todos, { pago: "no" })).toBe(true);
      expect(pasaFiltroDeCobro(v({ segments }), todos, { pago: "si" })).toBe(false);
    });
    it("todo pago: 'pago = sí'", () => {
      expect(pasaFiltroDeCobro(v({ segments }), pagos, { pago: "si" })).toBe(true);
      expect(pasaFiltroDeCobro(v({ segments }), pagos, { pago: "no" })).toBe(false);
    });
    it("sin nada marcado es 'sin facturar' mientras esté completado", () => {
      expect(pasaFiltroDeCobro(v({ segments }), [], { facturado: "no" })).toBe(true);
      expect(pasaFiltroDeCobro(v({ segments, status: "EN_CURSO" }), [], { facturado: "no" })).toBe(false);
    });
    it("la factura se encuentra entre las de cada cliente", () => {
      expect(pasaFiltroDeCobro(v({ segments }), todos, { factura: "b-2" })).toBe(true);
      expect(pasaFiltroDeCobro(v({ segments }), todos, { factura: "Z-9" })).toBe(false);
    });
  });
});
