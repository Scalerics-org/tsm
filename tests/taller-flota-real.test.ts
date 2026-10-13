import { describe, it, expect } from "vitest";
import { disposicionDesdeTexto, tipoDesdeTexto, vehiculoDeCamion } from "../src/features/taller/flota-real";
import type { Truck } from "../shared/domain";

/** Los textos reales de la flota en producción, con su clase, el tipo del Taller y si queda algo para confirmar. */
describe("textos reales de la flota", () => {
  it.each<[string, Truck["clase"], string, RegExp | undefined]>([
    ["N99-CAMION SENCILLO", "camion", "camion-chico", /camión chico/],
    ["N2-CAMION SENCILLO", "camion", "camion-chico", /camión chico/],
    ["099-REMOLQUE SENCILLO", "remolque", "sorra-sencilla", /«remolque» sin «semi»/],
    ["TRACTOR DOBLE EJE", "camion", "tractor", undefined],
    ["CAMION DOBLE EJE", "camion", "doble-eje", undefined],
    ["N3-CAMION 3 EJE", "camion", "doble-eje", undefined],
    // Los dos semirremolques llevan el aviso fijo de ejes duales (ya existía antes de este cambio).
    ["099-SEMIREMOLQUE 3 EJES", "remolque", "remolque-3", /ejes duales/],
    ["03-SEMIREMOLQUE 2 EJES", "remolque", "remolque-2", /ejes duales/],
    ["099- EMIREMOLQUE-S48 FURGON", "remolque", "remolque-3", /ejes/],
  ])("%s → %s (aConfirmar: %s)", (texto, clase, id, aviso) => {
    const d = disposicionDesdeTexto(texto, clase);
    expect(d.id).toBe(id);
    if (aviso) expect(d.aConfirmar).toMatch(aviso);
    else expect(d.aConfirmar).toBeUndefined();
  });

  it("un remolque sencillo o doble sin «semi» es una sorra, y avisa", () => {
    expect(tipoDesdeTexto("REMOLQUE 3 EJES")).toMatchObject({ id: "sorra-doble", supuesto: expect.stringMatching(/sorra/) });
    expect(tipoDesdeTexto("remolque doble eje").id).toBe("sorra-doble");
  });

  it("«semirremolque» con doble erre sigue siendo semirremolque", () => {
    expect(tipoDesdeTexto("SEMIRREMOLQUE 2 EJES").id).toBe("remolque-2");
    expect(tipoDesdeTexto("semirremolque 3 ejes").id).toBe("remolque-3");
  });
});

/**
 * Los camiones y acoplados que Rodrigo carga en Camiones aparecen en el Taller. El "Tipo" es texto libre:
 * estos son los que escribió (captura del 7/10) más los que se pueden esperar.
 */
describe("tipoDesdeTexto", () => {
  it.each([
    ["TRACTOR DOBLE EJE", "tractor"],
    ["Tractor DOBLE EJE", "tractor"],
    ["tractor sencillo", "tractor-sencillo"],
    ["03-SEMIREMOLQUE 2 EJES", "remolque-2"],
    ["03-SEMIREMOLQUE 3 EJE", "remolque-3"],
    ["099-SEMIREMOLQUE 3 EJES", "remolque-3"],
    ["099- EMIREMOLQUE-S48 FURGON", "remolque-3"],
    ["acoplado", "sorra-sencilla"],
    ["Sorra doble eje", "sorra-doble"],
    ["camión chico", "camion-chico"],
    ["Camión doble eje", "doble-eje"],
  ])("%s → %s", (texto, id) => {
    expect(tipoDesdeTexto(texto).id).toBe(id);
  });

  it("cuando el texto no dice cuántos ejes tiene, lo supone y lo avisa", () => {
    expect(tipoDesdeTexto("099-SEMIREMOLQUE").supuesto).toMatch(/ejes/);
    expect(tipoDesdeTexto("099-SEMIREMOLQUE 3 EJES").supuesto).toBeUndefined();
  });

  it("un tipo que no se reconoce no se calla: queda marcado para confirmar", () => {
    expect(tipoDesdeTexto("Tolva").supuesto).toMatch(/Tolva/);
    expect(tipoDesdeTexto("").supuesto).toMatch(/vacío/);
  });
});

const camion = (p: Partial<Truck>): Truck =>
  ({ id: 1, plate: "GTP 4238", brand: "SCANIA", model: "G 420", year: 2012, type: "TRACTOR DOBLE EJE", capacity_kg: 0, odometer_km: 463818, avg_km_litro: 2.8, status: "disponible", ...p }) as Truck;

describe("vehiculoDeCamion", () => {
  it("toma patente, km, descripción y tipo de la base", () => {
    const v = vehiculoDeCamion(camion({}), "Julio Techera");
    expect(v.patente).toBe("GTP 4238");
    expect(v.km).toBe(463818);
    expect(v.descripcion).toBe("SCANIA G 420 · 2012");
    expect(v.tipo).toBe("camion");
    expect(v.disposicion?.id).toBe("tractor");
    expect(v.cadaService).toBe(25000);
    expect(v.choferAsignado).toBe("Julio Techera");
  });

  it("un acoplado es un acoplado y un semirremolque, un semirremolque; sin intervalo de service por km", () => {
    const acoplado = vehiculoDeCamion(camion({ plate: "GBA 2253", type: "03-SEMIREMOLQUE 2 EJES", odometer_km: 0 }));
    expect(acoplado.tipo).toBe("semirremolque");
    expect(acoplado.disposicion?.id).toBe("remolque-2");
    expect(acoplado.cadaService).toBeNull();
    expect(acoplado.km).toBe(0);
  });

  it("lo que la base no tiene arranca vacío: sin cubiertas ni services, y sin estimar km por día", () => {
    const v = vehiculoDeCamion(camion({}));
    expect(v.cubiertas).toEqual([]);
    expect(v.services).toEqual([]);
    expect(v.kmPorDia).toBe(0);
    expect(v.componentes.length).toBeGreaterThan(0);
    expect(v.componentes.every((c) => c.piezas.every((p) => p.condicion === "original"))).toBe(true);
  });

  it("un tipo sin reconocer queda con el aviso en la disposición", () => {
    expect(vehiculoDeCamion(camion({ type: "Tolva" })).disposicion?.aConfirmar).toMatch(/Tolva/);
  });
});
