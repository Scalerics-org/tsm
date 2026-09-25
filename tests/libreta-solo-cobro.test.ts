import { describe, it, expect } from "vitest";
import { app } from "../api/app";
import { signToken } from "../api/lib/crypto";
import { ROLES } from "@shared/domain";

/**
 * Clientes "sólo para cobrar".
 *
 * Rodrigo (25/9): "no es lo mismo los lugares de carga que los que se le cobra. Y que se les llene
 * la lista sería una locura." El cliente que la oficina da de alta desde el cuadro de cobro nace
 * marcado y el chofer no lo ve en su lista; la oficina sí. Lo que tiene que ser cierto: el filtro es
 * por rol y sólo en la ruta, la marca sólo la pone la oficina, se desmarca con el mismo campo, y
 * dar de alta un nombre que ya existe como cliente de cobranza reutiliza el existente en vez de
 * duplicarlo (por eso el filtro NO va en `listLibreta` por defecto).
 */

const SECRET = "test-secret-tsm";

type Consulta = { sql: string; binds: unknown[] };

const fila = (id: number, nombre: string, solo_cobro = 0) => ({
  id,
  tipo: "destinatario",
  nombre,
  provider_id: null,
  agrupador: 0,
  estado: "confirmado",
  usos: 0,
  created_by: 2,
  solo_cobro,
});

async function pedir(
  rol: string,
  metodo: string,
  ruta: string,
  cuerpo?: unknown,
  filas: ReturnType<typeof fila>[] = [],
) {
  const consultas: Consulta[] = [];
  const db = {
    prepare(sql: string) {
      const q = sql.replace(/\s+/g, " ").trim().toLowerCase();
      let binds: unknown[] = [];
      const stmt: any = {
        bind: (...b: unknown[]) => ((binds = b), stmt),
        first: async () => {
          consultas.push({ sql: q, binds });
          if (q.includes("from users")) return { id: 2, role: rol };
          if (q.includes("from drivers")) return { id: 1, status: "activo", default_truck_id: 1 };
          if (q.includes("from libreta where id")) return filas[0] ?? null;
          return null;
        },
        all: async () => {
          consultas.push({ sql: q, binds });
          return { results: q.includes("from libreta") ? filas : [] };
        },
        run: async () => {
          consultas.push({ sql: q, binds });
          return { meta: { last_row_id: 99 } };
        },
      };
      return stmt;
    },
    batch: async () => [],
  } as unknown as D1Database;
  const token = await signToken(
    {
      id: 2,
      name: "X",
      role: rol,
      driver_id: rol === ROLES.CHOFER ? 1 : null,
      truck_id: rol === ROLES.CHOFER ? 1 : null,
      email: null,
    } as any,
    SECRET,
  );
  const res = await app.request(
    `/api${ruta}`,
    {
      method: metodo,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      ...(cuerpo ? { body: JSON.stringify(cuerpo) } : {}),
    },
    { DB: db, JWT_SECRET: SECRET } as any,
    { waitUntil: () => {}, passThroughOnException: () => {} } as any,
  );
  return { status: res.status, json: (await res.json()) as any, consultas };
}

const lista = (c: Consulta[]) => c.find((x) => x.sql.startsWith("select id, tipo, nombre") && !x.sql.includes("where id ="));
const insert = (c: Consulta[]) => c.find((x) => x.sql.startsWith("insert into libreta"));

describe("la lista de la libreta", () => {
  it("al chofer no se le muestran los clientes marcados 'sólo para cobrar'", async () => {
    const r = await pedir(ROLES.CHOFER, "GET", "/libreta?tipo=destinatario");
    expect(lista(r.consultas)!.sql).toContain("solo_cobro = 0");
  });

  it("la oficina los ve todos", async () => {
    for (const rol of [ROLES.ENCARGADO, ROLES.ADMIN]) {
      const r = await pedir(rol, "GET", "/libreta?tipo=destinatario");
      expect(lista(r.consultas)!.sql).not.toContain("solo_cobro = 0");
    }
  });

  it("el filtro no toca a los lugares de carga: sólo es para el chofer y por la marca", async () => {
    const r = await pedir(ROLES.CHOFER, "GET", "/libreta?tipo=remitente");
    expect(lista(r.consultas)!.sql).toContain("tipo = ?");
  });
});

describe("el alta", () => {
  it("la oficina da de alta un cliente de cobranza y nace marcado", async () => {
    const r = await pedir(ROLES.ENCARGADO, "POST", "/libreta", { tipo: "destinatario", nombre: "SAMAN", solo_cobro: true });
    expect(r.status).toBe(201);
    const ins = insert(r.consultas)!;
    expect(ins.binds[ins.binds.length - 1]).toBe(1);
  });

  it("sin la marca, nace normal", async () => {
    const r = await pedir(ROLES.ENCARGADO, "POST", "/libreta", { tipo: "destinatario", nombre: "Otro" });
    const ins = insert(r.consultas)!;
    expect(ins.binds[ins.binds.length - 1]).toBe(0);
  });

  it("si la manda un chofer se ignora: la marca no la decide él", async () => {
    const r = await pedir(ROLES.CHOFER, "POST", "/libreta", { tipo: "destinatario", nombre: "Nuevo", solo_cobro: true });
    const ins = insert(r.consultas)!;
    expect(ins.binds[ins.binds.length - 1]).toBe(0);
  });

  it("un nombre que ya existe como cliente de cobranza se reutiliza: no se duplica", async () => {
    const existente = fila(98, "SAMAN", 1);
    const r = await pedir(ROLES.ENCARGADO, "POST", "/libreta", { tipo: "destinatario", nombre: "saman" }, [existente]);
    expect(insert(r.consultas)).toBeUndefined();
    expect(r.json.data.id).toBe(98);
    // La búsqueda de duplicados NO filtra por la marca: si lo hiciera, no lo vería y lo duplicaría.
    expect(lista(r.consultas)!.sql).not.toContain("solo_cobro = 0");
  });
});

describe("marcar y desmarcar", () => {
  it("el admin marca y desmarca con el mismo campo, sin tocar nada más", async () => {
    const marcar = await pedir(ROLES.ADMIN, "PUT", "/libreta/96", { solo_cobro: true }, [fila(96, "X")]);
    const upd = marcar.consultas.find((x) => x.sql.startsWith("update libreta set"))!;
    expect(upd.sql).toBe("update libreta set solo_cobro = ? where id = ?");
    expect(upd.binds).toEqual([1, 96]);
    const desmarcar = await pedir(ROLES.ADMIN, "PUT", "/libreta/96", { solo_cobro: false }, [fila(96, "X", 1)]);
    const upd2 = desmarcar.consultas.find((x) => x.sql.startsWith("update libreta set"))!;
    expect(upd2.binds).toEqual([0, 96]);
  });

  it("el permiso no cambió: sólo el admin edita la libreta", async () => {
    expect((await pedir(ROLES.ENCARGADO, "PUT", "/libreta/96", { solo_cobro: true })).status).toBe(403);
    expect((await pedir(ROLES.CHOFER, "PUT", "/libreta/96", { solo_cobro: true })).status).toBe(403);
  });
});
