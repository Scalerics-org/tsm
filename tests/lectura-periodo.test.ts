import { describe, it, expect } from "vitest";
import { claveMovida, esPeriodo, moverLectura, periodoSiguiente } from "../api/lib/lectura-periodo";

/**
 * Corregir el MES de una lectura del tacógrafo.
 *
 * "Tiene que poder corregir la fecha del tacógrafo del mes." Hasta ahora la oficina sólo
 * podía corregir el kilometraje: si el chofer sacaba la foto el 2 de setiembre pero era la
 * que cierra agosto, quedaba anotada contra setiembre y no había forma de moverla. Y el mes
 * es justo la clave con la que el consumo por calendario decide a qué período van esos
 * kilómetros, así que una lectura en el mes equivocado corre la cuenta de dos meses.
 *
 * Mover una lectura NO es cambiar un dato suelto: es cambiar el extremo de dos restas.
 */

const L = (id: number, periodo: string, kilometraje: number) => ({ id, periodo, kilometraje });

describe("esPeriodo", () => {
  it("acepta un mes bien escrito", () => {
    expect(esPeriodo("2026-09")).toBe(true);
    expect(esPeriodo("2026-01")).toBe(true);
    expect(esPeriodo("2026-12")).toBe(true);
  });

  it("rechaza lo que no es un mes", () => {
    expect(esPeriodo("2026-13")).toBe(false);
    expect(esPeriodo("2026-00")).toBe(false);
    expect(esPeriodo("2026-9")).toBe(false);
    expect(esPeriodo("setiembre")).toBe(false);
    expect(esPeriodo("2026-09-07")).toBe(false);
    expect(esPeriodo("")).toBe(false);
  });
});

describe("periodoSiguiente", () => {
  it("pasa de diciembre a enero del año que viene", () => {
    expect(periodoSiguiente("2026-12")).toBe("2027-01");
  });

  it("rellena el mes con cero", () => {
    expect(periodoSiguiente("2026-08")).toBe("2026-09");
  });
});

describe("mover una lectura a otro mes", () => {
  it("deja moverla a un mes libre", () => {
    const sep = L(3, "2026-09", 310066);
    const r = moverLectura(sep, "2026-08", [L(1, "2026-06", 300000), sep]);
    expect(r.ok).toBe(true);
  });

  it("avisa qué meses quedan tocados, incluidos los siguientes a cada punta", () => {
    const sep = L(3, "2026-09", 310066);
    const r = moverLectura(sep, "2026-08", [L(1, "2026-06", 300000), sep]);
    if (!r.ok) throw new Error("tenía que poder moverse");
    // La resta usa la lectura como extremo de SU mes y del que sigue: se mueven cuatro.
    expect(r.afectados).toEqual(["2026-08", "2026-09", "2026-10"]);
  });

  it("no la deja pisar el mes de otra lectura", () => {
    const sep = L(3, "2026-09", 310066);
    const ago = L(2, "2026-08", 299000);
    const r = moverLectura(sep, "2026-08", [ago, sep]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(409);
    expect(r.motivo).toMatch(/ya tiene/i);
  });

  it("no la deja quedar por debajo del mes anterior: el odómetro no va para atrás", () => {
    // La de junio marca 300.000. Llevarla a octubre la dejaría DESPUÉS de la de setiembre,
    // que marca 320.000: el tacógrafo habría retrocedido 20.000 km.
    const jun = L(1, "2026-06", 300000);
    const r = moverLectura(jun, "2026-10", [jun, L(2, "2026-09", 320000)]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(400);
    expect(r.motivo).toContain("320.000");
  });

  it("tampoco la deja quedar por encima del mes siguiente", () => {
    const jun = L(1, "2026-06", 300000);
    const r = moverLectura(jun, "2026-10", [jun, L(2, "2026-11", 250000)]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(400);
    expect(r.motivo).toContain("250.000");
  });

  it("mover al mismo mes no hace nada y no es un error", () => {
    const sep = L(3, "2026-09", 310066);
    const r = moverLectura(sep, "2026-09", [sep]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.afectados).toEqual([]);
  });

  it("rechaza un mes mal escrito antes de mirar nada más", () => {
    const sep = L(3, "2026-09", 310066);
    const r = moverLectura(sep, "setiembre", [sep]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(400);
  });

  it("la única lectura del camión se puede mover a donde sea", () => {
    const sola = L(9, "2026-09", 310066);
    const r = moverLectura(sola, "2026-02", [sola]);
    expect(r.ok).toBe(true);
  });

  it("se compara contra el vecino real, no contra el mes de al lado", () => {
    // Entre la de marzo y la de setiembre no hay nada: mover setiembre a julio es válido
    // aunque julio esté vacío, porque el vecino anterior real es marzo.
    const sep = L(3, "2026-09", 310066);
    const r = moverLectura(sep, "2026-07", [L(1, "2026-03", 280000), sep]);
    expect(r.ok).toBe(true);
  });
});

describe("la foto se muda con la lectura", () => {
  /**
   * La clave de R2 es `odometro/{camion}/{periodo}.jpg`: lleva el mes adentro. Dejarla en el
   * mes viejo hace que la próxima lectura de ESE mes escriba en la misma clave y la pise —la
   * lectura movida pasa a mostrar la foto de otra, en silencio—. Es evidencia: es contra lo
   * único que se contrasta un kilometraje corregido.
   */
  it("arma la clave del mes nuevo", () => {
    expect(claveMovida("odometro/1/2026-09.jpg", "2026-08")).toBe("odometro/1/2026-08.jpg");
  });

  it("respeta la extensión", () => {
    expect(claveMovida("odometro/12/2026-09.png", "2027-01")).toBe("odometro/12/2027-01.png");
  });

  it("sin foto no hay nada que mover", () => {
    expect(claveMovida(null, "2026-08")).toBeNull();
  });

  it("una clave con otra forma se deja quieta: mejor eso que moverla a ciegas", () => {
    expect(claveMovida("fotos/viejo/algo.jpg", "2026-08")).toBeNull();
    expect(claveMovida("odometro/1/agosto.jpg", "2026-08")).toBeNull();
  });
});
