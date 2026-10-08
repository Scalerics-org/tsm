import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../api/app";
import { signToken } from "../api/lib/crypto";
import { ROLES } from "@shared/domain";
import { baseReal } from "./helpers/d1-real";

/**
 * Los remolques no son camiones. Contra una D1 de verdad con TODAS las migraciones, porque lo que
 * se prueba es que los SELECT filtren por clase: un fake que devuelve lo que el test le cargó
 * pasaba igual con el filtro mal escrito (o sin filtro).
 *
 * Lo que tiene que ser cierto:
 *  - el chofer no ve remolques para elegir con qué salir de viaje;
 *  - Control (tacógrafo, rendimiento) y los reportes de ruta no los cuentan;
 *  - los vencimientos de sus documentos SÍ siguen avisando;
 *  - no se les puede asignar un chofer ni cargarles un viaje.
 */

const SECRET = "test-secret-tsm";
let base: Awaited<ReturnType<typeof baseReal>>;
let ids = { camion: 0, remolque: 0, montacargas: 0, chofer: 0, oficina: 0 };

const MES = "2026-09";

async function insertarVehiculo(plate: string, clase: string, extra = "") {
  const r = await base.db
    .prepare(
      `INSERT INTO trucks (plate, brand, model, year, type, capacity_kg, odometer_km, avg_km_litro, status, clase ${extra ? ", venc_soa" : ""})
       VALUES (?, '', '', 0, 'x', 0, 0, 0, 'disponible', ? ${extra ? ", ?" : ""})`,
    )
    .bind(...(extra ? [plate, clase, extra] : [plate, clase]))
    .run();
  return r.meta.last_row_id as number;
}

beforeAll(async () => {
  base = await baseReal();
  ids.camion = await insertarVehiculo("ZZC 0001", "camion");
  // El SOA vencido: tiene que seguir saliendo en los avisos aunque sea un remolque.
  ids.remolque = await insertarVehiculo("ZZR 0001", "remolque", "2020-01-01");
  ids.montacargas = await insertarVehiculo("ZZM 0001", "montacargas");

  const chofer = await base.db
    .prepare("INSERT INTO drivers (name, document, license_number, license_category, license_expiry, phone, status, default_truck_id) VALUES ('Chofer Prueba', 'ZZ1', '', '', '', '', 'activo', ?)")
    .bind(ids.camion)
    .run();
  ids.chofer = chofer.meta.last_row_id as number;
  const oficina = await base.db
    .prepare("INSERT INTO users (email, password_hash, name, role) VALUES ('zz@prueba.test', 'x', 'Oficina', 'admin')")
    .run();
  ids.oficina = oficina.meta.last_row_id as number;
}, 180_000);

afterAll(async () => {
  await base?.cerrar();
});

async function pedir(url: string, rol: "chofer" | "admin", init: { method?: string; json?: unknown } = {}) {
  const token = await signToken(
    {
      id: rol === "chofer" ? 9999 : ids.oficina,
      name: "Prueba",
      role: rol === "chofer" ? ROLES.CHOFER : ROLES.ADMIN,
      driver_id: rol === "chofer" ? ids.chofer : null,
      truck_id: null,
      email: null,
    } as any,
    SECRET,
  );
  const headers: Record<string, string> = { authorization: `Bearer ${token}` };
  if (init.json !== undefined) headers["content-type"] = "application/json";
  const res = await app.request(
    url,
    { method: init.method ?? "GET", headers, body: init.json !== undefined ? JSON.stringify(init.json) : undefined },
    { DB: base.db, JWT_SECRET: SECRET } as any,
    { waitUntil: () => {}, passThroughOnException: () => {} } as any,
  );
  return { status: res.status, body: (await res.json()) as any };
}

const plates = (lista: { plate: string }[]) => lista.map((x) => x.plate);

describe("el chofer elige entre camiones, no entre remolques", () => {
  it("GET /trucks/options trae el camión y deja afuera remolques y montacargas", async () => {
    const { status, body } = await pedir("/api/trucks/options", "chofer");
    expect(status).toBe(200);
    expect(plates(body.data)).toContain("ZZC 0001");
    expect(plates(body.data)).not.toContain("ZZR 0001");
    expect(plates(body.data)).not.toContain("ZZM 0001");
  });

  it("GET /trucks (la oficina) sí los trae a todos, con su clase", async () => {
    const { body } = await pedir("/api/trucks", "admin");
    const por = Object.fromEntries(body.data.map((t: any) => [t.plate, t.clase]));
    expect(por["ZZC 0001"]).toBe("camion");
    expect(por["ZZR 0001"]).toBe("remolque");
    expect(por["ZZM 0001"]).toBe("montacargas");
  });
});

describe("Control y los reportes de ruta no cuentan remolques", () => {
  it("la auditoría de kilómetros (foto del tacógrafo, sin chofer) no los incluye", async () => {
    const { status, body } = await pedir(`/api/lecturas/auditoria?mes=${MES}`, "admin");
    expect(status).toBe(200);
    expect(plates(body.data.camiones)).toContain("ZZC 0001");
    expect(plates(body.data.camiones)).not.toContain("ZZR 0001");
    expect(plates(body.data.camiones)).not.toContain("ZZM 0001");
  });

  it("el resumen por camión no los incluye", async () => {
    const { status, body } = await pedir(`/api/reports/summary?from=2026-09-01&to=2026-09-30`, "admin");
    expect(status).toBe(200);
    expect(plates(body.data.byTruck)).toContain("ZZC 0001");
    expect(plates(body.data.byTruck)).not.toContain("ZZR 0001");
  });

  it("los vencimientos de documentos SÍ avisan del remolque", async () => {
    const { status, body } = await pedir("/api/reports/alerts", "admin");
    expect(status).toBe(200);
    const quienes = body.data.vencimientos.map((v: any) => v.quien);
    expect(quienes).toContain("ZZR 0001");
  });

  it("y el aviso del Resumen también", async () => {
    const { body } = await pedir("/api/reports/vencimientos", "admin");
    expect(body.data.avisos.map((v: any) => v.quien)).toContain("ZZR 0001");
  });
});

describe("no se les asigna chofer ni se les carga un viaje", () => {
  it("un chofer no puede tener un remolque como camión", async () => {
    const { status, body } = await pedir("/api/drivers", "admin", {
      method: "POST",
      json: { name: "Otro", document: "ZZ2", pin: "1234", default_truck_id: ids.remolque },
    });
    expect(status).toBe(400);
    expect(body.error).toMatch(/no es un camión/);
  });

  it("un viaje no se carga a nombre de un remolque", async () => {
    const { status, body } = await pedir("/api/trips", "admin", {
      method: "POST",
      json: { template_id: 1, truck_id: ids.remolque, driver_id: ids.chofer },
    });
    expect(status).toBe(400);
    expect(body.error).toMatch(/no es un camión/);
  });
});

describe("alta y edición de la clase", () => {
  it("el alta guarda la clase que se elige", async () => {
    const { status, body } = await pedir("/api/trucks", "admin", {
      method: "POST",
      json: { plate: "zzr 0002", type: "SEMIREMOLQUE", clase: "remolque" },
    });
    expect(status).toBe(201);
    expect(body.data.clase).toBe("remolque");
  });

  it("sin clase en el alta es un camión", async () => {
    const { body } = await pedir("/api/trucks", "admin", { method: "POST", json: { plate: "zzc 0002" } });
    expect(body.data.clase).toBe("camion");
  });

  it("una clase inventada se rechaza", async () => {
    const { status } = await pedir("/api/trucks", "admin", { method: "POST", json: { plate: "ZZX 1", clase: "lancha" } });
    expect(status).toBe(400);
  });

  it("guardar desde una pantalla vieja (sin clase) no convierte el remolque en camión", async () => {
    const { status, body } = await pedir(`/api/trucks/${ids.remolque}`, "admin", {
      method: "PUT",
      json: { plate: "ZZR 0001", type: "x" },
    });
    expect(status).toBe(200);
    expect(body.data.clase).toBe("remolque");
  });

  it("un camión con chofer asignado no pasa a remolque", async () => {
    const { status, body } = await pedir(`/api/trucks/${ids.camion}`, "admin", {
      method: "PUT",
      json: { plate: "ZZC 0001", type: "x", clase: "remolque" },
    });
    expect(status).toBe(409);
    expect(body.error).toMatch(/chofer/);
  });
});
