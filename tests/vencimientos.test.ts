import { describe, it, expect } from "vitest";
import { app } from "../api/app";
import { signToken } from "../api/lib/crypto";
import { ROLES } from "@shared/domain";
import {
  DIAS_PARA_AVISAR,
  avisosDeVencimientos,
  diasParaVencer,
  esDiaValido,
  estadoDeVencimiento,
  hoyEnUruguay,
  parseVencimientos,
  resumenDeVencimientos,
} from "@shared/vencimientos";

/**
 * Vencimientos de documentos de camiones y choferes.
 *
 * "Camiones: SOA, PERMISO PUERTO, APPLUS, STICKER. Choferes: PERMISO PUERTO, LIBRETA CONDUCIR,
 * CARNET DE SALUD." — Rodrigo. Lo que tiene que ser cierto: AVISA y no bloquea; sin fecha es "no
 * se sabe" y no "vencido"; una fecha es un DÍA (no se corre por la zona horaria); y guardar desde
 * una pantalla vieja no borra lo ya cargado.
 */

const HOY = "2026-09-28";

describe("el día de hoy en Uruguay", () => {
  it("a las 22 h de Uruguay todavía es el mismo día, aunque en UTC ya sea el siguiente", () => {
    // 22:30 en Uruguay = 01:30 UTC del día siguiente.
    expect(hoyEnUruguay(new Date("2026-09-29T01:30:00Z"))).toBe("2026-09-28");
  });
  it("a las 00:30 de Uruguay ya es el día nuevo", () => {
    expect(hoyEnUruguay(new Date("2026-09-28T03:30:00Z"))).toBe("2026-09-28");
    expect(hoyEnUruguay(new Date("2026-09-28T02:59:00Z"))).toBe("2026-09-27");
  });
});

describe("cuántos días faltan", () => {
  it("cuenta días de calendario, no instantes", () => {
    expect(diasParaVencer("2026-09-28", HOY)).toBe(0);
    expect(diasParaVencer("2026-09-29", HOY)).toBe(1);
    expect(diasParaVencer("2026-09-27", HOY)).toBe(-1);
    expect(diasParaVencer("2026-10-28", HOY)).toBe(30);
  });
  it("sin fecha, o con una fecha inválida, no se sabe (null): no es vencido", () => {
    expect(diasParaVencer(null, HOY)).toBeNull();
    expect(diasParaVencer("", HOY)).toBeNull();
    expect(diasParaVencer("mañana", HOY)).toBeNull();
    expect(diasParaVencer("2026-02-31", HOY)).toBeNull();
  });
  it("valida el día", () => {
    expect(esDiaValido("2026-02-28")).toBe(true);
    expect(esDiaValido("2026-02-31")).toBe(false);
    expect(esDiaValido("28/09/2026")).toBe(false);
  });
});

describe("estado de un vencimiento", () => {
  it("vencido, por vencer (hasta el umbral), vigente y sin fecha", () => {
    expect(estadoDeVencimiento("2026-09-27", HOY)).toBe("vencido");
    expect(estadoDeVencimiento("2026-09-28", HOY)).toBe("por_vencer");
    expect(estadoDeVencimiento("2026-10-28", HOY)).toBe("por_vencer");
    expect(estadoDeVencimiento("2026-10-29", HOY)).toBe("vigente");
    expect(estadoDeVencimiento(null, HOY)).toBe("sin_fecha");
  });
  it("el umbral es una constante con nombre", () => {
    expect(DIAS_PARA_AVISAR).toBe(30);
  });
});

describe("los avisos del Resumen", () => {
  const camiones = [
    { id: 1, plate: "GTP 4382", venc_soa: "2026-10-10", venc_sticker: "2026-09-20" },
    { id: 2, plate: "GTP 4383" }, // sin ningún dato
    { id: 3, plate: "GTP 4384", venc_applus: "2027-05-01" }, // vigente
  ];
  const choferes = [
    { id: 1, name: "Carlos Méndez", status: "activo", license_expiry: "2026-09-29", venc_carnet_salud: "" },
    { id: 2, name: "Ex chofer", status: "inactivo", license_expiry: "2026-01-01" },
  ];
  const avisos = avisosDeVencimientos({ camiones, choferes }, HOY);

  it("dice qué vence, de quién y cuándo, en criollo", () => {
    expect(avisos.map((a) => a.texto)).toEqual([
      "Sticker del GTP 4382 venció hace 8 días",
      "Libreta de conducir de Carlos Méndez vence mañana",
      "SOA del GTP 4382 vence en 12 días",
    ]);
  });
  it("los vencidos van primero", () => {
    expect(avisos[0].estado).toBe("vencido");
  });
  it("un camión sin datos, o al día, no es una noticia; un chofer dado de baja tampoco", () => {
    const quienes = avisos.map((a) => a.quien);
    expect(quienes).not.toContain("GTP 4383");
    expect(quienes).not.toContain("GTP 4384");
    expect(quienes).not.toContain("Ex chofer");
  });
  it("singular y hoy", () => {
    const uno = avisosDeVencimientos(
      { camiones: [{ id: 1, plate: "A", venc_soa: "2026-09-27", venc_applus: "2026-09-28" }], choferes: [] },
      HOY,
    ).map((a) => a.texto);
    expect(uno).toEqual(["SOA del A venció ayer", "APPLUS del A vence hoy"]);
  });
  it("cuenta para las marcas de las listas", () => {
    expect(resumenDeVencimientos(["2026-09-20", "2026-10-10", null, "2027-01-01"], HOY)).toEqual({
      vencidos: 1,
      porVencer: 1,
    });
  });
});

describe("las fechas que llegan al servidor", () => {
  const CAMPOS = ["venc_soa", "venc_applus"] as const;
  const ETQ = { venc_soa: "SOA", venc_applus: "APPLUS" };

  it("sólo devuelve las claves que vinieron", () => {
    expect(parseVencimientos({ venc_soa: "2026-10-01" }, CAMPOS, ETQ)).toEqual({ values: { venc_soa: "2026-10-01" } });
    expect(parseVencimientos({}, CAMPOS, ETQ)).toEqual({ values: {} });
  });
  it("una clave vacía borra la fecha", () => {
    expect(parseVencimientos({ venc_soa: "" }, CAMPOS, ETQ)).toEqual({ values: { venc_soa: null } });
  });
  it("una fecha mal escrita se rechaza y dice cuál", () => {
    expect(parseVencimientos({ venc_soa: "31/12/2026" }, CAMPOS, ETQ)).toEqual({ error: "SOA: la fecha no es válida." });
  });
});

// ── El servidor ──

const SECRET = "test-secret-tsm";

function fakeDB(role: string, escrituras: { sql: string; binds: unknown[] }[]) {
  return {
    prepare(sql: string) {
      const q = sql.replace(/\s+/g, " ").trim().toLowerCase();
      let binds: unknown[] = [];
      const stmt: any = {
        bind: (...b: unknown[]) => ((binds = b), stmt),
        first: async () => {
          if (q.includes("from users")) return { id: 2, role };
          if (q.includes("from drivers")) return { status: "activo", default_truck_id: 1 };
          return null;
        },
        all: async () => ({ results: [] }),
        run: async () => (escrituras.push({ sql: q, binds }), { meta: { last_row_id: 7 } }),
      };
      return stmt;
    },
    batch: async () => [],
  } as unknown as D1Database;
}

async function pedir(method: string, url: string, role: string, body?: unknown) {
  const escrituras: { sql: string; binds: unknown[] }[] = [];
  const token = await signToken(
    { id: 2, name: "X", role, driver_id: role === ROLES.CHOFER ? 1 : null, truck_id: null, email: null } as any,
    SECRET,
  );
  const res = await app.request(
    url,
    {
      method,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    { DB: fakeDB(role, escrituras), JWT_SECRET: SECRET } as any,
  );
  return { status: res.status, body: (await res.json().catch(() => null)) as any, escrituras };
}

const CAMION = { plate: "GTP 4382", brand: "", model: "", year: 2020, type: "", capacity_kg: 0, odometer_km: 0, avg_km_litro: 0 };
const escribeVenc = (e: { sql: string }[]) => e.filter((x) => /update trucks set venc_/.test(x.sql));

describe("PUT /api/trucks/:id — los vencimientos", () => {
  it("guarda los que vienen, y sólo esos", async () => {
    const r = await pedir("PUT", "/api/trucks/4", ROLES.ADMIN, { ...CAMION, venc_soa: "2026-12-01" });
    expect(r.status).toBe(200);
    const w = escribeVenc(r.escrituras);
    expect(w).toHaveLength(1);
    expect(w[0].sql).toBe("update trucks set venc_soa=? where id=?");
    expect(w[0].binds).toEqual(["2026-12-01", 4]);
  });

  it("guardar desde una pantalla vieja (sin los campos) no borra lo ya cargado", async () => {
    const r = await pedir("PUT", "/api/trucks/4", ROLES.ADMIN, CAMION);
    expect(r.status).toBe(200);
    expect(escribeVenc(r.escrituras)).toHaveLength(0);
  });

  it("una clave vacía borra esa fecha", async () => {
    const r = await pedir("PUT", "/api/trucks/4", ROLES.ADMIN, { ...CAMION, venc_sticker: "" });
    expect(escribeVenc(r.escrituras)[0].binds).toEqual([null, 4]);
  });

  it("una fecha inválida se rechaza sin escribir NADA (ni el resto del camión)", async () => {
    const r = await pedir("PUT", "/api/trucks/4", ROLES.ADMIN, { ...CAMION, venc_soa: "ayer" });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe("SOA: la fecha no es válida.");
    expect(r.escrituras).toHaveLength(0);
  });

  it("el lector no escribe y el chofer tampoco", async () => {
    for (const rol of [ROLES.LECTOR, ROLES.CHOFER]) {
      const r = await pedir("PUT", "/api/trucks/4", rol, { ...CAMION, venc_soa: "2026-12-01" });
      expect(r.status).toBe(403);
      expect(r.escrituras).toHaveLength(0);
    }
  });
});

describe("PUT /api/drivers/:id — los vencimientos", () => {
  const CHOFER = { name: "Carlos", document: "1", status: "activo" };

  it("guarda Permiso Puerto y Carnet de salud, y la libreta sigue por su camino", async () => {
    const r = await pedir("PUT", "/api/drivers/3", ROLES.ADMIN, {
      ...CHOFER,
      license_expiry: "2027-01-01",
      venc_permiso_puerto: "2026-11-01",
      venc_carnet_salud: "2026-12-01",
    });
    expect(r.status).toBe(200);
    const w = r.escrituras.find((x) => x.sql.startsWith("update drivers set venc_"));
    expect(w!.sql).toBe("update drivers set venc_permiso_puerto=?, venc_carnet_salud=? where id=?");
    expect(w!.binds).toEqual(["2026-11-01", "2026-12-01", 3]);
    expect(r.escrituras.find((x) => x.sql.startsWith("update drivers set name"))!.binds).toContain("2027-01-01");
  });

  it("sin los campos, no toca los vencimientos", async () => {
    const r = await pedir("PUT", "/api/drivers/3", ROLES.ADMIN, CHOFER);
    expect(r.status).toBe(200);
    expect(r.escrituras.some((x) => x.sql.startsWith("update drivers set venc_"))).toBe(false);
  });

  it("una fecha inválida se rechaza sin escribir nada", async () => {
    const r = await pedir("PUT", "/api/drivers/3", ROLES.ADMIN, { ...CHOFER, venc_carnet_salud: "x" });
    expect(r.status).toBe(400);
    expect(r.escrituras).toHaveLength(0);
  });
});

describe("GET /api/reports/vencimientos", () => {
  it("es de oficina: el lector y el chofer reciben 403", async () => {
    for (const rol of [ROLES.LECTOR, ROLES.CHOFER]) {
      expect((await pedir("GET", "/api/reports/vencimientos", rol)).status).toBe(403);
    }
  });
  it("la oficina lo ve, con el umbral y sin avisos si no hay nada cargado", async () => {
    const r = await pedir("GET", "/api/reports/vencimientos", ROLES.ENCARGADO);
    expect(r.status).toBe(200);
    expect(r.body.data.avisos).toEqual([]);
    expect(r.body.data.dias_para_avisar).toBe(30);
  });
});

describe("GET /api/reports/alerts — Control usa el mismo criterio que el Resumen", () => {
  it("una libreta a 45 días NO figura (el umbral es el de siempre, 30), y a 20 sí", async () => {
    const hoy = hoyEnUruguay();
    const en = (dias: number) => new Date(Date.parse(hoy + "T00:00:00Z") + dias * 86_400_000).toISOString().slice(0, 10);
    const filas: Record<string, unknown[]> = {
      "from drivers d": [
        { id: 1, name: "A 45 días", status: "activo", license_expiry: en(45) },
        { id: 2, name: "B 20 días", status: "activo", license_expiry: en(20) },
      ],
      "from trucks": [{ id: 1, plate: "GTP 1", venc_soa: en(5) }],
    };
    const token = await signToken(
      { id: 2, name: "X", role: ROLES.ADMIN, driver_id: null, truck_id: null, email: null } as any,
      SECRET,
    );
    const db = {
      prepare(sql: string) {
        const q = sql.replace(/\s+/g, " ").trim().toLowerCase();
        const stmt: any = {
          bind: () => stmt,
          first: async () => (q.includes("from users") ? { id: 2, role: ROLES.ADMIN } : null),
          all: async () => ({ results: Object.entries(filas).find(([k]) => q.includes(k))?.[1] ?? [] }),
          run: async () => ({ meta: {} }),
        };
        return stmt;
      },
      batch: async () => [],
    } as unknown as D1Database;
    const res = await app.request(
      "/api/reports/alerts",
      { headers: { authorization: `Bearer ${token}` } },
      { DB: db, JWT_SECRET: SECRET } as any,
    );
    const data = ((await res.json()) as any).data;
    expect(data.vencimientos.map((v: any) => v.texto)).toEqual([
      "SOA del GTP 1 vence en 5 días",
      "Libreta de conducir de B 20 días vence en 20 días",
    ]);
    // La clave vieja sigue, con la misma cuenta, para una pestaña de Control abierta antes del deploy.
    expect(data.expiringLicenses.map((l: any) => l.name)).toEqual(["B 20 días"]);
  });
});
