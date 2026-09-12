import { describe, it, expect } from "vitest";
import { app } from "../api/app";
import { signToken } from "../api/lib/crypto";
import { ROLES } from "@shared/domain";

/**
 * Las fotos de un chofer no son de todos.
 *
 * `GET /api/photos/<key>` servía cualquier objeto del bucket a cualquier token válido, sin
 * mirar de quién era. Con la sesión de un chofer se leían los remitos, las boletas de
 * combustible y los tacógrafos de los demás — y las claves son adivinables: la foto de carga
 * del viaje 22 es `trips/22/carga-…`.
 *
 * La oficina sigue viendo todo: mirar esas fotos es su trabajo.
 */

const SECRET = "test-secret-tsm";
const CLAVE = "trips/22/carga-1787261151018.jpg";

/** D1 falso: la consulta de dueño devuelve el chofer que se le indique. */
function fakeDB(dueno: number | null | undefined) {
  const stmt = {
    bind: () => stmt,
    first: async () => (dueno === undefined ? null : { driver_id: dueno }),
    all: async () => ({ results: [] }),
    run: async () => ({ meta: {} }),
  };
  return { prepare: () => stmt, batch: async () => [] } as unknown as D1Database;
}

/** R2 falso: si contesta, la foto salió. */
const fakeR2 = (entregadas: string[]) =>
  ({
    get: async (k: string) => {
      entregadas.push(k);
      return { body: null, writeHttpMetadata: () => {} };
    },
  }) as unknown as R2Bucket;

const token = (role: string, driverId: number | null) =>
  signToken({ id: driverId ?? 2, name: "X", role, driver_id: driverId, truck_id: 1, email: null } as any, SECRET);

async function pedirFoto(role: string, driverId: number | null, dueno: number | null | undefined) {
  const entregadas: string[] = [];
  // La fila del chofer/usuario para `requireAuth`, y el dueño de la foto, salen de la misma
  // base falsa: alcanza con que ambas consultas devuelvan algo coherente.
  const db = {
    prepare: (sql: string) => {
      const q = sql.toLowerCase();
      const stmt: any = {
        bind: () => stmt,
        first: async () => {
          if (q.includes("from users")) return { id: 2 };
          if (q.includes("from drivers")) return { status: "activo", default_truck_id: 1 };
          return dueno === undefined ? null : { driver_id: dueno };
        },
        all: async () => ({ results: [] }),
        run: async () => ({ meta: {} }),
      };
      return stmt;
    },
    batch: async () => [],
  } as unknown as D1Database;

  const res = await app.request(
    `/api/photos/${CLAVE}`,
    { headers: { authorization: `Bearer ${await token(role, driverId)}` } },
    { DB: db, FOTOS: fakeR2(entregadas), JWT_SECRET: SECRET } as any,
  );
  return { status: res.status, entregadas };
}

describe("quién puede ver una foto", () => {
  it("el chofer ve la suya", async () => {
    const { status, entregadas } = await pedirFoto(ROLES.CHOFER, 6, 6);
    expect(status).toBe(200);
    expect(entregadas).toEqual([CLAVE]);
  });

  it("el chofer NO ve la de otro, y ni siquiera se entera de que existe", async () => {
    const { status, entregadas } = await pedirFoto(ROLES.CHOFER, 6, 3);
    expect(status).toBe(404);
    // Lo importante: R2 nunca se tocó.
    expect(entregadas).toEqual([]);
  });

  it("una clave que no figura en ninguna tabla tampoco se sirve", async () => {
    const { status, entregadas } = await pedirFoto(ROLES.CHOFER, 6, undefined);
    expect(status).toBe(404);
    expect(entregadas).toEqual([]);
  });

  it("la oficina ve todas: mirar los remitos y las boletas es su trabajo", async () => {
    const { status, entregadas } = await pedirFoto(ROLES.ENCARGADO, null, 3);
    expect(status).toBe(200);
    expect(entregadas).toEqual([CLAVE]);
  });
});
