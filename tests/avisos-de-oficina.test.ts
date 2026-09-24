import { describe, it, expect } from "vitest";
import { app } from "../api/app";
import { signToken } from "../api/lib/crypto";
import { ROLES } from "@shared/domain";

/**
 * Los avisos son de la oficina, y el chofer no se puede enganchar.
 *
 * `push_subscriptions.user_id` guardaba el id del token, y para un chofer ése es `drivers.id`,
 * que corre por su propio autoincremental. El reparto hace `JOIN users u ON u.id = ps.user_id`
 * y filtra por rol, así que un chofer cuyo id coincidiera con el de un usuario de oficina
 * —hoy mismo, el chofer 2 y el usuario 2 son personas distintas— quedaba recibiendo cada viaje
 * cerrado y cada surtida de toda la flota. Y darlo de baja no lo desenganchaba: los avisos se
 * mandan fuera de todo pedido suyo, así que no pasan por `requireAuth`.
 */

const SECRET = "test-secret-tsm";

// El rol ahora se relee de la base (ver `usuarioDeOficina`): la fila de "users" tiene que
// devolver el mismo rol con el que se firmó el token, si no la base lo pisa.
function fakeDB(role: string) {
  const stmt: any = {
    bind: () => stmt,
    first: async () => ({ id: 2, role, status: "activo", default_truck_id: 1 }),
    all: async () => ({ results: [] }),
    run: async () => ({ meta: {} }),
  };
  return { prepare: () => stmt, batch: async () => [] } as unknown as D1Database;
}

const token = (role: string, driverId: number | null) =>
  signToken({ id: 2, name: "X", role, driver_id: driverId, truck_id: 1, email: null } as any, SECRET);

const suscribir = async (role: string, driverId: number | null) => {
  const res = await app.request(
    "/api/push/suscribir",
    {
      method: "POST",
      headers: { authorization: `Bearer ${await token(role, driverId)}`, "content-type": "application/json" },
      body: JSON.stringify({ endpoint: "https://push.example/abc", keys: { p256dh: "k", auth: "a" } }),
    },
    { DB: fakeDB(role), JWT_SECRET: SECRET } as any,
  );
  return res.status;
};

describe("quién puede engancharse a los avisos", () => {
  it("la oficina sí", async () => {
    expect(await suscribir(ROLES.ENCARGADO, null)).toBe(201);
  });

  it("el chofer no: los avisos llevan la operación de toda la flota", async () => {
    expect(await suscribir(ROLES.CHOFER, 2)).toBe(403);
  });
});
