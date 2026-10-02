import { describe, it, expect } from "vitest";
import { app } from "../api/app";
import { signToken } from "../api/lib/crypto";
import { ROLES } from "@shared/domain";
import { esMes, mesDe, rangoDelMes } from "../shared/periodo-mes";
import { paraVacios, tramosDelPeriodo, vaciosDelPeriodo } from "../shared/vacios";
import { viajeBase } from "./helpers/fake-d1-facturacion";

/**
 * La ficha del camión por mes. Lo que se fija: el mes se filtra en el servidor con la MISMA regla de días que
 * el resto, cada tramo vacío cuenta en el mes en que arranca el viaje siguiente, y los km vacíos de un mes en
 * la ficha son los mismos que los del Resumen filtrado a ese mes para ese camión.
 */

const SECRET = "test-secret-tsm";

describe("el mes como período", () => {
  it("reconoce un mes bien escrito y nada más", () => {
    expect(esMes("2026-09")).toBe(true);
    for (const malo of ["2026-9", "2026-13", "2026-00", "septiembre", "2026-09-01", "", null, undefined, 202609]) {
      expect(esMes(malo)).toBe(false);
    }
  });
  it("del primer al último día, con febrero bisiesto y diciembre", () => {
    expect(rangoDelMes("2026-09")).toEqual({ desde: "2026-09-01", hasta: "2026-09-30" });
    expect(rangoDelMes("2026-10")).toEqual({ desde: "2026-10-01", hasta: "2026-10-31" });
    expect(rangoDelMes("2026-02")).toEqual({ desde: "2026-02-01", hasta: "2026-02-28" });
    expect(rangoDelMes("2028-02")).toEqual({ desde: "2028-02-01", hasta: "2028-02-29" });
    expect(rangoDelMes("2026-12")).toEqual({ desde: "2026-12-01", hasta: "2026-12-31" });
    expect(rangoDelMes("nada")).toBeNull();
  });
  it("el mes de una fecha guardada es el día UTC, como en el resto", () => {
    expect(mesDe("2026-09-30 23:30:00")).toBe("2026-09");
    expect(mesDe("2026-10-01 00:10:00")).toBe("2026-10");
  });
});

// Un camión que va y viene entre Montevideo y Artigas, con un viaje a Salto en el medio.
const viajes = [
  viajeBase({ id: 1, truck_id: 1, started_at: "2026-08-28 08:00:00", origin: "Montevideo", destination: "Artigas", kilometros: 600, kilos: 1000 }),
  // Vuelve a cargar a Montevideo: retorno del viaje 1 (el mismo km que el viaje). Cuenta en SETIEMBRE (arranca el 2/9).
  viajeBase({ id: 2, truck_id: 1, started_at: "2026-09-02 08:00:00", origin: "Montevideo", destination: "Artigas", kilometros: 600, kilos: 2000 }),
  // Va a buscar carga a Salto: reposición, también en setiembre.
  viajeBase({ id: 3, truck_id: 1, started_at: "2026-09-10 08:00:00", origin: "Salto", destination: "Montevideo", kilometros: 500, kilos: 4000 }),
  // Octubre: otra reposición, que NO es de setiembre.
  viajeBase({ id: 4, truck_id: 1, started_at: "2026-10-03 08:00:00", origin: "Rivera", destination: "Rivera", kilometros: 10, kilos: 8000 }),
  // Cancelado: no se hizo, no parte la cadena ni suma kilos.
  viajeBase({ id: 5, truck_id: 1, started_at: "2026-09-20 08:00:00", origin: "Rocha", destination: "Rocha", status: "CANCELADO", kilos: 99999 }),
] as any[];

const mismos = viajes.filter((v) => v.status !== "CANCELADO").map(paraVacios);

describe("tramosDelPeriodo", () => {
  it("cada tramo lleva el día del viaje siguiente y cuenta en ese mes", () => {
    const todos = tramosDelPeriodo(mismos);
    const setiembre = tramosDelPeriodo(mismos, "2026-09-01", "2026-09-30");
    expect(todos.length).toBeGreaterThan(setiembre.length);
    expect(setiembre.map((t) => t.fecha)).toEqual(["2026-09-02", "2026-09-10"]);
    // El tramo del borde (viaje 1 de agosto → viaje 2 de setiembre) cuenta en setiembre, no en agosto.
    expect(setiembre.map((t) => t.antes_de)).toEqual([2, 3]);
  });
  it("vaciosDelPeriodo (el Resumen) da exactamente la suma de los tramos del período", () => {
    const tramos = tramosDelPeriodo(mismos, "2026-09-01", "2026-09-30");
    const r = vaciosDelPeriodo(mismos, "2026-09-01", "2026-09-30");
    expect(r.km_retorno).toBe(tramos.filter((t) => t.tipo === "retorno").reduce((s, t) => s + (t.km ?? 0), 0));
    expect(r.km_reposicion).toBe(tramos.filter((t) => t.tipo === "reposicion").reduce((s, t) => s + (t.km ?? 0), 0));
    expect(r.tramos).toBe(tramos.length);
  });
});

/** Una base que sirve el camión y sus viajes, para pedir la ficha y el Resumen a las rutas de verdad. */
function dbDelCamion() {
  const camion = { id: 1, plate: "GTP 4383", brand: "", model: "", year: 2020, type: "", odometer_km: 1000, avg_km_litro: 3, camara_frio: 0 };
  return {
    prepare(sql: string) {
      const q = sql.replace(/\s+/g, " ").trim().toLowerCase();
      const stmt: any = {
        bind: () => stmt,
        first: async () => {
          if (q.includes("from users")) return { id: 2, role: "admin" };
          if (q.includes("from trucks")) return camion;
          return null;
        },
        all: async () => {
          if (q.includes("from trucks")) return { results: [camion] };
          if (q.includes("from trips t")) return { results: viajes };
          return { results: [] };
        },
        run: async () => ({ meta: {} }),
      };
      return stmt;
    },
    batch: async () => [],
  } as unknown as D1Database;
}

async function pedir(ruta: string) {
  const token = await signToken({ id: 2, name: "Oficina", role: ROLES.ADMIN, driver_id: null, truck_id: null, email: null } as any, SECRET);
  const res = await app.request(ruta, { headers: { authorization: `Bearer ${token}` } }, { DB: dbDelCamion(), JWT_SECRET: SECRET } as any);
  return { status: res.status, data: ((await res.json()) as any).data };
}

describe("GET /reports/truck/:id?mes=", () => {
  it("con un mes filtra viajes, vacíos y kilos en el servidor; sin mes trae todo", async () => {
    const todo = await pedir("/api/reports/truck/1");
    const setiembre = await pedir("/api/reports/truck/1?mes=2026-09");
    expect(setiembre.status).toBe(200);
    expect(setiembre.data.periodo).toEqual({ mes: "2026-09", desde: "2026-09-01", hasta: "2026-09-30" });
    // Viajes del mes: los dos de setiembre y el cancelado de setiembre (se ve, pero no suma kilos).
    expect(setiembre.data.trips.map((t: any) => t.id).sort()).toEqual([2, 3, 5]);
    expect(setiembre.data.viajes_total).toBe(3);
    expect(setiembre.data.tons).toBe(6000); // 2000 + 4000: sin el cancelado ni los de otros meses
    expect(setiembre.data.vacios.map((t: any) => t.fecha)).toEqual(["2026-09-10", "2026-09-02"]); // el más nuevo primero
    expect(todo.data.periodo.mes).toBeNull();
    expect(todo.data.viajes_total).toBe(5);
    expect(todo.data.tons).toBe(15000); // 1000+2000+4000+8000
    expect(todo.data.km_vacios).toBeGreaterThan(setiembre.data.km_vacios);
  });

  it("los meses con actividad, del más nuevo al más viejo", async () => {
    expect((await pedir("/api/reports/truck/1")).data.meses).toEqual(["2026-10", "2026-09", "2026-08"]);
  });

  it("retorno y 'a buscar carga' por separado, y suman el total", async () => {
    const { data } = await pedir("/api/reports/truck/1?mes=2026-09");
    expect(data.km_retorno).toBeGreaterThan(0);
    expect(data.km_reposicion).toBeGreaterThan(0);
    expect(data.km_retorno + data.km_reposicion).toBe(data.km_vacios);
  });

  it("los km vacíos de setiembre en la ficha son los mismos que 'Retornos' y 'A buscar carga' del Resumen del 1/9 al 30/9", async () => {
    const ficha = (await pedir("/api/reports/truck/1?mes=2026-09")).data;
    const resumen = (await pedir("/api/reports/summary?from=2026-09-01&to=2026-09-30")).data;
    const fila = resumen.byTruck.find((t: any) => t.truck_id === 1);
    expect(Math.round(ficha.km_retorno)).toBe(fila.km_retorno);
    expect(Math.round(ficha.km_reposicion)).toBe(fila.km_reposicion);
    expect(ficha.vacios.length).toBe(fila.tramos_vacios);
  });

  it("el Resumen respeta el rango: octubre no trae lo de setiembre", async () => {
    const octubre = (await pedir("/api/reports/summary?from=2026-10-01&to=2026-10-31")).data.byTruck.find((t: any) => t.truck_id === 1);
    const setiembre = (await pedir("/api/reports/summary?from=2026-09-01&to=2026-09-30")).data.byTruck.find((t: any) => t.truck_id === 1);
    expect(octubre.tramos_vacios).toBe(1);
    expect(setiembre.tramos_vacios).toBe(2);
  });

  it("un mes mal escrito se ignora y trae todo, sin romper", async () => {
    const r = await pedir("/api/reports/truck/1?mes=septiembre");
    expect(r.status).toBe(200);
    expect(r.data.periodo.mes).toBeNull();
  });
});
