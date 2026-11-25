import { describe, it, expect } from "vitest";
import { app } from "../api/app";
import { signToken } from "../api/lib/crypto";
import { mecanicoPuede, LO_QUE_MIRA_EL_MECANICO } from "../api/lib/permisos-mecanico";
import { ROLES } from "@shared/domain";

/**
 * Qué puede pedirle al servidor el rol "mecánico" (Raúl): sólo lo que usa el Taller (sesión, flota y nombres de choferes).
 *
 * Igual que con el lector, lo que se prueba es el servidor y no la pantalla: las direcciones se escriben a mano y varias
 * rutas no llevan `requireRole`. La lista blanca vive en `api/lib/permisos-mecanico.ts`.
 */

const SECRET = "test-secret-tsm";

const CHOFER_COMPLETO = {
  id: 5,
  name: "Pérez",
  status: "activo",
  default_truck_id: 3,
  phone: "099123456",
  document: "1.234.567-8",
  license: "B-998877",
  pin_hash: "x",
};

// El rol se relee de la base en cada pedido: el fake devuelve el mismo rol con el que se firmó el token.
function fakeDB(role: string) {
  return {
    prepare(sql: string) {
      const q = sql.toLowerCase();
      const stmt = {
        bind: () => stmt,
        first: async () => (q.includes("from users") ? { id: 2, role } : null),
        all: async () => ({ results: q.includes("from drivers") ? [CHOFER_COMPLETO] : [] }),
        run: async () => ({ meta: { last_row_id: 1, changes: 1 } }),
      };
      return stmt;
    },
    batch: async () => [],
  } as unknown as D1Database;
}

async function pedir(method: string, url: string, role: string, body: unknown = {}) {
  const token = await signToken(
    { id: 2, name: "Raúl", role, driver_id: null, truck_id: null, email: null } as any,
    SECRET,
  );
  const res = await app.request(
    url,
    {
      method,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: method === "GET" ? undefined : JSON.stringify(body),
    },
    { DB: fakeDB(role), JWT_SECRET: SECRET } as any,
  );
  const texto = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(texto);
  } catch {
    /* la foto sin R2 no es JSON */
  }
  return { status: res.status, body: json };
}

describe("el mecánico ve lo que usa el Taller", () => {
  it.each([
    ["GET", "/api/auth/me"],
    ["GET", "/api/trucks"],
    ["GET", "/api/drivers"],
  ])("%s %s no lo frena el rol", async (method, url) => {
    expect((await pedir(method, url, ROLES.MECANICO)).status).not.toBe(403);
  });
});

describe("el mecánico no ve la ficha del camión: viajes, surtidas y consumo no son suyos", () => {
  it.each([
    ["GET", "/api/reports/truck/3"],
    ["GET", "/api/reports/truck/3?month=2026-09"],
    ["GET", "/api/lecturas?truck_id=3"],
    ["GET", "/api/frio?truck_id=3"],
    ["GET", "/api/photos/odometro/3/abc.jpg"],
    ["GET", "/api/photos/frio/3/abc.jpg"],
  ])("%s %s da 403", async (method, url) => {
    expect((await pedir(method, url, ROLES.MECANICO)).status).toBe(403);
  });
});

describe("el mecánico no ve ni toca nada más", () => {
  it.each([
    // Camiones: nada de crear, editar o borrar.
    ["POST", "/api/trucks"],
    ["PATCH", "/api/trucks/3"],
    ["PUT", "/api/trucks/3"],
    ["DELETE", "/api/trucks/3"],
    ["GET", "/api/trucks/options"],
    // Lecturas, frío y surtidas: ni leer ni escribir.
    ["POST", "/api/lecturas"],
    ["PATCH", "/api/lecturas/1"],
    ["DELETE", "/api/lecturas/1"],
    ["POST", "/api/frio"],
    ["PUT", "/api/frio/horas"],
    ["PATCH", "/api/fuel/1"],
    ["DELETE", "/api/fuel/1"],
    ["GET", "/api/fuel"],
    // Viajes y plata.
    ["GET", "/api/trips"],
    ["GET", "/api/trips/7"],
    ["POST", "/api/trips"],
    ["POST", "/api/trips/1/cancel"],
    ["DELETE", "/api/trips/1"],
    ["POST", "/api/facturacion/marcar"],
    ["POST", "/api/facturacion/marcar-pago"],
    ["GET", "/api/facturacion/resumen"],
    // Los demás reportes (la lista blanca es lo único que los cierra).
    ["GET", "/api/reports/summary"],
    ["GET", "/api/reports/consumo"],
    ["GET", "/api/reports/trips.csv"],
    // Fotos de los viajes: son los remitos con los que se factura.
    ["GET", "/api/photos/trips/7/carga-abc.jpg"],
    ["DELETE", "/api/photos/1"],
    ["POST", "/api/photos"],
    // Datos de la oficina.
    ["GET", "/api/providers"],
    ["GET", "/api/templates"],
    ["GET", "/api/libreta"],
    ["POST", "/api/drivers"],
    ["PATCH", "/api/drivers/5"],
    ["DELETE", "/api/drivers/5"],
    // Usuarios, y los avisos de la oficina.
    ["GET", "/api/users"],
    ["POST", "/api/users"],
    ["PUT", "/api/users/1"],
    ["POST", "/api/push/subscribe"],
  ])("%s %s da 403", async (method, url) => {
    const r = await pedir(method, url, ROLES.MECANICO);
    expect(r.status).toBe(403);
  });

  it("el mensaje le dice qué sí ve", async () => {
    const r = await pedir("GET", "/api/trips", ROLES.MECANICO);
    expect(r.body.error).toContain("mecánico");
  });
});

describe("la lista de choferes del mecánico viene recortada", () => {
  it("recibe id, nombre, estado y camión: ni teléfono, ni documento, ni licencia", async () => {
    const r = await pedir("GET", "/api/drivers", ROLES.MECANICO);
    expect(r.status).toBe(200);
    expect(r.body.data).toEqual([{ id: 5, name: "Pérez", status: "activo", default_truck_id: 3 }]);
  });

  it("el lector la sigue recibiendo sin el camión", async () => {
    const r = await pedir("GET", "/api/drivers", ROLES.LECTOR);
    expect(r.body.data).toEqual([{ id: 5, name: "Pérez", status: "activo" }]);
  });
});

describe("la lista blanca del mecánico", () => {
  it("sólo tiene lecturas (GET)", () => {
    for (const p of LO_QUE_MIRA_EL_MECANICO) expect(p.metodo, String(p.ruta)).toBe("GET");
  });

  it("no se deja engañar por prefijos ni por sufijos", () => {
    expect(mecanicoPuede("GET", "/api/trucks/options")).toBe(false);
    expect(mecanicoPuede("GET", "/api/trucks/")).toBe(false);
    expect(mecanicoPuede("GET", "/api/reports/truck/3/otra-cosa")).toBe(false);
    expect(mecanicoPuede("GET", "/api/reports/truck/abc")).toBe(false);
    expect(mecanicoPuede("GET", "/api/photos/trips/3/abc.jpg")).toBe(false);
    expect(mecanicoPuede("GET", "/api/photos/odometro/3/a/b.jpg")).toBe(false);
  });

  it("es exactamente lo que usa el Taller: sesión, camiones y choferes", () => {
    expect(LO_QUE_MIRA_EL_MECANICO.map((p) => p.ruta.source)).toEqual([
      "^\\/api\\/auth\\/me$",
      "^\\/api\\/trucks$",
      "^\\/api\\/drivers$",
    ]);
  });

  it("acepta el método en minúsculas pero no otro método", () => {
    expect(mecanicoPuede("get", "/api/trucks")).toBe(true);
    expect(mecanicoPuede("POST", "/api/trucks")).toBe(false);
  });
});

describe("los demás roles no cambiaron", () => {
  it("el encargado y el admin siguen entrando a los viajes", async () => {
    expect((await pedir("GET", "/api/trips", ROLES.ENCARGADO)).status).not.toBe(403);
    expect((await pedir("GET", "/api/trips", ROLES.ADMIN)).status).not.toBe(403);
  });

  it("la pantalla de usuarios acepta el rol mecánico y sigue rechazando los inventados", async () => {
    const bueno = await pedir("PUT", "/api/users/9", ROLES.ADMIN, { role: ROLES.MECANICO });
    expect(bueno.status).not.toBe(400);
    const malo = await pedir("PUT", "/api/users/9", ROLES.ADMIN, { role: "contador" });
    expect(malo.status).toBe(400);
  });
});
