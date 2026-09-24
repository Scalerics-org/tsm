import { describe, it, expect } from "vitest";
import { app } from "../api/app";
import { signToken } from "../api/lib/crypto";
import { ROLES } from "@shared/domain";

/**
 * Qué puede tocar operaciones (rol encargado).
 *
 * Rodrigo, 16/9/2026, tachando el menú: operaciones ve "todo Resumen, más Choferes y Camiones".
 * Plantillas, clientes, proveedores, lugares y usuarios quedan para admin. Esconder el menú no
 * alcanza: sin el freno en el servidor, las pantallas se abren igual escribiendo la dirección.
 */

const SECRET = "test-secret-tsm";

function fakeDB(role: string) {
  return {
    prepare(sql: string) {
      const q = sql.toLowerCase();
      const stmt = {
        bind: () => stmt,
        first: async () => {
          // El rol se relee de la base en cada pedido (ver `usuarioDeOficina`): tiene que
          // coincidir con el del token que firma `status`.
          if (q.includes("from users")) return { id: 2, role };
          return null;
        },
        all: async () => ({ results: [] }),
        run: async () => ({ meta: { last_row_id: 1, changes: 1 } }),
      };
      return stmt;
    },
    batch: async () => [],
  } as unknown as D1Database;
}

async function status(method: string, url: string, role: string, body: unknown = {}) {
  const token = await signToken({ id: 2, name: "Ops", role, driver_id: null, truck_id: null, email: null } as any, SECRET);
  const res = await app.request(
    url,
    { method, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: method === "GET" ? undefined : JSON.stringify(body) },
    { DB: fakeDB(role), JWT_SECRET: SECRET } as any,
  );
  return res.status;
}

describe("operaciones no toca los datos con los que se arma y se factura un viaje", () => {
  it.each([
    ["POST", "/api/templates"],
    ["PUT", "/api/templates/1"],
    ["DELETE", "/api/templates/1"],
    ["POST", "/api/providers"],
    ["PUT", "/api/providers/1"],
    ["PUT", "/api/libreta/1"],
    ["POST", "/api/libreta/1/merge"],
    ["GET", "/api/users"],
  ])("%s %s → 403", async (method, url) => {
    expect(await status(method, url, ROLES.ENCARGADO)).toBe(403);
  });
});

describe("operaciones sí administra choferes y camiones", () => {
  it.each([
    ["POST", "/api/drivers"],
    ["PUT", "/api/drivers/1"],
    ["POST", "/api/trucks"],
    ["PUT", "/api/trucks/1"],
  ])("%s %s no lo frena el rol", async (method, url) => {
    expect(await status(method, url, ROLES.ENCARGADO)).not.toBe(403);
  });

  it("pero no le cambia el PIN a un chofer que ya existe: sería entrar como él", async () => {
    const cuerpo = { name: "Carlos", document: "1234567", pin: "9999" };
    expect(await status("PUT", "/api/drivers/1", ROLES.ENCARGADO, cuerpo)).toBe(403);
    expect(await status("PUT", "/api/drivers/1", ROLES.ADMIN, cuerpo)).not.toBe(403);
    // Sin PIN, la corrección de datos pasa.
    expect(await status("PUT", "/api/drivers/1", ROLES.ENCARGADO, { name: "Carlos", document: "1234567" })).not.toBe(403);
  });

  it("borrar sigue siendo de admin", async () => {
    expect(await status("DELETE", "/api/drivers/1", ROLES.ENCARGADO)).toBe(403);
    expect(await status("DELETE", "/api/trucks/1", ROLES.ENCARGADO)).toBe(403);
  });
});
