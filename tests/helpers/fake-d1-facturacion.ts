/**
 * Una D1 de mentira con estado para probar las rutas de facturación: viajes y las marcas por cliente.
 *
 * NO interpreta SQL: reconoce cada sentencia que las rutas usan y la aplica en memoria con la misma
 * condición que escribe el SQL real. Prueba la lógica de las rutas (validación, reparto, motivos). El SQL de
 * verdad se probó contra la D1 local (`wrangler d1 execute --local`); si se cambia una sentencia, hay que
 * cambiarla también acá y volver a probarla ahí.
 */

export interface FilaViaje {
  id: number;
  status: string;
  factura_numero: string | null;
  facturado_at?: string | null;
  facturado_by?: number | null;
  factura_quitada?: string | null;
  factura_quitada_at?: string | null;
  pago_at: string | null;
  pago_by?: number | null;
  segments: string | null;
  [k: string]: unknown;
}

export interface FilaMarca {
  trip_id: number;
  cliente_clave: string;
  cliente_nombre: string;
  factura_numero: string | null;
  facturado_at: string | null;
  facturado_by: number | null;
  factura_quitada: string | null;
  factura_quitada_at: string | null;
  pago_at: string | null;
  pago_by: number | null;
}

export function viajeBase(o: Partial<FilaViaje> & { id: number }): FilaViaje {
  return {
    template_id: null,
    provider_name: "Combinados Varios",
    origin: "Mdeo",
    remite: null,
    destination: "Bella Unión",
    destinatario: null,
    driver_id: 1,
    truck_id: 1,
    cargo_type: "Varios",
    kilos: null,
    field_values: "{}",
    status: "COMPLETADO",
    started_at: "2026-09-20 07:30:00",
    finished_at: "2026-09-21 19:10:00",
    notes: null,
    created_at: "2026-09-20 07:30:00",
    segments: null,
    kilometros: null,
    edited_by: null,
    edited_at: null,
    factura_numero: null,
    facturado_at: null,
    facturado_by: null,
    factura_quitada: null,
    factura_quitada_at: null,
    pago_at: null,
    pago_by: null,
    driver_name: "Carlos Méndez",
    truck_plate: "STZ 4821",
    ...o,
  };
}

/** Una carga como la guarda `trips.segments`. */
export function cargaJson(sid: string, cobro_a: string | null, o: Record<string, unknown> = {}) {
  return {
    sid,
    origen: null,
    origen_id: null,
    destino: null,
    destino_id: null,
    remitente: "TIMBER",
    remitente_id: null,
    clientes: [],
    cliente_ids: [],
    cantidad: 10,
    unidad: "pallets",
    remito: null,
    cobro_tipo: cobro_a ? "cliente" : null,
    cobro_a,
    cobro_manual: true,
    ...o,
  };
}

/** `role` es el que la base le devuelve al usuario: `requireAuth` lo relee en cada pedido. */
export function fakeD1Facturacion(viajes: FilaViaje[], marcas: FilaMarca[] = [], role = "admin") {
  const escrituras: string[] = [];
  const marca = (trip: number, clave: string) => marcas.find((m) => m.trip_id === trip && m.cliente_clave === clave);

  function ejecutar(sql: string, b: unknown[]): number {
    const q = sql.replace(/\s+/g, " ").trim().toLowerCase();
    escrituras.push(q.slice(0, 60));

    if (q.startsWith("insert into viaje_cliente_facturacion")) {
      const [trip_id, clave, nombre, numero, when, by] = b as [number, string, string, string, string, number];
      const ya = marca(trip_id, clave);
      if (!ya) {
        marcas.push({
          trip_id, cliente_clave: clave, cliente_nombre: nombre, factura_numero: numero, facturado_at: when,
          facturado_by: by, factura_quitada: null, factura_quitada_at: null, pago_at: null, pago_by: null,
        });
        return 1;
      }
      if (ya.factura_numero !== null) return 0;
      Object.assign(ya, { cliente_nombre: nombre, factura_numero: numero, facturado_at: when, facturado_by: by, pago_at: null, pago_by: null });
      return 1;
    }
    if (q.startsWith("update viaje_cliente_facturacion set factura_quitada")) {
      const [cuando, trip_id, clave] = b as [string, number, string];
      const m = marca(trip_id, clave);
      if (!m || m.factura_numero === null) return 0;
      Object.assign(m, { factura_quitada: m.factura_numero, factura_quitada_at: cuando, factura_numero: null, facturado_at: null, facturado_by: null, pago_at: null, pago_by: null });
      return 1;
    }
    if (q.startsWith("update viaje_cliente_facturacion set pago_at = ?")) {
      const [when, by, trip_id, clave] = b as [string, number, number, string];
      const m = marca(trip_id, clave);
      if (!m || m.factura_numero === null || m.pago_at !== null) return 0;
      Object.assign(m, { pago_at: when, pago_by: by });
      return 1;
    }
    if (q.startsWith("update viaje_cliente_facturacion set pago_at = null")) {
      const [trip_id, clave] = b as [number, string];
      const m = marca(trip_id, clave);
      if (!m || m.pago_at === null) return 0;
      Object.assign(m, { pago_at: null, pago_by: null });
      return 1;
    }

    // Los de siempre, por viaje entero.
    const ids = (cuantos: number) => b.slice(b.length - cuantos) as number[];
    if (q.startsWith("update trips set factura_numero=?, facturado_at=?")) {
      const [numero, when, by, ...rest] = b as [string, string, number, ...number[]];
      let n = 0;
      for (const v of viajes.filter((v) => rest.includes(v.id))) {
        const conMarcas = marcas.some((m) => m.trip_id === v.id && m.factura_numero !== null);
        if (v.factura_numero === null && v.status === "COMPLETADO" && !conMarcas) {
          Object.assign(v, { factura_numero: numero, facturado_at: when, facturado_by: by });
          n++;
        }
      }
      return n;
    }
    if (q.startsWith("update trips set factura_quitada = factura_numero")) {
      let n = 0;
      for (const v of viajes.filter((v) => ids(b.length).includes(v.id) && v.factura_numero !== null)) {
        Object.assign(v, { factura_quitada: v.factura_numero, factura_numero: null, facturado_at: null, facturado_by: null, pago_at: null, pago_by: null });
        n++;
      }
      return n;
    }
    if (q.startsWith("update trips set pago_at=?, pago_by=?")) {
      const [when, by, ...rest] = b as [string, number, ...number[]];
      let n = 0;
      for (const v of viajes.filter((v) => rest.includes(v.id) && v.factura_numero !== null && v.pago_at === null)) {
        Object.assign(v, { pago_at: when, pago_by: by });
        n++;
      }
      return n;
    }
    if (q.startsWith("update trips set pago_at=null")) {
      let n = 0;
      for (const v of viajes.filter((v) => ids(b.length).includes(v.id) && v.pago_at !== null)) {
        Object.assign(v, { pago_at: null, pago_by: null });
        n++;
      }
      return n;
    }
    return 0;
  }

  const db = {
    prepare(sql: string) {
      const q = sql.replace(/\s+/g, " ").trim().toLowerCase();
      let binds: unknown[] = [];
      const stmt: any = {
        bind: (...a: unknown[]) => ((binds = a), stmt),
        first: async () => {
          if (q.includes("from users")) return { id: 2, role };
          if (q.includes("from trips") && q.includes("where t.id = ?")) return viajes.find((v) => v.id === binds[0]) ?? null;
          return null;
        },
        all: async () => {
          if (q.includes("from viaje_cliente_facturacion v")) {
            return { results: marcas.filter((m) => (binds as number[]).includes(m.trip_id)) };
          }
          if (q.includes("from trips") && q.includes("t.id in")) {
            return { results: viajes.filter((v) => (binds as number[]).includes(v.id)) };
          }
          return { results: [] };
        },
        run: async () => ({ meta: { changes: ejecutar(sql, binds) } }),
        __exec: () => ejecutar(sql, binds),
      };
      return stmt;
    },
    batch: async (stmts: any[]) => stmts.map((s) => ({ meta: { changes: s.__exec() } })),
  } as unknown as D1Database;

  return { db, viajes, marcas, escrituras };
}
