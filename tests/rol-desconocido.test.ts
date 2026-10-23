import { describe, expect, it } from "vitest";
import { app } from "../api/app";
import { signToken } from "../api/lib/crypto";
import { ROLES, esRolConocido } from "@shared/domain";

/**
 * Un rol que el servidor no conoce se rechaza por defecto.
 *
 * Varias rutas no llevan `requireRole` (crear un viaje, cancelarlo, borrar una foto): se apoyan en la diferencia
 * chofer/oficina, y un rol que no es chofer caía del lado de la oficina, que escribe y borra. Es el agujero que hay que
 * cerrar antes de sumar un rol nuevo. Se frena en `requireAuth`, por donde pasan todas las rutas.
 */

describe("esRolConocido", () => {
  it("reconoce los cuatro roles de hoy", () => {
    for (const rol of Object.values(ROLES)) expect(esRolConocido(rol), rol).toBe(true);
    expect(Object.values(ROLES).sort()).toEqual(["admin", "chofer", "encargado", "lector"]);
  });

  it("rechaza cualquier otra cosa: roles inventados, vacío, mayúsculas, no-textos", () => {
    for (const raro of ["mecanico", "superadmin", "", "ADMIN", "Chofer", " admin", null, undefined, 1, {}, ["admin"]]) {
      expect(esRolConocido(raro), String(raro)).toBe(false);
    }
  });
});

const SECRET = "test-secret-tsm";

// Como en permisos-lector: el rol se relee de la base en cada pedido, así que el fake devuelve el rol con el que se firmó.
function fakeDB(role: string) {
  return {
    prepare(sql: string) {
      const q = sql.toLowerCase();
      const stmt = {
        bind: () => stmt,
        first: async () => {
          if (q.includes("from users")) return { id: 2, role };
          if (q.includes("from drivers")) return { id: 6, status: "activo", default_truck_id: 10 };
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

async function pedir(method: string, url: string, role: string, body: unknown = {}) {
  const token = await signToken({ id: 2, name: "Alguien", role, driver_id: null, truck_id: null, email: null } as any, SECRET);
  const res = await app.request(
    url,
    {
      method,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: method === "GET" ? undefined : JSON.stringify(body),
    },
    { DB: fakeDB(role), JWT_SECRET: SECRET } as any,
  );
  return { status: res.status, body: (await res.json().catch(() => null)) as any };
}

describe("un rol inventado no pasa por ninguna ruta", () => {
  // Las tres que se apoyaban en la diferencia chofer/oficina, más una de lectura y una de oficina.
  it.each([
    ["POST", "/api/trips"],
    ["POST", "/api/trips/1/cancel"],
    ["DELETE", "/api/photos/1"],
    ["POST", "/api/trips/1/finish"],
    ["POST", "/api/photos"],
    ["POST", "/api/fuel"],
    ["POST", "/api/frio"],
    ["POST", "/api/lecturas"],
    ["GET", "/api/trips"],
    ["GET", "/api/auth/me"],
    ["GET", "/api/templates"],
    ["GET", "/api/trucks/options"],
    ["GET", "/api/reports/summary"],
    ["POST", "/api/facturacion/marcar"],
    ["GET", "/api/users"],
  ])("%s %s da 403", async (method, url) => {
    const r = await pedir(method, url, "mecanico");
    expect(r.status).toBe(403);
    expect(r.body.error).toContain("rol que el sistema no conoce");
  });

  it("el mensaje no depende del rol inventado: da igual cómo se llame", async () => {
    for (const rol of ["superadmin", "ADMIN", "x"]) expect((await pedir("DELETE", "/api/photos/1", rol)).status, rol).toBe(403);
  });
});

describe("los cuatro roles de hoy siguen exactamente igual", () => {
  it("el admin sigue entrando a lo suyo", async () => {
    expect((await pedir("GET", "/api/auth/me", ROLES.ADMIN)).status).toBe(200);
    expect((await pedir("GET", "/api/users", ROLES.ADMIN)).status).toBe(200);
  });

  it("el encargado y el lector siguen entrando a lo que ya entraban", async () => {
    expect((await pedir("GET", "/api/auth/me", ROLES.ENCARGADO)).status).toBe(200);
    expect((await pedir("GET", "/api/auth/me", ROLES.LECTOR)).status).toBe(200);
    expect((await pedir("GET", "/api/trips", ROLES.ENCARGADO)).status).not.toBe(403);
  });

  it("el lector sigue sin poder tocar nada (su lista blanca no cambió)", async () => {
    expect((await pedir("POST", "/api/trips", ROLES.LECTOR)).status).toBe(403);
    expect((await pedir("DELETE", "/api/photos/1", ROLES.LECTOR)).status).toBe(403);
  });

  it("un rol conocido no recibe el mensaje del rol desconocido", async () => {
    for (const rol of Object.values(ROLES)) {
      const r = await pedir("GET", "/api/auth/me", rol);
      expect(r.body?.error ?? "", rol).not.toContain("rol que el sistema no conoce");
    }
  });
});
