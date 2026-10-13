import { describe, it, expect } from "vitest";
import {
  TABLAS_QUE_NO_SE_COPIAN,
  partirInstrucciones,
  prepararRespaldoParaPrueba,
  tablaDelInsert,
  tablasPorDependencia,
  TABLA_MARCA,
  TRABA_SOLO_PRUEBA,
} from "../shared/respaldo-prueba";

/**
 * La prueba arranca como copia de producción. Lo que NO puede pasar es que la copia traiga los
 * celulares reales de la gente: una prueba que dispare un aviso le llegaría a un chofer de verdad.
 */

// Un respaldo chico con la forma de lo que saca `wrangler d1 export`.
const RESPALDO = `PRAGMA defer_foreign_keys=TRUE;
CREATE TABLE d1_migrations(
		id         INTEGER PRIMARY KEY AUTOINCREMENT,
		name       TEXT UNIQUE,
		applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(1,'0001_init.sql','2026-08-06 14:57:47');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(2,'0058_km_de_estancias.sql','2026-10-12 14:37:34');
CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT, password_hash TEXT);
INSERT INTO "users" ("id","email","password_hash") VALUES(1,'rodrigo@tsm.uy','pbkdf2$100000$aa$bb');
CREATE TABLE trips (id INTEGER PRIMARY KEY, destination TEXT, notes TEXT);
INSERT INTO "trips" ("id","destination","notes") VALUES(1,'Artigas','dejó el remito; falta firmar
y una segunda línea con ''comillas''; y punto y coma');
CREATE TABLE push_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL
);
CREATE INDEX idx_push_user ON push_subscriptions(user_id);
INSERT INTO "push_subscriptions" ("id","user_id","endpoint","p256dh","auth") VALUES(2,2,'https://fcm.googleapis.com/fcm/send/CELULAR-REAL-1','clave-p256dh-1','secreto-auth-1');
INSERT INTO "push_subscriptions" ("id","user_id","endpoint","p256dh","auth") VALUES(3,9,'https://web.push.apple.com/CELULAR-REAL-2','clave-p256dh-2','secreto-auth-2');
CREATE TABLE intentos_login (clave TEXT PRIMARY KEY, fallos INTEGER, bloqueado_hasta TEXT, actualizado TEXT);
INSERT INTO "intentos_login" ("clave","fallos","bloqueado_hasta","actualizado") VALUES('ip:1.2.3.4',5,'2026-10-13 15:00:00','2026-10-13 14:45:00');
DELETE FROM sqlite_sequence;
INSERT INTO "sqlite_sequence" ("name","seq") VALUES('push_subscriptions',5);
`;

describe("partir el respaldo en instrucciones", () => {
  it("no corta por dentro de un texto con punto y coma, comillas dobles ni saltos de línea", () => {
    const partes = partirInstrucciones(RESPALDO);
    const viaje = partes.find((p) => p.startsWith('INSERT INTO "trips"'));
    expect(viaje).toContain("falta firmar\ny una segunda línea con ''comillas''; y punto y coma");
    expect(viaje!.endsWith(";")).toBe(true);
  });

  it("reconoce a qué tabla inserta, con o sin comillas", () => {
    expect(tablaDelInsert('INSERT INTO "push_subscriptions" ("id") VALUES(1);')).toBe("push_subscriptions");
    expect(tablaDelInsert("INSERT INTO push_subscriptions (id) VALUES (1);")).toBe("push_subscriptions");
    expect(tablaDelInsert("insert or replace into `Push_Subscriptions` (id) values (1);")).toBe("push_subscriptions");
    expect(tablaDelInsert("CREATE TABLE push_subscriptions (id INTEGER);")).toBeNull();
  });
});

describe("la copia para la base de prueba", () => {
  const { sql, filasDescartadas, tablasVaciadas } = prepararRespaldoParaPrueba(RESPALDO);

  it("no trae ninguna suscripción push: ni un endpoint, ni una clave", () => {
    expect(sql).not.toContain("CELULAR-REAL");
    expect(sql).not.toContain("clave-p256dh");
    expect(sql).not.toContain("secreto-auth");
    expect(sql).not.toMatch(/INSERT INTO "?push_subscriptions/i);
  });

  it("la tabla push_subscriptions sí se crea: la app la usa y sin ella el aviso se rompe", () => {
    expect(sql).toContain("CREATE TABLE push_subscriptions");
    expect(sql).toContain("CREATE INDEX idx_push_user");
  });

  it("no trae los contadores de bloqueo de login", () => {
    expect(sql).not.toContain("ip:1.2.3.4");
    expect(sql).toContain("CREATE TABLE intentos_login");
  });

  it("termina vaciando las tablas, por las dudas", () => {
    const final = sql.trimEnd().split("\n").slice(-2);
    expect(final).toEqual(["DELETE FROM push_subscriptions;", "DELETE FROM intentos_login;"]);
    expect(tablasVaciadas).toEqual(["push_subscriptions", "intentos_login"]);
  });

  it("cuenta lo que no copió", () => {
    expect(filasDescartadas).toEqual({ push_subscriptions: 2, intentos_login: 1 });
  });

  it("el resto de los datos pasa entero, con los usuarios para poder entrar", () => {
    expect(sql).toContain("rodrigo@tsm.uy");
    expect(sql).toContain("pbkdf2$100000$aa$bb");
    expect(sql).toContain("falta firmar\ny una segunda línea con ''comillas''; y punto y coma");
  });

  it("conserva d1_migrations: así migrar después no reaplica todo", () => {
    expect(sql).toContain("CREATE TABLE d1_migrations");
    expect(sql).toContain("0058_km_de_estancias.sql");
  });

  it("sirve para cargar una base vacía: el PRAGMA va justo después de la traba y las tablas se crean antes de llenarse", () => {
    expect(sql.split("\n")[1]).toBe("PRAGMA defer_foreign_keys=TRUE;");
    expect(sql.indexOf("CREATE TABLE users")).toBeLessThan(sql.indexOf('INSERT INTO "users"'));
  });

  it("todas las instrucciones terminan en punto y coma", () => {
    for (const i of partirInstrucciones(sql)) expect(i.endsWith(";")).toBe(true);
  });

  it("es idempotente: pasarle su propia salida no cambia nada", () => {
    expect(prepararRespaldoParaPrueba(sql).sql).toBe(sql);
  });
});

describe("el orden para cargarlo", () => {
  // Como sale de D1: drivers se inserta ANTES que trucks, que es la que referencia.
  const DESORDENADO = `PRAGMA defer_foreign_keys=TRUE;
CREATE TABLE d1_migrations(id INTEGER PRIMARY KEY, name TEXT);
CREATE TABLE drivers (id INTEGER PRIMARY KEY, default_truck_id INTEGER REFERENCES trucks(id));
INSERT INTO "drivers" ("id","default_truck_id") VALUES(1,5);
CREATE TABLE trucks (id INTEGER PRIMARY KEY);
INSERT INTO "trucks" ("id") VALUES(5);
CREATE TABLE users (id INTEGER PRIMARY KEY, driver_id INTEGER REFERENCES drivers(id));
INSERT INTO "users" ("id","driver_id") VALUES(1,1);
CREATE TABLE trips (id INTEGER PRIMARY KEY, truck_id INTEGER REFERENCES trucks(id), user_id INTEGER REFERENCES users(id));
INSERT INTO "trips" ("id","truck_id","user_id") VALUES(1,5,1);
DELETE FROM sqlite_sequence;
INSERT INTO "sqlite_sequence" ("name","seq") VALUES('trucks',5);
`;

  it("las tablas van después de las que referencian", () => {
    const orden = tablasPorDependencia(partirInstrucciones(DESORDENADO));
    expect(orden.indexOf("trucks")).toBeLessThan(orden.indexOf("drivers"));
    expect(orden.indexOf("drivers")).toBeLessThan(orden.indexOf("users"));
    expect(orden.indexOf("users")).toBeLessThan(orden.indexOf("trips"));
  });

  it("en la salida el esquema va entero antes que los datos y cada fila después de su tabla padre", () => {
    const { sql } = prepararRespaldoParaPrueba(DESORDENADO);
    const pos = (t: string) => sql.indexOf(t);
    expect(pos("CREATE TABLE trips")).toBeLessThan(pos('INSERT INTO "trucks"'));
    expect(pos('INSERT INTO "trucks"')).toBeLessThan(pos('INSERT INTO "drivers"'));
    expect(pos('INSERT INTO "drivers"')).toBeLessThan(pos('INSERT INTO "users"'));
    expect(pos('INSERT INTO "users"')).toBeLessThan(pos('INSERT INTO "trips"'));
  });

  it("los contadores de autoincremento van al final, después de los datos", () => {
    const { sql } = prepararRespaldoParaPrueba(DESORDENADO);
    expect(sql.indexOf("DELETE FROM sqlite_sequence")).toBeGreaterThan(sql.indexOf('INSERT INTO "trips"'));
  });

  it("empieza borrando las tablas que va a crear, las hijas antes que las padres: sirve para refrescar", () => {
    const { sql } = prepararRespaldoParaPrueba(DESORDENADO);
    const pos = (t: string) => sql.indexOf(`DROP TABLE IF EXISTS ${t};`);
    expect(pos("trips")).toBeLessThan(pos("users"));
    expect(pos("users")).toBeLessThan(pos("drivers"));
    expect(pos("drivers")).toBeLessThan(pos("trucks"));
    expect(sql.lastIndexOf("DROP TABLE")).toBeLessThan(sql.indexOf("CREATE TABLE"));
    expect(sql.indexOf("PRAGMA")).toBeLessThan(sql.indexOf("DROP TABLE"));
  });

  it("sólo borra tablas que el respaldo crea", () => {
    const { sql } = prepararRespaldoParaPrueba(DESORDENADO);
    const borradas = [...sql.matchAll(/DROP TABLE IF EXISTS (\w+);/g)].map((m) => m[1]).sort();
    expect(borradas).toEqual(["d1_migrations", "drivers", "trips", "trucks", "users"]);
  });

  it("una tabla que se referencia a sí misma no se queda esperándose", () => {
    const orden = tablasPorDependencia(
      partirInstrucciones("CREATE TABLE arbol (id INTEGER PRIMARY KEY, padre INTEGER REFERENCES arbol(id));"),
    );
    expect(orden).toEqual(["arbol"]);
  });

  it("un ciclo no cuelga ni pierde tablas", () => {
    const orden = tablasPorDependencia(
      partirInstrucciones(
        "CREATE TABLE a (b INTEGER REFERENCES b(id)); CREATE TABLE b (a INTEGER REFERENCES a(id)); CREATE TABLE c (x INTEGER);",
      ),
    );
    expect([...orden].sort()).toEqual(["a", "b", "c"]);
  });
});

describe("la traba: sólo se puede cargar en la base de prueba", () => {
  const { sql } = prepararRespaldoParaPrueba(RESPALDO);
  const instrucciones = partirInstrucciones(sql);

  it("la PRIMERA instrucción toca la tabla marca, antes de cualquier DROP", () => {
    expect(instrucciones[0]).toBe(TRABA_SOLO_PRUEBA);
    expect(instrucciones[0]).toContain(TABLA_MARCA);
    expect(instrucciones[0]).toMatch(/^INSERT OR REPLACE INTO _solo_prueba/);
    expect(sql.indexOf(TABLA_MARCA)).toBeLessThan(sql.indexOf("DROP TABLE"));
  });

  it("ninguna instrucción borra, vacía ni recrea la marca", () => {
    const tocan = instrucciones.filter((i) => i.toLowerCase().includes(TABLA_MARCA));
    expect(tocan).toEqual([TRABA_SOLO_PRUEBA]);
    expect(sql).not.toMatch(/DROP\s+TABLE[^;]*_solo_prueba/i);
    expect(sql).not.toMatch(/DELETE\s+FROM\s+_solo_prueba/i);
    expect(sql).not.toMatch(/CREATE\s+TABLE[^;]*_solo_prueba/i);
  });

  it("si el respaldo ya traía la marca (se respaldó la prueba), no se copia ni se borra", () => {
    const conMarca = `${RESPALDO}CREATE TABLE _solo_prueba (id INTEGER PRIMARY KEY CHECK (id = 1));\nINSERT INTO "_solo_prueba" ("id") VALUES(1);\n`;
    const salida = prepararRespaldoParaPrueba(conMarca).sql;
    expect(partirInstrucciones(salida).filter((i) => i.toLowerCase().includes(TABLA_MARCA))).toEqual([TRABA_SOLO_PRUEBA]);
  });

  it("pasar la salida de nuevo no duplica la traba", () => {
    expect(prepararRespaldoParaPrueba(sql).sql).toBe(sql);
  });

  it("no hay ninguna migración que cree la marca: producción no la tiene nunca", async () => {
    const { readdirSync, readFileSync } = await import("node:fs");
    for (const f of readdirSync("migrations").filter((n) => n.endsWith(".sql"))) {
      expect(readFileSync(`migrations/${f}`, "utf8")).not.toContain(TABLA_MARCA);
    }
  });
});

describe("lo que se rechaza", () => {
  it("algo que no es un respaldo de TSM", () => {
    expect(() => prepararRespaldoParaPrueba("SELECT 1;")).toThrow(/no parece un respaldo/);
  });

  it("la lista de lo que no se copia incluye siempre las suscripciones", () => {
    expect(TABLAS_QUE_NO_SE_COPIAN).toContain("push_subscriptions");
  });
});

describe("las tablas del sistema real", () => {
  it("toda tabla de las migraciones con endpoints o claves de dispositivo está en la lista", async () => {
    const { readdirSync, readFileSync } = await import("node:fs");
    const sospechosas = new Set<string>();
    for (const f of readdirSync("migrations").filter((n) => n.endsWith(".sql"))) {
      const texto = readFileSync(`migrations/${f}`, "utf8");
      for (const m of texto.matchAll(/CREATE TABLE(?: IF NOT EXISTS)?\s+(\w+)\s*\(([^;]*?)\);/gis)) {
        if (/\b(endpoint|p256dh)\b/i.test(m[2])) sospechosas.add(m[1].toLowerCase());
      }
    }
    expect([...sospechosas].filter((t) => !TABLAS_QUE_NO_SE_COPIAN.includes(t))).toEqual([]);
  });
});
