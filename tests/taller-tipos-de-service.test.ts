import { describe, it, expect } from "vitest";
import { aplicarCambios } from "../src/features/taller/cambio-cubiertas";
import { VEHICULOS } from "../src/features/taller/datos";
import { claveDeItem, itemsDeMarcas, marcasSegunTipos, seccionesDeService } from "../src/features/taller/servicio";
import type { Cubierta, TipoService } from "../src/features/taller/tipos";
import { TIPOS_DE_SERVICE, codigoCombinado, contenidoDeTipo, flujoDeCubiertas, itemsDeLosTipos, tipoDeService } from "../src/features/taller/tipos-de-service";

const piezas = (tipos: TipoService[]) => itemsDeLosTipos(tipos).map((i) => i.pieza);

describe("los tipos de service reales", () => {
  it("son los diez del PDF, con sus códigos", () => {
    expect(TIPOS_DE_SERVICE.map((t) => t.codigo)).toEqual(["A", "B", "C", "D", "V", "BC", "R", "N", "RB", "NB"]);
  });

  it("A: filtro de aceite, trampa, cartucho y filtro de aire, más el aceite de motor", () => {
    expect(piezas(["A"])).toEqual(
      expect.arrayContaining(["Filtro de aceite de motor", "Trampa de gasoil", "Cartucho de gasoil", "Filtro de aire del motor", "Aceite de motor"]),
    );
    expect(piezas(["A"])).toHaveLength(5);
  });

  it("C trae el centrífugo, los filtros de cabina, caja, diferencial y APS, y el líquido de caja y diferencial", () => {
    expect(piezas(["C"])).toEqual(
      expect.arrayContaining(["Centrífugo de aceite", "Filtro de cabina", "Filtro de caja", "Filtro de diferencial", "Filtro APS", "Líquido de caja y diferencial"]),
    );
  });

  it("si dos tipos comparten un ítem, va una sola vez", () => {
    const juntos = piezas(["A", "B", "BC"]);
    expect(juntos.filter((p) => p === "Filtro de aceite de motor")).toHaveLength(1);
    expect(juntos.filter((p) => p === "Aceite de motor")).toHaveLength(1);
  });

  it("A + D + R: el código combinado y el flujo de rotación", () => {
    expect(codigoCombinado(["A", "D", "R"])).toBe("A + D + R");
    expect(flujoDeCubiertas(["A", "D", "R"])).toEqual({ rotacion: true, nueva: false, balanceo: false });
  });

  it("RB y NB piden balanceo; N no", () => {
    expect(flujoDeCubiertas(["RB"]).balanceo).toBe(true);
    expect(flujoDeCubiertas(["NB"])).toEqual({ rotacion: false, nueva: true, balanceo: true });
    expect(flujoDeCubiertas(["N"]).balanceo).toBe(false);
  });

  it("el contenido de un tipo se puede mostrar en una línea", () => {
    expect(contenidoDeTipo(tipoDeService("BC")).toLowerCase()).toContain("centrífugo");
    expect(contenidoDeTipo(tipoDeService("RB")).toLowerCase()).toContain("balanceo");
  });
});

describe("marcar según los tipos elegidos", () => {
  const camion = VEHICULOS.find((v) => v.patente === "GTP 4325")!;
  const secciones = seccionesDeService(camion);
  const pieza = (m: ReturnType<typeof marcasSegunTipos>) => itemsDeMarcas(secciones, m).map((i) => i.pieza);

  it("al elegir A + D vienen marcados los filtros y líquidos de A", () => {
    const m = marcasSegunTipos(secciones, [], ["A", "D"], {});
    expect(pieza(m)).toEqual(expect.arrayContaining(["Trampa de gasoil", "Cartucho de gasoil", "Aceite de motor"]));
  });

  it("al sacar un tipo se desmarca lo suyo, pero no lo que comparte con otro que sigue", () => {
    const con = marcasSegunTipos(secciones, [], ["A", "C"], {});
    const sin = marcasSegunTipos(secciones, ["A", "C"], ["A"], con);
    expect(pieza(sin)).not.toContain("Centrífugo de aceite");
    expect(pieza(sin)).toContain("Filtro de aceite de motor");
  });

  it("no pisa lo que Raúl ya marcó a mano", () => {
    const sec = secciones.find((s) => s.nombre === "Motor")!;
    const it = sec.grupos.flatMap((g) => g.items)[0];
    const base = { [claveDeItem(sec.nombre, it)]: { accion: "reparado" as const, medida: "", obs: "a mano", codigo: "", modelo: "", delStock: "", rotaA: "", balanceada: false } };
    expect(marcasSegunTipos(secciones, [], ["A"], base)[claveDeItem(sec.nombre, it)].obs).toBe("a mano");
  });
});

describe("balanceo", () => {
  const cubierta = (numero: number): Cubierta => ({ numero, codigo: `TSM-${numero}`, modeloId: "multi", fecha: "2026-01-10", kmInicial: 60_000, obs: "", anteriores: [] });
  const v = { patente: "GTP 4325", cubiertas: [cubierta(3), cubierta(4)] };
  const service = { fecha: "2026-10-05", km: 150_000 };

  it("un balanceo suelto queda anotado en la cubierta, con fecha y km", () => {
    const r = aplicarCambios(v, service, [{ tipo: "balanceo", numero: 3 }], []);
    expect(r.cubiertas.find((c) => c.numero === 3)!.balanceos).toEqual([{ fecha: "2026-10-05", km: 150_000 }]);
    expect(r.cubiertas.find((c) => c.numero === 4)!.balanceos).toBeUndefined();
  });

  it("una cubierta nueva balanceada arranca con su balanceo", () => {
    const r = aplicarCambios(v, service, [{ tipo: "nueva", numero: 3, modeloId: "fr85", balanceada: true }], []);
    expect(r.cubiertas.find((c) => c.numero === 3)!.balanceos).toHaveLength(1);
  });

  it("la cubierta que sale se lleva sus balanceos al stock", () => {
    const con = { patente: v.patente, cubiertas: [{ ...cubierta(3), balanceos: [{ fecha: "2026-03-01", km: 90_000 }] }, cubierta(4)] };
    const r = aplicarCambios(con, service, [{ tipo: "nueva", numero: 3, modeloId: "fr85" }], []);
    expect(r.usadas[0].balanceos).toEqual([{ fecha: "2026-03-01", km: 90_000 }]);
  });
});
