import { describe, it, expect } from "vitest";
import { viajesAFacturar } from "../api/lib/resumen-cliente";
import { marcarFacturados, completarCobrosPendientes } from "../api/repos/trips";

/**
 * Los tres huecos que quedaban en "un viaje facturado no se toca", encontrados en la auditoría
 * del 11/9. Ninguno había pasado todavía —no hay facturas emitidas—, pero el circuito se empieza
 * a usar ahora.
 *
 *   1. Se podía facturar un viaje EN CURSO, y las rutas del chofer (cargas, cierre) no miran la
 *      factura: lo que agregaba después quedaba en un viaje facturado y no se cobraba nunca.
 *   2. Dar de alta una regla de cobro reescribía las cargas pendientes de viajes ya facturados.
 *   3. El Excel del resumen por cliente bajaba facturados y cancelados (eso se prueba por la
 *      ruta; acá, el filtro que usa).
 */

const viaje = (id: number, p: Record<string, unknown> = {}) =>
  ({ id, status: "COMPLETADO", factura_numero: null, ...p }) as any;

describe("qué se puede facturar", () => {
  it("un viaje en curso NO: el chofer todavía lo está modificando", () => {
    const r = viajesAFacturar([viaje(1), viaje(2, { status: "EN_CURSO" })]);
    expect(r.map((t) => t.id)).toEqual([1]);
  });

  it("ni un cancelado, ni uno ya facturado", () => {
    const r = viajesAFacturar([viaje(1), viaje(2, { status: "CANCELADO" }), viaje(3, { factura_numero: "A-1" })]);
    expect(r.map((t) => t.id)).toEqual([1]);
  });

  it("pidiendo ver los facturados aparecen, pero un viaje en curso sigue afuera", () => {
    const r = viajesAFacturar([viaje(1), viaje(3, { factura_numero: "A-1" }), viaje(4, { status: "EN_CURSO" })], {
      incluirFacturados: true,
    });
    expect(r.map((t) => t.id)).toEqual([1, 3]);
  });
});

describe("marcar facturados", () => {
  it("sólo marca viajes COMPLETADOS, aunque la pantalla mande el id de uno en curso", async () => {
    const sqls: string[] = [];
    const db = {
      prepare: (sql: string) => ({ bind: () => ({ sql }) }),
      batch: async (stmts: { sql: string }[]) => {
        sqls.push(...stmts.map((s) => s.sql));
        return stmts.map(() => ({ meta: { changes: 1 } }));
      },
    } as unknown as D1Database;
    await marcarFacturados(db, [1, 2], "A-1", { userId: 1, when: "2026-09-11 12:00:00" });
    expect(sqls[0]).toContain("status = 'COMPLETADO'");
    expect(sqls[0]).toContain("factura_numero IS NULL");
  });
});

describe("una regla de cobro nueva", () => {
  it("destraba las cargas pendientes de los viajes sin facturar, y NO toca los facturados", async () => {
    const pendiente = JSON.stringify([
      { sid: "a", remitente: "Agencia", remitente_id: 2, clientes: ["Galpón"], cliente_ids: [20],
        cantidad: 10, unidad: "pallets", cobro_tipo: null, cobro_a: null },
    ]);
    const filas = [
      { id: 1, segments: pendiente, field_values: "{}", status: "COMPLETADO", started_at: "2026-09-01 08:00:00",
        provider_name: "Agencia", origin: "Mdeo", destination: "Bella Unión", factura_numero: null },
      { id: 2, segments: pendiente, field_values: "{}", status: "COMPLETADO", started_at: "2026-09-02 08:00:00",
        provider_name: "Agencia", origin: "Mdeo", destination: "Bella Unión", factura_numero: "A-1" },
    ];
    const escritos: unknown[][] = [];
    const db = {
      prepare(sql: string) {
        let binds: unknown[] = [];
        const stmt = {
          bind: (...b: unknown[]) => ((binds = b), stmt),
          all: async () => ({ results: /from trips/i.test(sql) ? filas : [] }),
          first: async () => null,
          run: async () => {
            if (/update trips/i.test(sql)) escritos.push(binds);
            return { meta: { changes: 1 } };
          },
        };
        return stmt;
      },
      batch: async (stmts: any[]) => Promise.all(stmts.map((s) => s.run?.())),
    } as unknown as D1Database;

    const reglas = [{ id: 1, remitente_id: 2, destinatario_id: null, cobro_tipo: "proveedor", cobro_a: "Agencia" }] as any;
    const destrabadas = await completarCobrosPendientes(db, reglas);

    expect(destrabadas).toBe(1);
    // Se escribió el viaje 1 y nunca el 2, que está en la factura A-1.
    expect(escritos.some((b) => b.includes(1))).toBe(true);
    expect(escritos.some((b) => b.includes(2))).toBe(false);
  });
});
