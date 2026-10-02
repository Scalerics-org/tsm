import { describe, it, expect } from "vitest";
import { resumenCliente, viajesAFacturar } from "../api/lib/resumen-cliente";
import { planillaParaFacturar, soloLoPendiente } from "../api/lib/export-viajes";
import { facturaDelViaje, tieneAlgoPorFacturar } from "../shared/facturacion-por-cliente";

/**
 * El resumen por cliente y la planilla de facturar con viajes que se facturan POR CLIENTE.
 * Los viajes de siempre (por viaje) se prueban en los tests que ya había: acá se fija que sigan igual.
 */

const carga = (sid: string, cobro_a: string | null, cantidad = 10) =>
  ({
    sid, origen: null, origen_id: null, destino: null, destino_id: null, remitente: "TIMBER", remitente_id: null,
    clientes: [], cliente_ids: [], cantidad, unidad: "pallets", remito: null,
    cobro_tipo: cobro_a ? "cliente" : null, cobro_a, cobro_manual: true,
  }) as any;

const marca = (cliente_clave: string, cliente_nombre: string, factura_numero: string | null, pago_at: string | null = null) => ({
  cliente_clave, cliente_nombre, factura_numero, pago_at,
});

function viaje(id: number, o: Record<string, unknown> = {}) {
  return {
    id, status: "COMPLETADO", started_at: "2026-09-20 07:30:00", finished_at: "2026-09-21 19:10:00",
    origin: "Mdeo", destination: "Bella Unión", destinatario: null, provider_name: "Combinados Varios",
    driver_name: "Carlos", truck_plate: "STZ 4821", field_values: {}, kilos_carga: null, notes: null,
    segments: [], factura_numero: null, factura_quitada: null, clientes_facturacion: [], ...o,
  } as any;
}

const tres = [carga("a", "Jair", 10), carga("b", "BMR", 5), carga("c", "UAM", 7)];
const JAIR = marca("cliente:jair", "Jair", "A-1");
const BMR = marca("cliente:bmr", "BMR", "B-2");
const UAM = marca("cliente:uam", "UAM", "C-3");

describe("viajesAFacturar con viajes por cliente", () => {
  it("un viaje a medias sigue en la lista hasta que salga a todos los clientes", () => {
    expect(viajesAFacturar([viaje(1, { segments: tres })])).toHaveLength(1);
    expect(viajesAFacturar([viaje(1, { segments: tres, clientes_facturacion: [JAIR] })])).toHaveLength(1);
    expect(viajesAFacturar([viaje(1, { segments: tres, clientes_facturacion: [JAIR, BMR] })])).toHaveLength(1);
  });
  it("con todos facturados sale de la lista, y con incluirFacturados vuelve", () => {
    const v = viaje(1, { segments: tres, clientes_facturacion: [JAIR, BMR, UAM] });
    expect(viajesAFacturar([v])).toHaveLength(0);
    expect(viajesAFacturar([v], { incluirFacturados: true })).toHaveLength(1);
  });
  it("una carga sin asignar impide que el viaje salga de la lista", () => {
    const v = viaje(1, { segments: [carga("a", "Jair"), carga("b", null)], clientes_facturacion: [JAIR] });
    expect(viajesAFacturar([v])).toHaveLength(1);
  });
  it("los viajes de siempre no cambian: con número sale, sin número queda; en curso y cancelados no entran", () => {
    expect(viajesAFacturar([viaje(1, { factura_numero: "A-1", segments: tres })])).toHaveLength(0);
    expect(viajesAFacturar([viaje(2)])).toHaveLength(1);
    expect(viajesAFacturar([viaje(3, { status: "EN_CURSO" }), viaje(4, { status: "CANCELADO" })])).toHaveLength(0);
  });
});

describe("resumenCliente con viajes por cliente", () => {
  it("cada fila trae los clientes con su factura; la de siempre trae null", () => {
    const r = resumenCliente(
      [viaje(1, { segments: tres, clientes_facturacion: [JAIR] }), viaje(2)],
      [],
      { incluirFacturados: true },
    );
    const [porCliente, deSiempre] = r.grupos[0].filas;
    expect(porCliente.clientes).toEqual([
      { clave: "cliente:jair", nombre: "Jair", factura_numero: "A-1", pago_at: null, factura_quitada: null },
      { clave: "cliente:bmr", nombre: "BMR", factura_numero: null, pago_at: null, factura_quitada: null },
      { clave: "cliente:uam", nombre: "UAM", factura_numero: null, pago_at: null, factura_quitada: null },
    ]);
    expect(deSiempre.clientes).toBeNull();
  });

  it("lo ya facturado a un cliente no suma a lo que se factura ahora", () => {
    const sinNada = resumenCliente([viaje(1, { segments: tres })], []);
    expect(sinNada.cantidades).toEqual({ pallets: 22 });
    const aMedias = resumenCliente([viaje(1, { segments: tres, clientes_facturacion: [JAIR] })], []);
    expect(aMedias.cantidades).toEqual({ pallets: 12 });
    expect(aMedias.grupos[0].filas[0].cargas.map((c) => c.facturada)).toEqual([true, false, false]);
  });

  it("cuenta como 'ya facturados' sólo los que salieron a todos", () => {
    const r = resumenCliente(
      [
        viaje(1, { segments: tres, clientes_facturacion: [JAIR, BMR, UAM] }),
        viaje(2, { segments: tres, clientes_facturacion: [JAIR] }),
        viaje(3, { factura_numero: "A-9" }),
      ],
      [],
    );
    expect(r.viajes).toBe(1);
    expect(r.facturados).toBe(2);
  });
});

describe("la planilla para facturar", () => {
  const nroFac = (v: any) => planillaParaFacturar([v], [])[1][4];

  it("por viaje, el número de siempre", () => {
    expect(nroFac(viaje(1, { factura_numero: "A-1" }))).toBe("A-1");
    expect(nroFac(viaje(2))).toBe("");
  });
  it("por cliente, el número de cada uno con su nombre", () => {
    expect(nroFac(viaje(1, { segments: tres, clientes_facturacion: [JAIR, BMR] }))).toBe("A-1 (Jair) · B-2 (BMR)");
  });
  it("por cliente con un solo cliente, sólo el número", () => {
    expect(nroFac(viaje(1, { segments: [carga("a", "Jair"), carga("b", "Jair")], clientes_facturacion: [JAIR] }))).toBe("A-1");
  });
  it("una factura sacada no figura", () => {
    expect(nroFac(viaje(1, { segments: tres, clientes_facturacion: [marca("cliente:jair", "Jair", null)] }))).toBe("");
  });
});

describe("facturaDelViaje y tieneAlgoPorFacturar", () => {
  it("coinciden con lo que muestran el resumen y la planilla", () => {
    const v = viaje(1, { segments: tres, clientes_facturacion: [JAIR] });
    expect(facturaDelViaje(v, v.clientes_facturacion)).toBe("A-1 (Jair)");
    expect(tieneAlgoPorFacturar(v, v.clientes_facturacion)).toBe(true);
    const todos = [JAIR, BMR, UAM];
    expect(tieneAlgoPorFacturar(v, todos)).toBe(false);
  });
});

describe("lo ya facturado no se vuelve a cobrar desde los totales ni desde el Excel", () => {
  const conPeso = (marcas: any[]) => viaje(1, { segments: tres, kilos_carga: 3000, field_values: { peso: "3000" }, clientes_facturacion: marcas });
  const plantilla = [{ id: 1, provider_name: "Combinados Varios", fields: [{ key: "peso", label: "Kilos", type: "numero", stage: "carga", required: false, is_weight: true }] }] as any;

  it("el peso de un viaje a medias no suma al total (no hay cómo repartirlo), y se cuenta aparte", () => {
    const sinNada = resumenCliente([conPeso([])], plantilla);
    expect(sinNada.totales.peso).toBe(3000);
    expect(sinNada.a_medias).toBe(0);
    const aMedias = resumenCliente([conPeso([JAIR])], plantilla);
    expect(aMedias.totales.peso ?? 0).toBe(0);
    expect(aMedias.a_medias).toBe(1);
  });

  it("la planilla de facturar no trae el peso ni los clientes ya facturados de un viaje a medias, ni lo suma al total", () => {
    const filas = planillaParaFacturar([conPeso([JAIR])], []);
    const [encabezado, fila, total] = filas;
    expect(fila[encabezado.indexOf("Kilos")]).toBe("");
    expect(total[encabezado.indexOf("Kilos")]).toBe(0);
  });

  it("soloLoPendiente saca las cargas de los clientes facturados y deja el viaje de siempre como está", () => {
    expect(soloLoPendiente(conPeso([JAIR])).segments.map((s: any) => s.sid)).toEqual(["b", "c"]);
    const deSiempre = viaje(2, { factura_numero: "A-1", segments: tres });
    expect(soloLoPendiente(deSiempre)).toBe(deSiempre);
    const sinNada = conPeso([]);
    expect(soloLoPendiente(sinNada)).toBe(sinNada);
  });

  it("el resumen avisa la factura que se sacó de un cliente: ya salió una vez", () => {
    const v = viaje(1, { segments: tres, clientes_facturacion: [{ ...marca("cliente:jair", "Jair", null), factura_quitada: "A-0" }] });
    const r = resumenCliente([v], []);
    expect(r.grupos[0].filas[0].clientes![0]).toMatchObject({ factura_numero: null, factura_quitada: "A-0" });
  });
});
