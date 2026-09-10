import { describe, it, expect } from "vitest";
import { vaciosDelPeriodo } from "../shared/vacios";

/**
 * Los vacíos de un camión en un período, para Resumen → Por camión.
 *
 * "No veo bien dónde quedó el resumen. De esas cosas identificado por camión y tramos."
 * — el cliente. El detalle estaba en la ficha de cada camión y el total metido en letra
 * chica en Control; no había una tabla con todos los camiones juntos.
 */

const v = (id: number, started_at: string, origin: string, destination: string, kilometros: number | null = null) =>
  ({ id, started_at, origin, destination, kilometros });

/**
 * Tres viajes de un mismo camión, cruzando el cambio de mes:
 *   1. 30/08  Mdeo → Artigas (627 km)
 *   2. 02/09  Mdeo → Bella Unión   ← vuelve vacío de Artigas a Mdeo: RETORNO, 627 km
 *   3. 05/09  Artigas → Mdeo       ← va vacío de Bella Unión a Artigas: A BUSCAR CARGA, 137 km
 */
const CRUZA_EL_MES = [
  v(1, "2026-08-30 08:00:00", "Mdeo", "Artigas", 627),
  v(2, "2026-09-02 08:00:00", "Mdeo", "Bella Unión", 667),
  v(3, "2026-09-05 08:00:00", "Artigas", "Mdeo", 600),
];

describe("los vacíos del período", () => {
  it("separa los retornos de ir a buscar carga", () => {
    const r = vaciosDelPeriodo(CRUZA_EL_MES, "2026-09-01", "2026-09-30");
    expect(r.km_retorno).toBe(627);
    expect(r.km_reposicion).toBe(137);
    expect(r.tramos).toBe(2);
  });

  it("el tramo del borde va al mes en que el camión llega a cargar, no se pierde", () => {
    // El retorno Artigas → Mdeo arranca después de un viaje de AGOSTO. Recortando los
    // viajes al rango de setiembre primero, el viaje 1 no estaría y el retorno no existiría.
    const setiembre = vaciosDelPeriodo(CRUZA_EL_MES, "2026-09-01", "2026-09-30");
    expect(setiembre.km_retorno).toBe(627);

    // Y no se cuenta dos veces: en agosto no aparece.
    const agosto = vaciosDelPeriodo(CRUZA_EL_MES, "2026-08-01", "2026-08-31");
    expect(agosto.tramos).toBe(0);
    expect(agosto.km_retorno + agosto.km_reposicion).toBe(0);
  });

  it("sin rango cuenta todo", () => {
    const r = vaciosDelPeriodo(CRUZA_EL_MES);
    expect(r.tramos).toBe(2);
    expect(r.km_retorno + r.km_reposicion).toBe(764);
  });

  it("un tramo que la app no puede medir aparece contado pero no suma", () => {
    // "Salto y Artigas" no es un lugar: son dos. La app no le inventa kilómetros.
    const r = vaciosDelPeriodo([
      v(10, "2026-09-10 08:00:00", "Mdeo", "Salto y Artigas", 600),
      v(11, "2026-09-12 08:00:00", "Tacuarembó", "Mdeo", 390),
    ]);
    expect(r.tramos).toBe(1);
    expect(r.sin_km).toBe(1);
    expect(r.km_retorno + r.km_reposicion).toBe(0);
  });

  it("un camión sin viajes da todo en cero", () => {
    expect(vaciosDelPeriodo([], "2026-09-01", "2026-09-30")).toEqual({
      km_retorno: 0, km_reposicion: 0, tramos: 0, sin_km: 0,
    });
  });
});
