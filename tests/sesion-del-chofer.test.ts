import { describe, it, expect } from "vitest";
import { app } from "../api/app";
import { signToken } from "../api/lib/crypto";
import { ROLES } from "@shared/domain";

/**
 * Dar de baja a un chofer le corta el acceso YA, no dentro de una semana.
 *
 * El token dura 7 días y `requireAuth` sólo lo verificaba. Marcar a alguien Inactivo le sacaba
 * el camión —`currentTruckId` filtra por 'activo'— pero lo dejaba entrando a la app con el
 * token que ya tenía en el teléfono. Lo mismo el chofer borrado de la tabla.
 */

const SECRET = "test-secret-tsm";

/** D1 falso: la única consulta que importa acá es la fila del chofer. */
function fakeDB(chofer: { status: string; default_truck_id: number | null } | null) {
  const stmt = {
    bind: () => stmt,
    first: async () => chofer,
    all: async () => ({ results: [] }),
    run: async () => ({ meta: {} }),
  };
  return { prepare: () => stmt, batch: async () => [] } as unknown as D1Database;
}

const tokenChofer = () =>
  signToken({ id: 6, name: "Chofer", role: ROLES.CHOFER, driver_id: 6, truck_id: 10, email: null } as any, SECRET);

const tokenOficina = () =>
  signToken({ id: 2, name: "Rodrigo", role: ROLES.ADMIN, driver_id: null, truck_id: null, email: null } as any, SECRET);

const pedir = async (token: string, chofer: Parameters<typeof fakeDB>[0]) => {
  const res = await app.request(
    "/api/auth/me",
    { headers: { authorization: `Bearer ${token}` } },
    { DB: fakeDB(chofer), JWT_SECRET: SECRET } as any,
  );
  return { status: res.status, json: (await res.json()) as any };
};

describe("la sesión del chofer se revisa en cada pedido", () => {
  it("el chofer activo sigue entrando, y con el camión que la oficina tiene puesto hoy", async () => {
    const { status, json } = await pedir(await tokenChofer(), { status: "activo", default_truck_id: 3 });
    expect(status).toBe(200);
    // El token decía 10; manda la base.
    expect(json.data.truck_id).toBe(3);
  });

  it("al chofer dado de baja se le corta la sesión que ya tenía abierta", async () => {
    const { status, json } = await pedir(await tokenChofer(), { status: "inactivo", default_truck_id: 10 });
    expect(status).toBe(401);
    expect(json.error).toMatch(/baja/i);
  });

  it("al chofer borrado también: ya no tiene fila", async () => {
    const { status } = await pedir(await tokenChofer(), null);
    expect(status).toBe(401);
  });

});

/**
 * Lo mismo con la oficina: borrar al encargado que se fue no le cortaba nada hasta que venciera
 * su token, una semana leyendo y cambiando todo desde el teléfono.
 */
describe("la sesión de oficina también se revisa", () => {
  const pedirOficina = async (fila: { id: number } | null) => {
    const stmt = {
      bind: () => stmt,
      first: async () => fila,
      all: async () => ({ results: [] }),
      run: async () => ({ meta: {} }),
    };
    const res = await app.request(
      "/api/auth/me",
      { headers: { authorization: `Bearer ${await tokenOficina()}` } },
      { DB: { prepare: () => stmt, batch: async () => [] } as unknown as D1Database, JWT_SECRET: SECRET } as any,
    );
    return { status: res.status, json: (await res.json()) as any };
  };

  it("el usuario que sigue existiendo entra", async () => {
    const { status } = await pedirOficina({ id: 2 });
    expect(status).toBe(200);
  });

  it("al usuario borrado se le corta el token que ya tenía", async () => {
    const { status, json } = await pedirOficina(null);
    expect(status).toBe(401);
    expect(json.error).toMatch(/ya no existe/i);
  });

  it("el rol sigue saliendo del token: cambiarlo tiene efecto cuando vuelve a entrar", async () => {
    // A propósito: acá se resuelve la baja, no el cambio de rol. Mezclar las dos fuentes haría
    // que un permiso dependa del token y de la base a la vez.
    const { status, json } = await pedirOficina({ id: 2 });
    expect(status).toBe(200);
    expect(json.data.role).toBe(ROLES.ADMIN);
  });
});
