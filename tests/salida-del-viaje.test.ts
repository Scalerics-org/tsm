import { describe, expect, it } from "vitest";
import { kmEstimados } from "@shared/distancias";
import { LOCALIDADES_DE_SALIDA, sabeMedirDesde, salidaValida } from "@shared/salida";
import { paraVacios, vaciosEntreViajes } from "@shared/vacios";

/**
 * Desde dónde salió el camión a buscar la carga.
 *
 * "Somos de base Bella Unión, pero es variable." (Rodrigo, 10/10). Los 130 km de Bella Unión a Artigas son un
 * vacío que la app no veía: el viaje dice que carga en Artigas y no hay dato de dónde estaba el camión.
 */

describe("la lista de salidas", () => {
  it("las más usadas van primero y el resto alfabético", () => {
    expect(LOCALIDADES_DE_SALIDA.slice(0, 4)).toEqual(["Bella Unión", "Artigas", "Montevideo", "Salto"]);
    const resto = LOCALIDADES_DE_SALIDA.slice(4);
    expect(resto).toEqual([...resto].sort((a, b) => a.localeCompare(b, "es")));
  });

  it("todas las que se ofrecen las sabe medir la app (si no, el vacío quedaría sin km)", () => {
    for (const l of LOCALIDADES_DE_SALIDA) expect(sabeMedirDesde(l), l).toBe(true);
  });
});

describe("salidaValida", () => {
  it("reconoce el nombre sin importar mayúsculas ni acentos", () => {
    expect(salidaValida("bella union")).toBe("Bella Unión");
    expect(salidaValida("BELLA UNIÓN")).toBe("Bella Unión");
    expect(salidaValida("  Mdeo ")).toBe("Montevideo");
    expect(salidaValida("paysandu")).toBe("Paysandú");
  });

  it("reconoce el departamento de una capital: Lavalleja es Minas", () => {
    expect(salidaValida("Lavalleja")).toBe("Minas");
    expect(salidaValida("Río Negro")).toBe("Fray Bentos");
    expect(salidaValida("Colonia")).toBe("Colonia del Sacramento");
  });

  it("lo que no está en la lista no es una salida: «Otra», vacío, una estancia, cualquier cosa", () => {
    for (const x of ["Otra", "", "  ", "Estancia La Paz", null, undefined, 42, {}]) {
      expect(salidaValida(x)).toBeNull();
    }
  });
});

describe("los vacíos con la salida real", () => {
  const viaje = (id: number, dia: string, extra: Record<string, unknown> = {}) =>
    paraVacios({
      id,
      started_at: `2026-10-${dia} 08:00:00`,
      origin: "Artigas",
      destination: "Montevideo",
      kilometros: 627,
      segments: [],
      ...extra,
    });

  const km = (a: string, b: string) => kmEstimados(a, b) as number;

  it("sin salida, todo igual que antes: un retorno Montevideo → Artigas con los km del viaje", () => {
    const t = vaciosEntreViajes([viaje(1, "01"), viaje(2, "05")]);
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ desde: "Montevideo", hasta: "Artigas", km: 627, tipo: "retorno" });
  });

  it("saliendo de Bella Unión aparecen los 130 km: Montevideo → Bella Unión y Bella Unión → Artigas", () => {
    const t = vaciosEntreViajes([viaje(1, "01"), viaje(2, "05", { salida_desde: "Bella Unión" })]);
    expect(t.map((x) => [x.desde, x.hasta, x.km, x.tipo])).toEqual([
      ["Montevideo", "Bella Unión", km("Montevideo", "Bella Unión"), "reposicion"],
      ["Bella Unión", "Artigas", km("Bella Unión", "Artigas"), "reposicion"],
    ]);
    expect(km("Bella Unión", "Artigas")).toBeGreaterThan(100);
    expect(t.every((x) => x.despues_de === 1 && x.antes_de === 2)).toBe(true);
  });

  it("el escrito a mano en minúsculas también sirve", () => {
    const t = vaciosEntreViajes([viaje(1, "01"), viaje(2, "05", { salida_desde: "bella unión" })]);
    expect(t).toHaveLength(2);
  });

  it("si sale del mismo lugar de carga, es como si no hubiera dicho nada", () => {
    const sin = vaciosEntreViajes([viaje(1, "01"), viaje(2, "05")]);
    const con = vaciosEntreViajes([viaje(1, "01"), viaje(2, "05", { salida_desde: "Artigas" })]);
    expect(con).toEqual(sin);
  });

  it("si sale de donde terminó el viaje anterior, también", () => {
    const sin = vaciosEntreViajes([viaje(1, "01"), viaje(2, "05")]);
    const con = vaciosEntreViajes([viaje(1, "01"), viaje(2, "05", { salida_desde: "Montevideo" })]);
    expect(con).toEqual(sin);
  });

  it("cada tramo tiene su piso de 70 km: salir de Canelones, a pocos km de Montevideo, no suma el primero", () => {
    const t = vaciosEntreViajes([viaje(1, "01"), viaje(2, "05", { salida_desde: "Canelones" })]);
    expect(km("Montevideo", "Canelones")).toBeLessThan(70);
    expect(t.map((x) => [x.desde, x.hasta])).toEqual([["Canelones", "Artigas"]]);
  });

  it("una salida que la lista no conoce se ignora: no inventa tramos", () => {
    const sin = vaciosEntreViajes([viaje(1, "01"), viaje(2, "05")]);
    const con = vaciosEntreViajes([viaje(1, "01"), viaje(2, "05", { salida_desde: "Estancia La Paz" })]);
    expect(con).toEqual(sin);
  });

  it("la salida es del viaje que sale: no mueve los tramos de los demás", () => {
    const t = vaciosEntreViajes([viaje(1, "01"), viaje(2, "05", { salida_desde: "Bella Unión" }), viaje(3, "09")]);
    expect(t.filter((x) => x.antes_de === 3)).toEqual([
      expect.objectContaining({ desde: "Montevideo", hasta: "Artigas", tipo: "retorno", km: 627 }),
    ]);
  });
});
