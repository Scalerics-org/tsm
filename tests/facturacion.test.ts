import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { resumenCliente, viajesAFacturar, type ViajeDelResumen } from "../api/lib/resumen-cliente";
import facturacion from "../api/routes/facturacion";
import { signToken } from "../api/lib/crypto";
import { ROLES, type TripTemplate } from "@shared/domain";

/**
 * Qué entra y qué no entra en el resumen para facturar.
 *
 * Es la regla que hace que el corte funcione: "al mes que viene, yo ya sé que todo lo que está
 * con el número de factura, esos viajes quedan afuera". Si un viaje facturado vuelve a
 * aparecer, lo puntea de nuevo y le factura dos veces lo mismo al cliente. Y si un viaje SIN
 * facturar se cae de la lista, ese flete no se cobra nunca: cada renglón es plata.
 */

function viaje(p: Partial<ViajeDelResumen> = {}): ViajeDelResumen {
  return {
    id: 1,
    template_id: 1,
    provider_name: "Casarone",
    origin: "Mdeo",
    remite: null,
    destination: "Rincón",
    destinatario: null,
    driver_id: 1,
    truck_id: 1,
    cargo_type: "Arroz",
    weight_tons: null,
    field_values: { remito: "1001", toneladas: "28" },
    status: "COMPLETADO",
    started_at: "2026-08-18 07:30:00",
    finished_at: "2026-08-18 19:10:00",
    notes: null,
    created_at: "2026-08-18 07:30:00",
    segments: [],
    kilometros: null,
    edited_by: null,
    edited_at: null,
    factura_numero: null,
    facturado_at: null,
    facturado_by: null,
    driver_name: "Carlos Méndez",
    truck_plate: "STZ 4821",
    ...p,
  } as ViajeDelResumen;
}

const PLANTILLA = {
  id: 1,
  provider_id: 1,
  provider_name: "Casarone",
  name: "Casarone",
  origin: "Mdeo",
  remite: null,
  cargo_type: "Arroz",
  dest_options: [],
  fields: [
    { key: "remito", label: "Nº de remito", type: "texto", required: true, stage: "carga" },
    { key: "toneladas", label: "Toneladas", type: "numero", required: true, stage: "carga", is_weight: true },
  ],
  arrival_photo_label: null,
  carga_photo_label: null,
  campos_ubicacion: null,
  multi_renglon: false,
} as unknown as TripTemplate;

const resumen = (trips: ViajeDelResumen[], opts = {}) => resumenCliente(trips, [PLANTILLA], opts);

describe("qué viajes entran en el resumen para facturar", () => {
  it("el que todavía no se facturó entra", () => {
    expect(viajesAFacturar([viaje({ id: 7 })]).map((t) => t.id)).toEqual([7]);
  });

  it("el que ya tiene número de factura no vuelve a aparecer", () => {
    const trips = [viaje({ id: 7 }), viaje({ id: 8, factura_numero: "A-1234" })];
    expect(viajesAFacturar(trips).map((t) => t.id)).toEqual([7]);
  });

  it("con incluirFacturados aparecen los dos: es como encuentra el que marcó por error", () => {
    const trips = [viaje({ id: 7 }), viaje({ id: 8, factura_numero: "A-1234" })];
    expect(viajesAFacturar(trips, { incluirFacturados: true }).map((t) => t.id)).toEqual([7, 8]);
  });

  // Esto ya era así antes de la factura y no se toca: mostrar un cancelado en el resumen de
  // cobro sería sumar plata que no se va a cobrar.
  it("el CANCELADO no entra nunca, ni pidiendo ver los facturados", () => {
    const trips = [viaje({ id: 7 }), viaje({ id: 9, status: "CANCELADO" })];
    expect(viajesAFacturar(trips).map((t) => t.id)).toEqual([7]);
    expect(viajesAFacturar(trips, { incluirFacturados: true }).map((t) => t.id)).toEqual([7]);
  });

  it("un cancelado que además quedó facturado tampoco entra", () => {
    const trips = [viaje({ id: 9, status: "CANCELADO", factura_numero: "A-1234" })];
    expect(viajesAFacturar(trips, { incluirFacturados: true })).toEqual([]);
  });

  // Un TEXT vacío en la base es lo mismo que no tener factura: si contara como facturado, el
  // viaje desaparecería del resumen sin que nadie le haya puesto un número.
  it("un número de factura vacío cuenta como sin facturar", () => {
    expect(viajesAFacturar([viaje({ id: 7, factura_numero: "" })]).map((t) => t.id)).toEqual([7]);
  });

  // Los viajes leídos por una ruta que no trae la marca (la del chofer) no tienen el campo.
  it("un viaje sin el campo de factura entra igual", () => {
    const sinMarca = viaje();
    delete (sinMarca as Partial<ViajeDelResumen>).factura_numero;
    expect(viajesAFacturar([sinMarca]).map((t) => t.id)).toEqual([1]);
  });
});

describe("el resumen no vuelve a cobrar lo ya facturado", () => {
  it("los totales dejan afuera las toneladas de los viajes facturados", () => {
    const r = resumen([
      viaje({ id: 7, field_values: { remito: "1", toneladas: "28" } }),
      viaje({ id: 8, field_values: { remito: "2", toneladas: "31" }, factura_numero: "A-1234" }),
    ]);
    expect(r.viajes).toBe(1);
    expect(r.totales.toneladas).toBe(28);
    expect(r.grupos[0].totales.toneladas).toBe(28);
  });

  it("avisa cuántos escondió, para poder ir a buscarlos", () => {
    const trips = [viaje({ id: 7 }), viaje({ id: 8, factura_numero: "A-1234" })];
    expect(resumen(trips).facturados).toBe(1);
    // Mostrándolos ya no hay nada escondido.
    expect(resumen(trips, { incluirFacturados: true }).facturados).toBe(0);
  });

  it("los cancelados no cuentan como escondidos: no se muestran ni pidiéndolos", () => {
    expect(resumen([viaje({ id: 7 }), viaje({ id: 9, status: "CANCELADO" })]).facturados).toBe(0);
  });

  it("mostrándolos, los totales incluyen todo y la fila dice con qué factura salió", () => {
    const r = resumen(
      [
        viaje({ id: 7, field_values: { remito: "1", toneladas: "28" } }),
        viaje({ id: 8, field_values: { remito: "2", toneladas: "31" }, factura_numero: "A-1234" }),
      ],
      { incluirFacturados: true },
    );
    expect(r.viajes).toBe(2);
    expect(r.totales.toneladas).toBe(59);
    expect(r.grupos[0].filas.map((f) => f.factura_numero)).toEqual([null, "A-1234"]);
  });

  it("agrupado por destino, el grupo tampoco suma lo facturado", () => {
    const r = resumen(
      [
        viaje({ id: 7, destination: "Rincón", field_values: { toneladas: "28" } }),
        viaje({ id: 8, destination: "Rincón", field_values: { toneladas: "31" }, factura_numero: "A-1" }),
        viaje({ id: 9, destination: "Treinta y Tres", field_values: { toneladas: "10" } }),
      ],
      { porDestino: true },
    );
    const rincon = r.grupos.find((g) => g.titulo === "Rincón");
    expect(rincon?.viajes).toBe(1);
    expect(rincon?.totales.toneladas).toBe(28);
    expect(r.totales.toneladas).toBe(38);
  });

  /**
   * El corte no es mensual: "Casarone hoy 19 cierra el mes, el mes que viene puede cerrar el
   * 26". Por eso lo que deja un viaje afuera es la MARCA y no la fecha — el mismo período
   * pedido dos veces devuelve sólo lo que quedó sin facturar.
   */
  it("después de facturar, el mismo período ya no trae lo facturado", () => {
    const trips = [viaje({ id: 7 }), viaje({ id: 8 }), viaje({ id: 9 })];
    expect(resumen(trips).viajes).toBe(3);

    const despues = trips.map((t) => (t.id === 9 ? t : { ...t, factura_numero: "A-1234" }));
    expect(resumen(despues).grupos[0].filas.map((f) => f.trip_id)).toEqual([9]);
  });
});

// ── La ruta ──

const SECRET = "test-secret-tsm";

/** D1 mínimo: guarda los UPDATE que se le mandan, que es lo que hay para mirar. */
function fakeDB(updates: { sql: string; binds: unknown[] }[]) {
  return {
    prepare(sql: string) {
      const stmt = {
        bind: (...binds: unknown[]) => {
          if (/update trips/i.test(sql)) updates.push({ sql, binds });
          return stmt;
        },
        // El middleware relee el camión del chofer antes de rebotarlo por rol.
        first: async () => (/from drivers/i.test(sql) ? { default_truck_id: 1 } : null),
        all: async () => ({ results: [] }),
        run: async () => ({ meta: { changes: 0 } }),
      };
      return stmt;
    },
    // Dos de los tres viajes se marcan; el otro ya tenía factura y el WHERE lo dejó pasar.
    batch: async (stmts: unknown[]) => (stmts as unknown[]).map(() => ({ meta: { changes: 2 } })),
  } as unknown as D1Database;
}

const appTest = new Hono().route("/api/facturacion", facturacion);

async function pedir(ruta: string, role: string, body?: unknown, updates: { sql: string; binds: unknown[] }[] = []) {
  const token = await signToken(
    { id: 3, name: "Rodrigo", role, driver_id: role === ROLES.CHOFER ? 1 : null, truck_id: 1, email: null } as any,
    SECRET,
  );
  const res = await appTest.request(
    ruta,
    {
      method: body ? "POST" : "GET",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    },
    { DB: fakeDB(updates), JWT_SECRET: SECRET } as any,
  );
  return { status: res.status, json: (await res.json()) as any };
}

describe("la ruta de facturación", () => {
  // El chofer nunca ve facturación: acá se le pondría el número de factura de un viaje suyo.
  it("el chofer no entra ni a mirar ni a marcar", async () => {
    expect((await pedir("/api/facturacion/resumen?provider=Casarone", ROLES.CHOFER)).status).toBe(403);
    expect(
      (await pedir("/api/facturacion/marcar", ROLES.CHOFER, { trip_ids: [1], factura_numero: "A-1" })).status,
    ).toBe(403);
  });

  it("sin número de factura no marca nada, y lo dice en criollo", async () => {
    const r = await pedir("/api/facturacion/marcar", ROLES.ENCARGADO, { trip_ids: [1], factura_numero: "  " });
    expect(r.status).toBe(400);
    expect(r.json.error).toBe("Escribí el número de la factura");
  });

  it("sin viajes punteados tampoco", async () => {
    const r = await pedir("/api/facturacion/marcar", ROLES.ENCARGADO, { trip_ids: [], factura_numero: "A-1" });
    expect(r.status).toBe(400);
    expect(r.json.error).toBe("Elegí al menos un viaje para facturar");
  });

  it("marca los punteados y avisa cuántos ya tenían factura", async () => {
    const r = await pedir("/api/facturacion/marcar", ROLES.ENCARGADO, {
      trip_ids: [1, 2, 3],
      factura_numero: " A-1234 ",
    });
    expect(r.status).toBe(200);
    expect(r.json.data).toEqual({ marcados: 2, sin_tocar: 1, factura_numero: "A-1234" });
  });

  /**
   * El UPDATE no pisa una factura ya puesta ni factura un cancelado. Sin esto, marcar dos
   * veces por error deja el mismo viaje cobrado en dos facturas distintas y sin rastro de
   * cuál era la buena.
   */
  it("no pisa lo ya facturado ni toca los cancelados", async () => {
    const updates: { sql: string; binds: unknown[] }[] = [];
    await pedir("/api/facturacion/marcar", ROLES.ENCARGADO, { trip_ids: [1, 2], factura_numero: "A-1" }, updates);
    expect(updates).toHaveLength(1);
    expect(updates[0].sql).toContain("factura_numero IS NULL");
    expect(updates[0].sql).toContain("status <> 'CANCELADO'");
  });

  /**
   * D1 no acepta más de 100 parámetros por consulta. Un corte de un mes de los cuatro
   * camiones pasa los cien viajes fácil, y si se mandaran todos juntos fallaría justo el día
   * que más viajes hay para facturar.
   */
  it("un corte grande se manda en tandas para no reventar el límite de D1", async () => {
    const updates: { sql: string; binds: unknown[] }[] = [];
    const muchos = Array.from({ length: 90 }, (_, i) => i + 1);
    await pedir("/api/facturacion/marcar", ROLES.ENCARGADO, { trip_ids: muchos, factura_numero: "A-1" }, updates);
    expect(updates).toHaveLength(3);
    for (const u of updates) expect(u.binds.length).toBeLessThanOrEqual(100);
  });

  it("desmarcar deja el viaje listo para volver al resumen", async () => {
    const updates: { sql: string; binds: unknown[] }[] = [];
    const r = await pedir("/api/facturacion/desmarcar", ROLES.ENCARGADO, { trip_ids: [1, 2] }, updates);
    expect(r.status).toBe(200);
    expect(updates[0].sql).toContain("factura_numero=NULL");
  });
});
