import { describe, expect, it } from "vitest";
import { TRIP_STATUS } from "@shared/domain";
import { kmEstimados } from "@shared/distancias";
import { csvDelPlan, planDeRecalculo, sqlDelPlan, type ViajeParaRecalcular } from "@shared/recalculo-km";

/**
 * El recálculo de setiembre: sólo se tocan los km que estimó la app con la regla vieja, y se ve el antes y el
 * después de cada uno. Nada de esto escribe en una base.
 */

const directo = (a: string, b: string) => kmEstimados(a, b) as number;
const ARTIGAS_MDEO = directo("Artigas", "Montevideo");
const POR_SALTO = directo("Artigas", "Salto") + directo("Salto", "Montevideo");

const viaje = (extra: Partial<ViajeParaRecalcular> = {}): ViajeParaRecalcular => ({
  id: 1,
  started_at: "2026-09-10 08:00:00",
  patente: "GTP 4326",
  status: TRIP_STATUS.COMPLETADO,
  origin: "Artigas",
  destination: "Montevideo",
  kilometros: ARTIGAS_MDEO, // lo que estimó la regla vieja al cerrar
  segments: [],
  descargas: [{ departamento: "Salto" }, { departamento: "Montevideo" }],
  pide_kilometros: false,
  edited_by: null,
  ...extra,
});

describe("planDeRecalculo", () => {
  it("un viaje con km estimado por la regla vieja y una descarga en el medio se recalcula", () => {
    const { cambios, noTocados } = planDeRecalculo([viaje()]);
    expect(noTocados).toEqual([]);
    expect(cambios).toEqual([
      {
        id: 1,
        fecha: "2026-09-10",
        patente: "GTP 4326",
        recorrido: "Artigas > Salto > Montevideo",
        antes: ARTIGAS_MDEO,
        despues: POR_SALTO,
        diferencia: POR_SALTO - ARTIGAS_MDEO,
        editado_por_oficina: false,
      },
    ]);
  });

  it("un km tipeado por el chofer (no coincide con la estimación vieja) no se toca", () => {
    const { cambios, noTocados } = planDeRecalculo([viaje({ kilometros: 731 })]);
    expect(cambios).toEqual([]);
    expect(noTocados[0].motivo).toBe("km_cargado_a_mano");
  });

  it("una plantilla que pide los km no se toca, aunque el número coincida", () => {
    const { cambios, noTocados } = planDeRecalculo([viaje({ pide_kilometros: true })]);
    expect(cambios).toEqual([]);
    expect(noTocados[0].motivo).toBe("pide_kilometros");
  });

  it("un viaje que la oficina tocó, con el km de la estimación vieja, se recalcula y queda marcado", () => {
    const { cambios } = planDeRecalculo([viaje({ edited_by: 3 })]);
    expect(cambios).toHaveLength(1);
    expect(cambios[0].editado_por_oficina).toBe(true);
  });

  it("pero si la oficina le puso otro km, no se toca", () => {
    const { cambios, noTocados } = planDeRecalculo([viaje({ edited_by: 3, kilometros: 700 })]);
    expect(cambios).toEqual([]);
    expect(noTocados[0].motivo).toBe("km_cargado_a_mano");
  });

  it("sólo los completados", () => {
    const { noTocados } = planDeRecalculo([viaje({ status: TRIP_STATUS.EN_CURSO }), viaje({ id: 2, status: TRIP_STATUS.CANCELADO })]);
    expect(noTocados.map((n) => n.motivo)).toEqual(["no_completado", "no_completado"]);
  });

  it("sin km no hay nada que corregir: la auditoría lo estima sola", () => {
    const { noTocados } = planDeRecalculo([viaje({ kilometros: null })]);
    expect(noTocados[0].motivo).toBe("sin_km");
  });

  it("un viaje de una sola descarga (el directo) queda igual y se lista como sin cambio", () => {
    const { cambios, noTocados } = planDeRecalculo([viaje({ descargas: [{ departamento: "Montevideo" }] })]);
    expect(cambios).toEqual([]);
    expect(noTocados[0].motivo).toBe("sin_cambio");
  });

  it("un viaje sin descargas por lugar (modelo viejo) queda igual", () => {
    const { cambios } = planDeRecalculo([viaje({ descargas: null })]);
    expect(cambios).toEqual([]);
  });
});

describe("los archivos que arma", () => {
  const plan = planDeRecalculo([viaje(), viaje({ id: 2, kilometros: 731 })]);

  it("el CSV trae el antes y el después, y los que no se tocan con su motivo", () => {
    const lineas = csvDelPlan(plan).trim().split("\n");
    expect(lineas[0]).toBe("id,fecha,camion,recorrido,km_antes,km_despues,diferencia,motivo,editado_por_oficina");
    expect(lineas[1]).toBe(`1,2026-09-10,GTP 4326,Artigas > Salto > Montevideo,${ARTIGAS_MDEO},${POR_SALTO},${POR_SALTO - ARTIGAS_MDEO},recalculado,no`);
    expect(lineas[2]).toBe("2,2026-09-10,GTP 4326,,731,,,km_cargado_a_mano,");
  });

  it("el SQL sólo pisa el km si sigue valiendo lo de antes, y no toca los que no cambian", () => {
    const sql = sqlDelPlan(plan);
    expect(sql).toContain(`UPDATE trips SET kilometros = ${POR_SALTO} WHERE id = 1 AND kilometros = ${ARTIGAS_MDEO};`);
    expect(sql).not.toMatch(/id = 2/);
    expect(sql.match(/^UPDATE/gm)).toHaveLength(1);
  });

  it("sin cambios el SQL queda sin ningún UPDATE", () => {
    expect(sqlDelPlan({ cambios: [], noTocados: [] })).not.toMatch(/^UPDATE/m);
  });
});
