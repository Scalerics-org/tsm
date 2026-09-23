import { describe, it, expect } from "vitest";
import { app } from "../api/app";
import { signToken } from "../api/lib/crypto";
import { suscripcionesDeOficina } from "../api/repos/push";
import { lectorPuede } from "../api/lib/permisos-lector";
import { ROLES } from "@shared/domain";

/**
 * Qué puede pedirle al servidor el rol "solo mirar" (lector).
 *
 * "Ya hice el usuario, a mi hermano Aníbal. A él le hacemos que vea SOLAMENTE LOS VIAJES, y
 * para que le llegue la notificación y listo. (…) Y que él tenga opción solo de mirar, no
 * tocar ni corregir. Vaya que toque un dedazo y borre algo jajaja." — Rodrigo, 19/9/2026.
 *
 * El dedazo es el requisito, así que lo que se prueba acá es el servidor y no la pantalla:
 * esconder los botones no alcanza, las direcciones se escriben a mano y varias rutas de viajes
 * no llevan `requireRole` —se apoyan en la diferencia chofer/oficina, que a un lector lo deja
 * del lado que borra—. La lista blanca vive en `api/lib/permisos-lector.ts`.
 */

const SECRET = "test-secret-tsm";

function fakeDB() {
  return {
    prepare(sql: string) {
      const q = sql.toLowerCase();
      const stmt = {
        bind: () => stmt,
        first: async () => {
          if (q.includes("from users")) return { id: 2 };
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
  const token = await signToken(
    { id: 2, name: "Aníbal", role, driver_id: null, truck_id: null, email: null } as any,
    SECRET,
  );
  const res = await app.request(
    url,
    {
      method,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: method === "GET" ? undefined : JSON.stringify(body),
    },
    { DB: fakeDB(), JWT_SECRET: SECRET } as any,
  );
  return res.status;
}

describe("el lector mira los viajes", () => {
  it.each([
    ["GET", "/api/auth/me"],
    ["GET", "/api/trips"],
    ["GET", "/api/trips?truck=3&facturado=si"],
    ["GET", "/api/trips/7"],
    ["GET", "/api/trips/clientes"],
    ["GET", "/api/drivers"],
    ["GET", "/api/trucks"],
    ["GET", "/api/providers"],
    ["GET", "/api/templates"],
    // Sin R2 la foto contesta 404; lo que importa acá es que NO sea 403.
    ["GET", "/api/photos/trips/7/carga-abc.jpg"],
    // Bajarse el Excel de lo que está mirando sigue siendo mirar.
    ["GET", "/api/reports/trips.csv"],
    // La pantalla de Consumo (Rodrigo, 22/9).
    ["GET", "/api/reports/consumo"],
    ["GET", "/api/reports/consumo?from=2026-09-01&to=2026-09-30"],
  ])("%s %s no lo frena el rol", async (method, url) => {
    expect(await status(method, url, ROLES.LECTOR)).not.toBe(403);
  });
});

describe("el lector no toca nada", () => {
  it.each([
    // Los viajes: crear, corregir, borrar, y las cargas de adentro.
    ["POST", "/api/trips"],
    ["PATCH", "/api/trips/1"],
    ["PATCH", "/api/trips/1/fecha"],
    ["PATCH", "/api/trips/1/llegada"],
    ["PUT", "/api/trips/1/segments"],
    ["POST", "/api/trips/1/segments"],
    ["PATCH", "/api/trips/1/segments/abc"],
    ["DELETE", "/api/trips/1/segments/abc"],
    ["PATCH", "/api/trips/1/campos"],
    ["POST", "/api/trips/1/finish"],
    ["POST", "/api/trips/1/cancel"],
    ["DELETE", "/api/trips/1"],
    // Facturación: es lo que mira, no lo que mueve.
    ["POST", "/api/facturacion/marcar"],
    ["POST", "/api/facturacion/desmarcar"],
    ["GET", "/api/facturacion/resumen"],
    // Fotos: subir y —sobre todo— borrar.
    ["POST", "/api/photos"],
    ["DELETE", "/api/photos/1"],
    // Combustible, cámara de frío y lecturas.
    ["POST", "/api/fuel"],
    ["PUT", "/api/fuel/1"],
    ["DELETE", "/api/fuel/1"],
    ["PUT", "/api/frio/1"],
    ["POST", "/api/frio"],
    ["POST", "/api/lecturas"],
    ["PUT", "/api/lecturas/1"],
    ["GET", "/api/lecturas"],
    // Los datos con los que se arma un viaje.
    ["POST", "/api/templates"],
    ["PUT", "/api/templates/1"],
    ["DELETE", "/api/templates/1"],
    ["POST", "/api/providers"],
    ["POST", "/api/libreta"],
    ["GET", "/api/libreta"],
    ["POST", "/api/drivers"],
    ["PUT", "/api/drivers/1"],
    ["POST", "/api/trucks"],
    ["PUT", "/api/trucks/1"],
    // Usuarios: ahí es donde se reparten los permisos.
    ["GET", "/api/users"],
    ["POST", "/api/users"],
    ["PUT", "/api/users/1"],
    ["DELETE", "/api/users/1"],
    // Los reportes que no son el Excel de la lista.
    ["GET", "/api/reports/summary"],
    ["GET", "/api/reports/alerts"],
    ["GET", "/api/reports/pendientes-cobro"],
    ["GET", "/api/reports/fuel.csv"],
    ["GET", "/api/reports/cliente.csv"],
    ["GET", "/api/reports/truck/1"],
    // Y lo del chofer, que tampoco es suyo.
    ["GET", "/api/trips/active"],
    ["GET", "/api/fuel"],
    ["GET", "/api/departamentos"],
    ["GET", "/api/providers/uso"],
    ["GET", "/api/trucks/options"],
  ])("%s %s → 403", async (method, url) => {
    expect(await status(method, url, ROLES.LECTOR)).toBe(403);
  });

  /**
   * El freno es por omisión y no por lista de prohibiciones: la ruta que alguien escriba el
   * mes que viene le queda cerrada sin que nadie se acuerde de cerrarla. Se prueba contra la
   * lista y no contra la app porque una ruta inventada no llega ni a `requireAuth`: muere
   * antes, en el 404.
   */
  it("lo que no está en la lista no existe para él, aunque nadie lo haya previsto", () => {
    expect(lectorPuede("POST", "/api/lo-que-venga-el-mes-que-viene")).toBe(false);
    expect(lectorPuede("GET", "/api/reports/summary")).toBe(false);
    // Ni la lista de viajes con otro verbo, ni las fotos si un día se pudieran borrar por ahí.
    expect(lectorPuede("DELETE", "/api/trips")).toBe(false);
    expect(lectorPuede("DELETE", "/api/photos/trips/7/carga-abc.jpg")).toBe(false);
    // Y el viaje se abre por su número, no por cualquier cosa que venga después de /trips/.
    expect(lectorPuede("GET", "/api/trips/7")).toBe(true);
    expect(lectorPuede("GET", "/api/trips/active")).toBe(false);
  });

  it("pero a la oficina no le cambió nada: sigue entrando donde entraba", async () => {
    for (const [method, url] of [
      ["GET", "/api/trips"],
      ["POST", "/api/facturacion/marcar"],
      ["DELETE", "/api/trips/1"],
      ["GET", "/api/reports/summary"],
    ] as const) {
      expect(await status(method, url, ROLES.ENCARGADO)).not.toBe(403);
    }
  });
});

describe("el lector sí prende sus avisos", () => {
  it("se suscribe, se desuscribe y se manda una prueba", async () => {
    expect(await status("GET", "/api/push/clave", ROLES.LECTOR)).not.toBe(403);
    expect(await status("GET", "/api/push/estado", ROLES.LECTOR)).not.toBe(403);
    expect(
      await status("POST", "/api/push/suscribir", ROLES.LECTOR, {
        endpoint: "https://push.example/anibal",
        keys: { p256dh: "clave", auth: "auth" },
      }),
    ).toBe(201);
    expect(
      await status("DELETE", "/api/push/suscribir", ROLES.LECTOR, {
        endpoint: "https://push.example/anibal",
      }),
    ).toBe(200);
    // Sin claves VAPID cargadas contesta 503, que es "no configurado", no "no podés".
    expect(await status("POST", "/api/push/probar", ROLES.LECTOR)).not.toBe(403);
  });

  /**
   * Y el aviso le tiene que llegar. El reparto sale de un `WHERE u.role IN (…)`: si el rol
   * nuevo no estuviera ahí, Aníbal podría prender los avisos en su celular y no recibir
   * ninguno, sin un solo error que lo dijera.
   */
  it("el reparto de avisos lo incluye", async () => {
    let sql = "";
    const db = {
      prepare(q: string) {
        sql = q;
        return { bind: () => ({ all: async () => ({ results: [] }) }), all: async () => ({ results: [] }) };
      },
    } as unknown as D1Database;
    await suscripcionesDeOficina(db);
    expect(sql).toContain("lector");
  });
});

describe("la pantalla de Consumo del lector", () => {
  const surtida = (id: number, km: number, litros: number, dia: string) => ({
    id,
    truck_id: 1,
    odometer_km: km,
    liters: litros,
    is_full: 1,
    logged_at: `${dia} 12:00:00`,
  });

  function dbConSurtidas() {
    return {
      prepare(sql: string) {
        const q = sql.toLowerCase();
        const stmt = {
          bind: () => stmt,
          first: async () => (q.includes("from users") ? { id: 2 } : null),
          all: async () => {
            if (q.includes("from trucks")) {
              return {
                results: [
                  { id: 1, plate: "GTP 4301", avg_km_litro: 2.8 },
                  { id: 2, plate: "GTP 4302", avg_km_litro: 2.8 },
                ],
              };
            }
            if (q.includes("from fuel_logs")) {
              return {
                results: [
                  surtida(3, 10800, 400, "2026-09-20"),
                  surtida(2, 10000, 300, "2026-09-10"),
                  surtida(1, 9000, 350, "2026-08-25"),
                ],
              };
            }
            return { results: [] };
          },
          run: async () => ({ meta: { last_row_id: 1, changes: 1 } }),
        };
        return stmt;
      },
      batch: async () => [],
    } as unknown as D1Database;
  }

  async function pedirConsumo(role: string) {
    const token = await signToken(
      { id: 2, name: "Aníbal", role, driver_id: null, truck_id: null, email: null } as any,
      SECRET,
    );
    return app.request(
      "/api/reports/consumo",
      { headers: { authorization: `Bearer ${token}` } },
      { DB: dbConSurtidas(), JWT_SECRET: SECRET } as any,
    );
  }

  it("devuelve el rendimiento por camión y nada de kilos ni cobros", async () => {
    const res = await pedirConsumo(ROLES.LECTOR);
    expect(res.status).toBe(200);
    const { data } = (await res.json()) as { data: { camiones: Record<string, unknown>[] } };

    // Solo el camión que tiene surtidas: el otro no tiene nada que medir.
    expect(data.camiones).toHaveLength(1);
    const [camion] = data.camiones;
    expect(camion.plate).toBe("GTP 4301");
    expect(camion.expected_kml).toBe(2.8);
    expect(Object.keys(camion).sort()).toEqual(
      ["consumption_kml", "expected_kml", "km", "liters", "months", "plate"].sort(),
    );
    expect((camion.months as unknown[]).length).toBeGreaterThan(0);
  });

  it("el lector no puede pedir el resumen, que sí trae kilos por cliente", async () => {
    expect(await status("GET", "/api/reports/summary", ROLES.LECTOR)).toBe(403);
  });

  it("la oficina lo pide igual que antes", async () => {
    expect((await pedirConsumo(ROLES.ENCARGADO)).status).toBe(200);
    expect((await pedirConsumo(ROLES.ADMIN)).status).toBe(200);
  });

  it("un chofer no puede pedirlo", async () => {
    expect((await pedirConsumo(ROLES.CHOFER)).status).toBe(403);
  });

  it("y sigue sin poder escribir en esa ruta", async () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      expect(await status(method, "/api/reports/consumo", ROLES.LECTOR)).toBe(403);
    }
  });
});
