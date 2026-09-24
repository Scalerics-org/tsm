import { describe, it, expect } from "vitest";
import { app } from "../api/app";
import { signToken } from "../api/lib/crypto";
import { ROLES } from "@shared/domain";

/**
 * El tilde de "ya chequeé esta boleta".
 *
 * "Yo voy a tener que chequear todos los litros que ellos echan con la factura." Los litros
 * los tipea el chofer y son el único número de la surtida que puede mover a mano: los km los
 * respalda la foto del tacógrafo, pero anotar 250 donde cargó 300 lo lleva de 2,7 a 3,2 km/L
 * sin que nada se note. La foto de la boleta ya se guardaba; lo que faltaba era dónde dejar
 * constancia de que alguien la miró.
 *
 * Las dos cosas que tienen que ser ciertas para que la marca signifique algo: que sólo la
 * ponga la oficina, y que corregir los números la borre.
 */

const SECRET = "test-secret-tsm";

const SURTIDA = {
  id: 7,
  truck_id: 1,
  driver_id: 1,
  trip_id: null,
  odometer_km: 367_106,
  liters: 300,
  liters_tanque1: 150,
  liters_tanque2: 150,
  is_full: 1,
  r2_key: "fuel/1/tacografo-1.jpg",
  r2_key_boleta: "fuel/1/boleta-1.jpg",
  logged_at: "2026-09-01 12:00:00",
  edited_by: null,
  edited_at: null,
  verificado_by: null,
  verificado_at: null,
  truck_plate: "GTP 4382",
  driver_name: "Carlos Méndez",
  verificado_por: null,
};

/** Anota cada escritura con sus binds, que es lo que hay que poder afirmar acá. */
function fakeDB(
  escrituras: { sql: string; binds: unknown[] }[],
  surtida: unknown = SURTIDA,
  role: string = ROLES.ENCARGADO,
) {
  return {
    prepare(sql: string) {
      let binds: unknown[] = [];
      const stmt = {
        bind: (...b: unknown[]) => {
          binds = b;
          return stmt;
        },
        first: async () => {
          const q = sql.toLowerCase();
          // El rol se relee de la base en cada pedido (ver `usuarioDeOficina`); tiene que
          // coincidir con el del token que firma `pedir`.
          if (q.includes("from users")) return { id: 2, role };
          if (q.includes("from fuel_logs")) return surtida;
          // El chofer se relee en cada pedido para saber si sigue activo; sin esta fila, lo
          // que frena al chofer sería la baja y no el permiso, que es lo que se está probando.
          if (q.includes("from drivers")) return { status: "activo", default_truck_id: 1 };
          return null;
        },
        all: async () => ({ results: surtida ? [surtida] : [] }),
        run: async () => {
          escrituras.push({ sql: sql.replace(/\s+/g, " ").trim().toLowerCase(), binds });
          return { meta: {} };
        },
      };
      return stmt;
    },
  } as unknown as D1Database;
}

const token = (role: string, id = 2) =>
  signToken({ id, name: "Quien sea", role, driver_id: 1, truck_id: 1, email: null } as any, SECRET);

async function pedir(url: string, rol: string, body: unknown, method = "PUT", surtida: unknown = SURTIDA) {
  const escrituras: { sql: string; binds: unknown[] }[] = [];
  const res = await app.request(
    url,
    {
      method,
      headers: { authorization: `Bearer ${await token(rol)}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    },
    { DB: fakeDB(escrituras, surtida, rol), JWT_SECRET: SECRET } as any,
  );
  return { status: res.status, escrituras };
}

/** La escritura del tilde, con sus dos binds: quién y cuándo. */
const tilde = (escrituras: { sql: string; binds: unknown[] }[]) =>
  escrituras.find((e) => e.sql.includes("set verificado_by"));

describe("tildar una surtida como verificada", () => {
  it("la marca con quién la miró y cuándo", async () => {
    const { status, escrituras } = await pedir("/api/fuel/7/verificado", ROLES.ENCARGADO, { verificado: true });
    expect(status).toBe(200);
    const w = tilde(escrituras);
    expect(w?.binds[0]).toBe(2);
    expect(w?.binds[1]).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    expect(w?.binds[2]).toBe(7);
  });

  it("se puede destildar: alguien tildó la fila de al lado", async () => {
    const { status, escrituras } = await pedir("/api/fuel/7/verificado", ROLES.ADMIN, { verificado: false });
    expect(status).toBe(200);
    expect(tilde(escrituras)?.binds.slice(0, 2)).toEqual([null, null]);
  });

  it("sin cuerpo se entiende que la están tildando", async () => {
    const { status, escrituras } = await pedir("/api/fuel/7/verificado", ROLES.ENCARGADO, {});
    expect(status).toBe(200);
    expect(tilde(escrituras)?.binds[0]).toBe(2);
  });

  it("el chofer no puede: la marca es el control de la oficina sobre lo que él carga", async () => {
    const { status, escrituras } = await pedir("/api/fuel/7/verificado", ROLES.CHOFER, { verificado: true });
    expect(status).toBe(403);
    expect(escrituras).toHaveLength(0);
  });

  it("una surtida que no existe no se tilda", async () => {
    const { status, escrituras } = await pedir(
      "/api/fuel/999/verificado",
      ROLES.ENCARGADO,
      { verificado: true },
      "PUT",
      null,
    );
    expect(status).toBe(404);
    expect(escrituras).toHaveLength(0);
  });
});

describe("corregir una surtida verificada", () => {
  /**
   * Lo importante de todo esto. "Verificada" dice que alguien miró la boleta contra ESTOS
   * números; si los números cambian, la marca pasaría a respaldar algo que nadie miró.
   */
  it("le borra la verificación", async () => {
    const { status, escrituras } = await pedir("/api/fuel/7", ROLES.ENCARGADO, {
      odometer_km: 367_500,
      liters_tanque1: 150,
      liters_tanque2: 150,
    });
    expect(status).toBe(200);
    const update = escrituras.find((e) => e.sql.includes("update fuel_logs"));
    expect(update?.sql).toContain("verificado_by = null");
    expect(update?.sql).toContain("verificado_at = null");
  });

  it("tildar NO la marca como corregida: no cambia ningún número", async () => {
    const { escrituras } = await pedir("/api/fuel/7/verificado", ROLES.ENCARGADO, { verificado: true });
    expect(tilde(escrituras)?.sql).not.toContain("edited_by");
  });
});
