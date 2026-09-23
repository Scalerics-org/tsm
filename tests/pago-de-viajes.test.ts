import { describe, it, expect } from "vitest";
import { app } from "../api/app";
import { signToken } from "../api/lib/crypto";
import {
  desmarcarFacturados,
  desmarcarPagos,
  marcarPagos,
  referenciasDeFactura,
  sqlFiltros,
} from "../api/repos/trips";
import { viajesAFacturar } from "../api/lib/resumen-cliente";
import { ROLES, TRIP_STATUS, estadoDeCobro, recorridoVisible } from "@shared/domain";

/**
 * El tilde de pago de la pantalla Viajes: blanco, rojo y verde, como el Excel de Rodrigo.
 *
 * "Rojo: facturado y NO pago. Ahí es cuando facturo y le pongo el nro de factura. Verde: facturado
 * y pago. Cuando paguen le pongo sí en otro tick y queda en verde." — Rodrigo, 23/9/2026.
 *
 * La facturación decide qué se le cobra al cliente, así que lo que se prueba acá son las reglas
 * que no se pueden romper: marcar un pago sólo AGREGA información, no toca la factura y no saca
 * al viaje de ningún resumen; sin factura no hay nada que cobrar; y el lector no lo puede usar.
 */

const SECRET = "test-secret-tsm";
const signos = (sql: string) => (sql.match(/\?/g) ?? []).length;

type Escritura = { sql: string; binds: unknown[] };

/** Una base que anota lo que se le escribe y contesta cuántas filas cambió cada `batch`. */
function fakeDB(escrituras: Escritura[], cambiosPorTanda = 1, lecturas: Escritura[] = []) {
  return {
    prepare(sql: string) {
      const q = sql.replace(/\s+/g, " ").trim();
      let binds: unknown[] = [];
      const stmt = {
        bind: (...b: unknown[]) => {
          binds = b;
          return stmt;
        },
        first: async () => {
          const minusculas = q.toLowerCase();
          if (minusculas.includes("from users")) return { id: 2 };
          // El chofer se valida contra su ficha: tiene que existir y estar activo.
          if (minusculas.includes("from drivers")) return { id: 1, status: "activo", default_truck_id: 1 };
          return null;
        },
        all: async () => {
          lecturas.push({ sql: q, binds });
          return { results: [] };
        },
        run: async () => ({ meta: { changes: 1 } }),
        _sql: q,
        get _binds() {
          return binds;
        },
      };
      return stmt;
    },
    batch: async (stmts: { _sql: string; _binds: unknown[] }[]) => {
      for (const s of stmts) escrituras.push({ sql: s._sql, binds: s._binds });
      return stmts.map(() => ({ meta: { changes: cambiosPorTanda } }));
    },
  } as unknown as D1Database;
}

describe("los filtros de pago y de factura", () => {
  it("'pagos' son los que tienen fecha de pago", () => {
    const { sql, binds } = sqlFiltros({ pago: "si" });
    expect(sql).toContain("t.pago_at IS NOT NULL");
    expect(binds).toEqual([]);
  });

  it("'sin pagar' son los facturados sin pago: un viaje sin facturar no está sin pagar", () => {
    const { sql } = sqlFiltros({ pago: "no" });
    expect(sql).toContain("t.factura_numero IS NOT NULL AND t.pago_at IS NULL");
  });

  it("la factura o referencia se busca exacta, sin distinguir mayúsculas ni espacios", () => {
    const { sql, binds } = sqlFiltros({ factura: "SAMAN" });
    expect(sql).toContain("lower(trim(t.factura_numero)) = lower(trim(?))");
    expect(binds).toEqual(["SAMAN"]);
    expect(signos(sql)).toBe(binds.length);
  });

  it("se suman a los demás con los binds en orden", () => {
    const { sql, binds } = sqlFiltros({ provider: "UAM", pago: "no", factura: "6029", from: "2026-09-01" });
    expect(binds).toEqual(["UAM", "6029", "2026-09-01"]);
    expect(signos(sql)).toBe(binds.length);
  });

  it("sin pedirlos, la consulta no cambia", () => {
    const { sql } = sqlFiltros({ facturado: "si" });
    expect(sql).not.toContain("pago_at IS");
    expect(sql).not.toContain("lower(trim(t.factura_numero))");
  });
});

describe("referenciasDeFactura — las opciones del desplegable", () => {
  it("junta números y nombres sin repetir, con los números primero y en orden natural", () => {
    expect(
      referenciasDeFactura([
        { nombre: "6029" },
        { nombre: "SAMAN" },
        { nombre: "5566" },
        { nombre: "saman " },
        { nombre: "S/F" },
        { nombre: "10500" },
      ]),
    ).toEqual(["5566", "6029", "10500", "S/F", "SAMAN"]);
  });

  it("descarta vacíos y nulos", () => {
    expect(referenciasDeFactura([{ nombre: null }, { nombre: "  " }])).toEqual([]);
  });
});

describe("marcar y desmarcar el pago", () => {
  it("marcar sólo agrega: pone quién y cuándo, y no toca la factura", async () => {
    const escrituras: Escritura[] = [];
    const n = await marcarPagos(fakeDB(escrituras), [4, 5], { userId: 2, when: "2026-09-23 15:00:00" });
    expect(n).toBe(1);
    const { sql, binds } = escrituras[0];
    expect(sql).toMatch(/^UPDATE trips SET pago_at=\?, pago_by=\? WHERE/);
    // Ni una columna de la factura se escribe.
    expect(sql.split("WHERE")[0]).not.toContain("factura");
    expect(binds).toEqual(["2026-09-23 15:00:00", 2, 4, 5]);
  });

  it("sin factura no hay nada que cobrar, y el que ya figura pago no se pisa", async () => {
    const escrituras: Escritura[] = [];
    await marcarPagos(fakeDB(escrituras), [4], { userId: 2, when: "2026-09-23 15:00:00" });
    expect(escrituras[0].sql).toContain("factura_numero IS NOT NULL AND pago_at IS NULL");
  });

  it("desmarcar limpia quién y cuándo, y la factura queda como estaba", async () => {
    const escrituras: Escritura[] = [];
    await desmarcarPagos(fakeDB(escrituras), [4]);
    const { sql } = escrituras[0];
    expect(sql).toContain("SET pago_at=NULL, pago_by=NULL");
    expect(sql.split("WHERE")[0]).not.toContain("factura");
  });

  it("sacarle la factura a un viaje también le saca el pago: sin factura no hay nada cobrado", async () => {
    const escrituras: Escritura[] = [];
    await desmarcarFacturados(fakeDB(escrituras), [4]);
    const set = escrituras[0].sql.split("WHERE")[0];
    expect(set).toContain("factura_numero=NULL");
    expect(set).toContain("pago_at=NULL, pago_by=NULL");
  });
});

describe("las rutas de pago", () => {
  async function pedir(url: string, role: string, cambios = 1, body: unknown = { trip_ids: [4] }) {
    const escrituras: Escritura[] = [];
    const token = await signToken(
      { id: 2, name: "Quien sea", role, driver_id: role === ROLES.CHOFER ? 1 : null, truck_id: null, email: null } as any,
      SECRET,
    );
    const res = await app.request(
      url,
      {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify(body),
      },
      { DB: fakeDB(escrituras, cambios), JWT_SECRET: SECRET } as any,
      { waitUntil: () => {}, passThroughOnException: () => {} } as any,
    );
    return { status: res.status, body: (await res.json()) as any, escrituras };
  }

  it("encargado y admin pueden marcar y desmarcar", async () => {
    for (const rol of [ROLES.ENCARGADO, ROLES.ADMIN]) {
      const marca = await pedir("/api/facturacion/marcar-pago", rol);
      expect(marca.status).toBe(200);
      expect(marca.body.data).toEqual({ marcados: 1, sin_tocar: 0 });
      expect((await pedir("/api/facturacion/desmarcar-pago", rol)).status).toBe(200);
    }
  });

  it("marcar pago un viaje sin factura se rechaza y dice por qué", async () => {
    // La base no cambió ninguna fila: el UPDATE exige factura.
    const { status, body } = await pedir("/api/facturacion/marcar-pago", ROLES.ENCARGADO, 0);
    expect(status).toBe(409);
    expect(body.error).toContain("factura o referencia");
  });

  it("el lector no puede: ni marcar ni desmarcar", async () => {
    for (const url of ["/api/facturacion/marcar-pago", "/api/facturacion/desmarcar-pago"]) {
      expect((await pedir(url, ROLES.LECTOR)).status).toBe(403);
    }
  });

  it("el chofer tampoco", async () => {
    expect((await pedir("/api/facturacion/marcar-pago", ROLES.CHOFER)).status).toBe(403);
  });

  it("sin viajes elegidos es un error, no un '0 marcados' en silencio", async () => {
    expect((await pedir("/api/facturacion/marcar-pago", ROLES.ENCARGADO, 1, { trip_ids: [] })).status).toBe(400);
  });
});

describe("el Excel respeta los dos filtros nuevos", () => {
  it("trips.csv pide los viajes con el mismo pago y la misma factura que la lista", async () => {
    const lecturas: Escritura[] = [];
    const token = await signToken(
      { id: 2, name: "Quien sea", role: ROLES.ENCARGADO, driver_id: null, truck_id: null, email: null } as any,
      SECRET,
    );
    const res = await app.request(
      "/api/reports/trips.csv?pago=no&factura=SAMAN",
      { headers: { authorization: `Bearer ${token}` } },
      { DB: fakeDB([], 1, lecturas), JWT_SECRET: SECRET } as any,
      { waitUntil: () => {}, passThroughOnException: () => {} } as any,
    );
    expect(res.status).toBe(200);
    const deViajes = lecturas.find((l) => l.sql.includes("t.pago_at IS NULL"));
    expect(deViajes).toBeDefined();
    expect(deViajes!.sql).toContain("lower(trim(t.factura_numero)) = lower(trim(?))");
    expect(deViajes!.binds).toEqual(["SAMAN"]);
  });
});

describe("lo que NO cambia con el pago", () => {
  const viaje = (factura_numero: string | null, pago_at: string | null) =>
    ({ status: TRIP_STATUS.COMPLETADO, factura_numero, pago_at }) as any;

  // La pregunta de Rodrigo con "SAMAN": el viaje arreglado sin factura queda como facturado y
  // sale del resumen de lo que falta facturar. Es lo que él ya hace a mano, y con el pago igual.
  it("un viaje con referencia (SAMAN) o con factura sale del resumen, pague o no", () => {
    const trips = [viaje(null, null), viaje("SAMAN", null), viaje("6029", null), viaje("6029", "2026-09-23 10:00:00")];
    expect(viajesAFacturar(trips)).toHaveLength(1);
    expect(viajesAFacturar(trips, { incluirFacturados: true })).toHaveLength(4);
  });
});

describe("estadoDeCobro — el color de la fila", () => {
  it("blanco, rojo y verde", () => {
    expect(estadoDeCobro({ factura_numero: null, pago_at: null })).toBe("sin_facturar");
    expect(estadoDeCobro({ factura_numero: "6029", pago_at: null })).toBe("facturado");
    expect(estadoDeCobro({ factura_numero: "SAMAN", pago_at: "2026-09-23 10:00:00" })).toBe("pago");
  });

  it("un pago suelto, sin factura, no pinta nada de verde", () => {
    expect(estadoDeCobro({ factura_numero: null, pago_at: "2026-09-23 10:00:00" })).toBe("sin_facturar");
  });
});

describe("recorridoVisible — el recorrido completo en la fila", () => {
  const carga = (origen: string | null, destino: string | null) => ({ origen, destino });

  it("con cargas en tramos: Mdeo → Salto → BU", () => {
    expect(
      recorridoVisible({
        origin: "Mdeo",
        destination: "BU",
        segments: [carga("Mdeo", "Salto"), carga("Salto", "BU")],
      }),
    ).toBe("Mdeo → Salto → BU");
  });

  it("no repite una parada seguida, ni sin distinguir mayúsculas", () => {
    expect(
      recorridoVisible({
        origin: "Artigas",
        destination: "Montevideo",
        segments: [carga("Artigas", "Salto"), carga("SALTO", "Montevideo")],
      }),
    ).toBe("Artigas → Salto → Montevideo");
  });

  it("sin ubicación en las cargas es el de siempre", () => {
    expect(recorridoVisible({ origin: "Mdeo", destination: "Bella Unión", segments: [carga(null, null)] })).toBe(
      "Mdeo → Bella Unión",
    );
    expect(recorridoVisible({ origin: "Mdeo", destination: "Bella Unión" })).toBe("Mdeo → Bella Unión");
  });

  it("una ida y vuelta no suma el destino del viaje después de la última carga", () => {
    expect(
      recorridoVisible({
        origin: "Artigas",
        destination: "Minas",
        segments: [carga("Artigas", "Minas"), carga("Minas", "Artigas")],
      }),
    ).toBe("Artigas → Minas → Artigas");
  });

  it("un viaje que todavía no tiene recorrido lo dice", () => {
    expect(recorridoVisible({ origin: "", destination: "" })).toBe("origen a definir → destino a definir");
  });

  it("cargar y descargar en el mismo lugar no queda como una parada suelta", () => {
    expect(recorridoVisible({ origin: "Rivera", destination: "Rivera", segments: [carga("Rivera", "Rivera")] })).toBe(
      "Rivera → Rivera",
    );
    expect(recorridoVisible({ origin: "Mdeo", destination: "Mdeo" })).toBe("Mdeo → Mdeo");
  });
});
