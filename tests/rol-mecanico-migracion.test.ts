import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { aplicar, baseReal } from "./helpers/d1-real";

/**
 * La migración 0061 (rol "mecánico") rehace la tabla `users` para cambiarle el CHECK. Rehacerla a lo bruto borra las
 * suscripciones a los avisos y vacía todas las columnas *_by que apuntan a users: el rastro de quién facturó, quién cobró,
 * quién corrigió. Acá se prueba, contra una D1 de verdad con todas las migraciones anteriores, que NADA de eso se pierde.
 *
 * Las migraciones ya siembran usuarios, camiones y viajes con ids bajos: esta prueba siembra los suyos con ids desde 9001
 * y compara las tablas ENTERAS (lo sembrado por las migraciones también tiene que sobrevivir igual).
 */

/** Las columnas que apuntan a users(id) en el esquema real. */
const COLUMNAS_HACIA_USERS = [
  "fuel_logs.edited_by",
  "fuel_logs.verificado_by",
  "horas_frio.updated_by",
  "lecturas_odometro.edited_by",
  "push_subscriptions.user_id",
  "surtidas_frio.edited_by",
  "trips.facturado_by",
  "trips.pago_by",
  "viaje_cliente_facturacion.facturado_by",
  "viaje_cliente_facturacion.pago_by",
];

const TABLAS_A_COMPARAR = [
  "users",
  "push_subscriptions",
  "trips",
  "fuel_logs",
  "lecturas_odometro",
  "surtidas_frio",
  "horas_frio",
  "viaje_cliente_facturacion",
];

// Ids de la prueba.
const ADMIN = 9001;
const ENCARGADO = 9002;
const LECTOR = 9003;
const CHOFER = 9004;

let base: Awaited<ReturnType<typeof baseReal>>;
let antes: Record<string, any[]>;
let columnasAntes: string[];
let maxIdDeUsers = 0;

const filas = async (tabla: string) => (await base.db.prepare(`SELECT * FROM ${tabla} ORDER BY 1, 2`).all<any>()).results;
const instantanea = async () => Object.fromEntries(await Promise.all(TABLAS_A_COMPARAR.map(async (t) => [t, await filas(t)])));
// D1 no deja usar `pragma_foreign_key_list(...)` como función de tabla (SQLITE_AUTH): se pregunta tabla por tabla.
const columnasHaciaUsers = async () => {
  const tablas = (await base.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'").all<{ name: string }>()).results;
  const hacia: string[] = [];
  for (const { name } of tablas) {
    const fks = (await base.db.prepare(`PRAGMA foreign_key_list("${name}")`).all<{ table: string; from: string }>()).results;
    for (const fk of fks) if (fk.table === "users") hacia.push(`${name}.${fk.from}`);
  }
  return hacia.sort();
};

beforeAll(async () => {
  base = await baseReal("0060_visible_desde.sql");
  const run = (sql: string, ...binds: unknown[]) => base.db.prepare(sql).bind(...binds).run();

  // Un usuario de cada rol que existía.
  for (const [id, rol] of [[ADMIN, "admin"], [ENCARGADO, "encargado"], [LECTOR, "lector"], [CHOFER, "chofer"]] as const) {
    await run("INSERT INTO users (id, email, password_hash, name, role) VALUES (?, ?, 'hash', ?, ?)", id, `${rol}@mig.test`, `Usuario ${rol}`, rol);
  }
  await run("INSERT INTO drivers (id, name, document) VALUES (9001, 'Chofer Uno', 'D9001')");
  await run("INSERT INTO trucks (id, plate) VALUES (9001, 'ZZM 9001')");
  await run("INSERT INTO trucks (id, plate) VALUES (9002, 'ZZM 9002')");

  // Un valor en CADA columna que apunta a users, con usuarios distintos para que un cruce se note.
  await run("INSERT INTO trips (id, origin, destination, driver_id, truck_id, facturado_by, pago_by) VALUES (9001, 'Artigas', 'Montevideo', 9001, 9001, ?, ?)", ADMIN, ENCARGADO);
  await run("INSERT INTO trips (id, origin, destination, driver_id, truck_id, facturado_by) VALUES (9002, 'Salto', 'Montevideo', 9001, 9001, ?)", LECTOR);
  await run("INSERT INTO trips (id, origin, destination, driver_id, truck_id) VALUES (9003, 'Rivera', 'Montevideo', 9001, 9001)"); // sin ningún *_by: tiene que seguir en NULL
  await run("INSERT INTO fuel_logs (id, truck_id, odometer_km, liters, edited_by, verificado_by) VALUES (9001, 9001, 1000, 100, ?, ?)", ENCARGADO, LECTOR);
  await run("INSERT INTO fuel_logs (id, truck_id, odometer_km, liters) VALUES (9002, 9001, 1500, 100)");
  await run("INSERT INTO lecturas_odometro (id, truck_id, periodo, kilometraje, edited_by) VALUES (9001, 9001, '2026-09', 1000, ?)", ADMIN);
  await run("INSERT INTO surtidas_frio (id, truck_id, liters, edited_by) VALUES (9001, 9001, 50, ?)", ENCARGADO);
  await run("INSERT INTO horas_frio (truck_id, mes, horas_inicio, updated_by) VALUES (9001, '2026-09', 10, ?)", LECTOR);
  await run("INSERT INTO horas_frio (truck_id, mes, horas_inicio, updated_by) VALUES (9002, '2026-09', 20, ?)", ADMIN);
  await run("INSERT INTO viaje_cliente_facturacion (id, trip_id, cliente_clave, cliente_nombre, facturado_by, pago_by) VALUES (9001, 9001, 'a', 'Cliente A', ?, ?)", ENCARGADO, LECTOR);
  await run("INSERT INTO viaje_cliente_facturacion (id, trip_id, cliente_clave, cliente_nombre, facturado_by) VALUES (9002, 9001, 'b', 'Cliente B', ?)", ADMIN);
  await run("INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth) VALUES (9001, ?, 'https://push.test/a', 'k1', 'a1')", ADMIN);
  await run("INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth) VALUES (9002, ?, 'https://push.test/b', 'k2', 'a2')", ENCARGADO);
  await run("INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth) VALUES (9003, ?, 'https://push.test/c', 'k3', 'a3')", ENCARGADO);

  columnasAntes = await columnasHaciaUsers();
  maxIdDeUsers = (await base.db.prepare("SELECT MAX(id) AS m FROM users").first<{ m: number }>())!.m;
  antes = await instantanea();
  await aplicar(base.db, "0061_rol_mecanico.sql");
}, 180_000);

afterAll(async () => {
  await base?.cerrar();
});

describe("las columnas que apuntan a users", () => {
  it("son exactamente las diez que la migración resguarda: si aparece otra, hay que sumarla a la 0061", () => {
    expect(columnasAntes).toEqual(COLUMNAS_HACIA_USERS);
  });

  it("después de la migración siguen siendo las mismas, con sus claves foráneas", async () => {
    expect(await columnasHaciaUsers()).toEqual(COLUMNAS_HACIA_USERS);
  });
});

describe("la 0061 no se lleva nada puesto", () => {
  it("el seed de la prueba tiene un valor en cada columna *_by y las suscripciones (si no, no prueba nada)", () => {
    expect(antes.users.length).toBeGreaterThanOrEqual(4);
    expect(antes.push_subscriptions.filter((s) => s.id >= 9001)).toHaveLength(3);
    expect(antes.trips.filter((t) => t.id >= 9001 && t.facturado_by != null)).toHaveLength(2);
    expect(antes.trips.filter((t) => t.id >= 9001 && t.pago_by != null)).toHaveLength(1);
    expect(antes.fuel_logs.some((f) => f.edited_by != null && f.verificado_by != null)).toBe(true);
    expect(antes.lecturas_odometro.some((l) => l.edited_by != null)).toBe(true);
    expect(antes.surtidas_frio.some((s) => s.edited_by != null)).toBe(true);
    expect(antes.viaje_cliente_facturacion.filter((v) => v.pago_by != null)).toHaveLength(1);
    expect(antes.viaje_cliente_facturacion.filter((v) => v.facturado_by != null)).toHaveLength(2);
    expect(antes.horas_frio.filter((h) => h.updated_by != null)).toHaveLength(2);
  });

  it.each(TABLAS_A_COMPARAR)("%s: mismas filas, mismos id y mismos valores", async (tabla) => {
    expect(await filas(tabla)).toEqual(antes[tabla]);
  });

  it("quién facturó y quién cobró por cliente se conserva (lo que la 0049, copiada tal cual, habría borrado)", async () => {
    const v = await base.db.prepare("SELECT id, facturado_by, pago_by FROM viaje_cliente_facturacion WHERE id >= 9001 ORDER BY id").all<any>();
    expect(v.results).toEqual([
      { id: 9001, facturado_by: ENCARGADO, pago_by: LECTOR },
      { id: 9002, facturado_by: ADMIN, pago_by: null },
    ]);
  });

  it("lo que estaba en NULL sigue en NULL: no se inventa ningún autor", async () => {
    const t = await base.db.prepare("SELECT facturado_by, pago_by FROM trips WHERE id = 9003").first<any>();
    expect(t).toEqual({ facturado_by: null, pago_by: null });
  });

  it("no cambia el rol de nadie", async () => {
    const roles = (await base.db.prepare("SELECT id, role FROM users WHERE id >= 9001 ORDER BY id").all<any>()).results;
    expect(roles).toEqual([
      { id: ADMIN, role: "admin" },
      { id: ENCARGADO, role: "encargado" },
      { id: LECTOR, role: "lector" },
      { id: CHOFER, role: "chofer" },
    ]);
  });

  it("no queda ninguna tabla de resguardo ni la tabla provisoria", async () => {
    const t = (
      await base.db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND (name LIKE '\\_resguardo%' ESCAPE '\\' OR name = 'users_nueva')")
        .all<any>()
    ).results;
    expect(t).toEqual([]);
  });

  it("las claves foráneas quedan consistentes", async () => {
    const mal = (await base.db.prepare("PRAGMA foreign_key_check").all<any>()).results;
    expect(mal).toEqual([]);
  });
});

describe("el CHECK nuevo", () => {
  it("acepta 'mecanico'", async () => {
    await base.db.prepare("INSERT INTO users (email, password_hash, name, role) VALUES ('raul@mig.test', 'hash', 'Raúl', 'mecanico')").run();
    const r = await base.db.prepare("SELECT role FROM users WHERE email = 'raul@mig.test'").first<any>();
    expect(r.role).toBe("mecanico");
  });

  it("los autoincrementales siguen donde estaban: el usuario nuevo no pisa un id viejo", async () => {
    const r = await base.db.prepare("SELECT id FROM users WHERE email = 'raul@mig.test'").first<any>();
    expect(r.id).toBe(maxIdDeUsers + 1);
  });

  it("acepta 'cliente', el rol reservado para el usuario de un cliente o proveedor", async () => {
    await base.db.prepare("INSERT INTO users (email, password_hash, name, role) VALUES ('cliente@mig.test', 'hash', 'Cliente', 'cliente')").run();
    const r = await base.db.prepare("SELECT role FROM users WHERE email = 'cliente@mig.test'").first<any>();
    expect(r.role).toBe("cliente");
  });

  it("sigue rechazando un rol inventado", async () => {
    await expect(
      base.db.prepare("INSERT INTO users (email, password_hash, name, role) VALUES ('x@mig.test', 'hash', 'X', 'superadmin')").run(),
    ).rejects.toThrow(/CHECK|constraint/i);
  });

  it("los seis roles válidos están en la definición de la tabla", async () => {
    const sql = (await base.db.prepare("SELECT sql FROM sqlite_master WHERE name = 'users'").first<any>()).sql as string;
    for (const rol of ["chofer", "encargado", "admin", "lector", "mecanico", "cliente"]) expect(sql).toContain(`'${rol}'`);
  });

  it("el email sigue siendo único", async () => {
    await expect(
      base.db.prepare("INSERT INTO users (email, password_hash, name, role) VALUES ('raul@mig.test', 'hash', 'Otro', 'admin')").run(),
    ).rejects.toThrow(/UNIQUE|constraint/i);
  });
});

describe("las acciones de las claves foráneas siguen andando", () => {
  it("borrar un usuario borra sus suscripciones (ON DELETE CASCADE) y deja en NULL lo que firmó (SET NULL)", async () => {
    await base.db.prepare("DELETE FROM users WHERE id = ?").bind(ENCARGADO).run();
    const subs = (await base.db.prepare("SELECT id FROM push_subscriptions WHERE id >= 9001 ORDER BY id").all<any>()).results;
    expect(subs).toEqual([{ id: 9001 }]);
    const t = await base.db.prepare("SELECT pago_by FROM trips WHERE id = 9001").first<any>();
    expect(t.pago_by).toBeNull();
    const f = await base.db.prepare("SELECT edited_by, verificado_by FROM fuel_logs WHERE id = 9001").first<any>();
    expect(f).toEqual({ edited_by: null, verificado_by: LECTOR });
  });
});
