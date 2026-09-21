import { describe, it, expect } from "vitest";
import { litrosTipeados, LITROS_MAX_POR_CARGA } from "../shared/litros";

/**
 * "Depende de los celulares: en los litros de gasoil que ellos ingresan, ponerle lo mismo que
 * con los kilos, un formato solo. Por la coma, por los decimales. Echan 290 con 44 y no le
 * ponen la coma. Después de las tres cifras siempre tiene que ser la coma, porque nunca he
 * cargado 500 mil." — Rodrigo, 21/9/2026.
 *
 * Hay teclados numéricos de Android que no traen coma: el chofer escribe 29044 queriendo decir
 * 290,44, y se guardaban veintinueve mil litros.
 */
describe("litrosTipeados", () => {
  it("después de la tercera cifra va la coma", () => {
    expect(litrosTipeados("29044")).toEqual({ mostrado: "290,44", valor: 290.44 });
  });

  it("hasta tres cifras es un entero", () => {
    expect(litrosTipeados("280")).toEqual({ mostrado: "280", valor: 280 });
    expect(litrosTipeados("85")).toEqual({ mostrado: "85", valor: 85 });
  });

  it("si el teclado sí tiene coma o punto, se respeta lo que escribió", () => {
    expect(litrosTipeados("85,5")).toEqual({ mostrado: "85,5", valor: 85.5 });
    expect(litrosTipeados("194.7")).toEqual({ mostrado: "194,7", valor: 194.7 });
  });

  it("dos decimales como máximo, y nada que no sea número", () => {
    expect(litrosTipeados("2904455")).toEqual({ mostrado: "290,44", valor: 290.44 });
    expect(litrosTipeados("2a9b0")).toEqual({ mostrado: "290", valor: 290 });
  });

  it("vacío es sin dato, no cero", () => {
    expect(litrosTipeados("")).toEqual({ mostrado: "", valor: null });
  });

  it("mientras escribe la coma sola no rompe", () => {
    expect(litrosTipeados("290,")).toEqual({ mostrado: "290,", valor: 290 });
  });

  it("el tope es menos de mil litros por carga", () => {
    expect(LITROS_MAX_POR_CARGA).toBe(999.99);
  });
});

import { app } from "../api/app";
import { signToken } from "../api/lib/crypto";
import { ROLES } from "@shared/domain";

describe("el servidor frena un tanque de mil litros o más", () => {
  it("POST /api/fuel con 29044 en un tanque → 400", async () => {
    const SECRET = "test-secret-tsm";
    const db = {
      prepare(sql: string) {
        const q = sql.toLowerCase();
        const stmt = {
          bind: () => stmt,
          first: async () => (q.includes("from drivers") ? { status: "activo", default_truck_id: 1 } : null),
          all: async () => ({ results: [] }),
          run: async () => ({ meta: { last_row_id: 1 } }),
        };
        return stmt;
      },
    } as unknown as D1Database;
    const fd = new FormData();
    fd.append("odometer_km", "450000");
    fd.append("liters_tanque1", "29044");
    fd.append("is_full", "true");
    const token = await signToken({ id: 9, name: "Chofer", role: ROLES.CHOFER, driver_id: 1, truck_id: 1, email: null } as any, SECRET);
    const res = await app.request("/api/fuel", { method: "POST", headers: { authorization: `Bearer ${token}` }, body: fd }, { DB: db, JWT_SECRET: SECRET } as any);
    expect(res.status).toBe(400);
    expect(((await res.json()) as any).error).toMatch(/coma/);
  });
});
