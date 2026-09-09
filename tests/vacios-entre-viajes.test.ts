import { describe, it, expect } from "vitest";
import { vaciosEntreViajes, KM_VACIO_MINIMO } from "../shared/vacios";

/**
 * Los viajes vacíos, deducidos de lo que ya está cargado.
 *
 * "Cada camión debería guardar el último lugar donde descargó (x) y el nuevo lugar de carga
 * (y). Si no son el mismo, eso quiere decir que hizo un viaje vacío desde x a y." — el
 * cliente, con un dibujo de seis viajes y las flechas naranjas de los vacíos.
 *
 * No se le pide nada al chofer: el dato ya está en los viajes que cargó. Es la diferencia
 * entre pedirle que registre un viaje más por cada retorno —que en un mes nadie hizo ni una
 * vez— y deducirlo de lo que ya anotó.
 *
 * Los kilómetros salen de `kmEstimados`, que además NORMALIZA los nombres: "Montevideo",
 * "Mdeo" y "MONTEVIDEO" son el mismo lugar y dan 0 km. Sin eso, dos de cada ocho huecos de
 * los datos reales serían vacíos inventados por una diferencia de escritura.
 */

const v = (
  id: number,
  started_at: string,
  origin: string,
  destination: string,
  kilometros: number | null = null,
) => ({ id, started_at, origin, destination, kilometros });

describe("deducir los tramos vacíos", () => {
  it("dos viajes pegados no dejan vacío", () => {
    // Descarga en Bella Unión y el siguiente carga en Bella Unión: no se movió vacío.
    const r = vaciosEntreViajes([
      v(1, "2026-08-20", "Mdeo", "Bella Unión", 667),
      v(2, "2026-08-22", "Bella Unión", "Mdeo", 667),
    ]);
    expect(r).toEqual([]);
  });

  it("un hueco entre la descarga y la carga siguiente es un vacío", () => {
    const r = vaciosEntreViajes([
      v(1, "2026-08-21", "Mdeo", "Bella Unión", 667),
      v(2, "2026-08-22", "Artigas", "Montevideo", 627),
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].desde).toBe("Bella Unión");
    expect(r[0].hasta).toBe("Artigas");
    // El tramo que el cliente nombró desde el primer día: "Bella Unión a Artigas, 130 aprox".
    expect(r[0].km).toBe(137);
  });

  it("el mismo lugar escrito distinto NO es un vacío", () => {
    // Es el caso real: en un mismo camión conviven "Montevideo", "Mdeo" y "MONTEVIDEO".
    for (const [a, b] of [
      ["Montevideo", "Mdeo"],
      ["Montevideo", "MONTEVIDEO"],
      ["Mdeo", "montevideo"],
    ]) {
      const r = vaciosEntreViajes([v(1, "2026-08-21", "Artigas", a, 627), v(2, "2026-08-22", b, "Bella Unión", 667)]);
      expect(r, `${a} -> ${b}`).toEqual([]);
    }
  });

  it("ordena por fecha antes de comparar: el orden de la lista no manda", () => {
    const r = vaciosEntreViajes([
      v(2, "2026-08-22", "Artigas", "Montevideo", 627),
      v(1, "2026-08-21", "Mdeo", "Bella Unión", 667),
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].desde).toBe("Bella Unión");
  });

  it("un solo viaje no deja vacíos", () => {
    expect(vaciosEntreViajes([v(1, "2026-08-21", "Mdeo", "Bella Unión", 667)])).toEqual([]);
  });

  it("sin viajes tampoco", () => {
    expect(vaciosEntreViajes([])).toEqual([]);
  });
});

describe("retorno: volver a cargar donde ya se había cargado", () => {
  /**
   * "VIAJE 1. ARTIGAS CASARONE - MDEO TIFECOM. VIAJE 2. ARTIGAS CASARONE - MDEO TIFECOM. EN
   * EL MEDIO DE ESTOS DOS ESTÁ EL RETORNO. EL RETORNO TENEMOS Q PONERLE LOS MISMOS KILÓMETROS
   * Q EL VIAJE."
   *
   * Es el vacío que deshace el viaje anterior, así que sus kilómetros son los de ese viaje —y
   * ésos son reales, no estimados—. Se marca aparte porque el cliente lo quiere contar como
   * categoría propia.
   */
  it("se reconoce y se le ponen los km del viaje que deshace", () => {
    const r = vaciosEntreViajes([
      v(1, "2026-08-21", "Artigas", "Montevideo", 627),
      v(2, "2026-08-23", "Artigas", "Montevideo", 627),
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].tipo).toBe("retorno");
    expect(r[0].desde).toBe("Montevideo");
    expect(r[0].hasta).toBe("Artigas");
    expect(r[0].km).toBe(627);
  });

  it("si el viaje no tiene km cargados, el retorno cae en la estimación", () => {
    const r = vaciosEntreViajes([
      v(1, "2026-08-21", "Artigas", "Montevideo", null),
      v(2, "2026-08-23", "Artigas", "Montevideo", null),
    ]);
    expect(r[0].tipo).toBe("retorno");
    expect(r[0].km).toBeGreaterThan(0);
  });

  it("ir a cargar a OTRO lado no es retorno, es reposición", () => {
    // "BU - uam, uam - mdeo. esos son dos viajes apartes no es retorno."
    const r = vaciosEntreViajes([
      v(1, "2026-08-21", "Mdeo", "Bella Unión", 667),
      v(2, "2026-08-22", "Artigas", "Montevideo", 627),
    ]);
    expect(r[0].tipo).toBe("reposicion");
  });
});

describe("lo que no se puede afirmar, no se afirma", () => {
  it("un lugar que la app no conoce deja el tramo sin kilómetros", () => {
    const r = vaciosEntreViajes([
      v(1, "2026-08-21", "Mdeo", "Galpón del fondo", 667),
      v(2, "2026-08-22", "Artigas", "Montevideo", 627),
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].km).toBeNull();
  });

  it("un movimiento corto no cuenta como viaje vacío", () => {
    // "Tengo dudas con los km. X Mdeo cuando hacen km vacíos dentro de Mdeo." El umbral lo
    // puso el cliente: por debajo de eso es moverse dentro de la misma zona, no un viaje.
    expect(KM_VACIO_MINIMO).toBe(70);
    const r = vaciosEntreViajes([
      v(1, "2026-08-21", "Mdeo", "Canelones", 46),
      v(2, "2026-08-22", "Montevideo", "Bella Unión", 667),
    ]);
    expect(r).toEqual([]);
  });
});

describe("sobre la seguidilla real de un camión", () => {
  /**
   * Los viajes de la GTP 4325 entre el 20/08 y el 05/09, tal cual están en producción. Es la
   * prueba de que la regla se sostiene sobre datos que nadie preparó para ella: tres tramos
   * reales y dos falsos positivos de escritura que se resuelven solos.
   */
  const reales = [
    v(1, "2026-08-21", "Mdeo", "Bella Unión", 667),
    v(2, "2026-08-22", "Artigas", "Montevideo", 627),
    v(3, "2026-08-24", "Mdeo", "Bella Unión", 667),
    v(4, "2026-08-27", "Artigas", "Montevideo", 627),
    v(5, "2026-08-28", "Montevideo", "Rivera", 560),
    v(6, "2026-08-29", "Artigas", "Montevideo", 627),
    v(7, "2026-08-31", "MONTEVIDEO", "Flores", 209),
    v(8, "2026-09-01", "Artigas", "Montevideo", 627),
  ];

  it("encuentra los tramos de verdad y descarta el ruido de escritura", () => {
    const r = vaciosEntreViajes(reales);
    expect(r.map((x) => `${x.desde} -> ${x.hasta}`)).toEqual([
      "Bella Unión -> Artigas",
      "Bella Unión -> Artigas",
      "Rivera -> Artigas",
      "Flores -> Artigas",
    ]);
  });

  it("y suma kilómetros que antes quedaban en «sin justificar»", () => {
    const total = vaciosEntreViajes(reales).reduce((s, x) => s + (x.km ?? 0), 0);
    expect(total).toBe(137 + 137 + 130 + 437);
  });
});
