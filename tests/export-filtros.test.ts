import { describe, it, expect } from "vitest";
import { app } from "../api/app";
import { signToken } from "../api/lib/crypto";
import { ROLES, TRIP_STATUS } from "@shared/domain";

/**
 * El Excel baja lo que muestra la pantalla.
 *
 * En Viajes se filtra por cliente, chofer, camión y estado, pero el botón de exportar mandaba
 * sólo `from` y `to`: la oficina filtraba los 8 viajes de un chofer, exportaba, y le bajaban
 * los 300 del mes. Como el archivo no dice con qué filtros salió, eso no se nota hasta que
 * alguien puntea el Excel contra la pantalla.
 *
 * El test no mira el CSV: mira que los filtros lleguen al WHERE. Es donde se perdían.
 */

const SECRET = "test-secret-tsm";

interface Consulta {
  sql: string;
  binds: unknown[];
}

function fakeDB(registro: Consulta[]) {
  return {
    prepare(sql: string) {
      const consulta: Consulta = { sql, binds: [] };
      registro.push(consulta);
      const stmt = {
        bind: (...b: unknown[]) => {
          consulta.binds = b;
          return stmt;
        },
        first: async () => null,
        all: async () => ({ results: [] }),
        run: async () => ({ meta: {} }),
      };
      return stmt;
    },
    batch: async () => [],
  } as unknown as D1Database;
}

async function exportar(query: string) {
  const registro: Consulta[] = [];
  const token = await signToken(
    { id: 2, name: "Oficina", role: ROLES.ENCARGADO, driver_id: null, truck_id: null, email: null } as any,
    SECRET,
  );
  const res = await app.request(
    `/api/reports/trips.csv${query}`,
    { headers: { authorization: `Bearer ${token}` } },
    { DB: fakeDB(registro), JWT_SECRET: SECRET } as any,
  );
  const viajes = registro.find((x) => x.sql.includes("FROM trips"));
  return { status: res.status, sql: viajes?.sql ?? "", binds: viajes?.binds ?? [] };
}

describe("GET /api/reports/trips.csv respeta los filtros de la pantalla", () => {
  it("el chofer", async () => {
    const { sql, binds } = await exportar("?driver=3");
    expect(sql).toContain("t.driver_id = ?");
    expect(binds).toContain(3);
  });

  it("el camión", async () => {
    const { sql, binds } = await exportar("?truck=7");
    expect(sql).toContain("t.truck_id = ?");
    expect(binds).toContain(7);
  });

  it("el estado", async () => {
    const { sql, binds } = await exportar(`?status=${TRIP_STATUS.COMPLETADO}`);
    expect(sql).toContain("t.status = ?");
    expect(binds).toContain(TRIP_STATUS.COMPLETADO);
  });

  it("y los cuatro juntos con el período, que es como se usa", async () => {
    const { status, sql, binds } = await exportar(
      "?provider=Casarone&driver=3&truck=7&status=COMPLETADO&from=2026-08-01&to=2026-08-31",
    );
    expect(status).toBe(200);
    for (const cond of ["t.provider_name = ?", "t.driver_id = ?", "t.truck_id = ?", "t.status = ?"]) {
      expect(sql).toContain(cond);
    }
    expect(binds).toEqual(expect.arrayContaining(["Casarone", 3, 7, "COMPLETADO", "2026-08-01", "2026-08-31"]));
  });

  /**
   * Control: sin filtros no se cuela ningún WHERE inventado. Si esto fallara, el Excel sin
   * filtrar estaría bajando de menos, que es peor que bajar de más.
   */
  it("sin filtros baja todo", async () => {
    const { sql, binds } = await exportar("");
    expect(sql).not.toContain("WHERE");
    expect(binds).toEqual([]);
  });
});
