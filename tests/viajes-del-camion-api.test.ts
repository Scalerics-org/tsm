import { describe, it, expect } from "vitest";
import { app } from "../api/app";
import { signToken } from "../api/lib/crypto";
import { ROLES } from "@shared/domain";

/**
 * "Esos 4 viajes tendría que ver el 4383, porque ese camión hace solo eso." — Rodrigo, 16/9.
 * La lista del camión se aplica donde el chofer ve los viajes y donde arranca uno.
 */

const SECRET = "test-secret-tsm";

const plantilla = (id: number, truck_ids = "") => ({
  id, provider_id: 1, provider_name: "UAM", name: `Viaje ${id}`, origin: "Mdeo", destinations: "[]",
  cargo_type: "", fields: "[]", active: 1, truck_ids, dest_options: "[]",
});

function fakeDB(lista: number[]) {
  return {
    prepare(sql: string) {
      const q = sql.toLowerCase();
      const stmt = {
        bind: () => stmt,
        first: async () => {
          if (q.includes("from drivers")) return { status: "activo", default_truck_id: 2 };
          return null;
        },
        all: async () => {
          if (q.includes("from camion_plantillas")) return { results: lista.map((template_id) => ({ template_id })) };
          if (q.includes("from trip_templates")) return { results: [plantilla(5), plantilla(10), plantilla(18, "3"), plantilla(22)] };
          return { results: [] };
        },
        run: async () => ({ meta: {} }),
      };
      return stmt;
    },
  } as unknown as D1Database;
}

async function viajesQueVe(lista: number[]) {
  const token = await signToken({ id: 9, name: "Chofer", role: ROLES.CHOFER, driver_id: 1, truck_id: 2, email: null } as any, SECRET);
  const res = await app.request("/api/templates", { headers: { authorization: `Bearer ${token}` } }, { DB: fakeDB(lista), JWT_SECRET: SECRET } as any);
  const body = (await res.json()) as any;
  return body.data.map((t: any) => t.id).sort((a: number, b: number) => a - b);
}

describe("GET /api/templates con la lista del camión", () => {
  it("sin lista, el chofer ve lo de todos y no lo de otro camión", async () => {
    expect(await viajesQueVe([])).toEqual([5, 10, 22]);
  });

  it("con lista, ve sólo su lista, incluida la que era de otro camión", async () => {
    expect(await viajesQueVe([5, 18, 22])).toEqual([5, 18, 22]);
  });
});
