import { describe, it, expect } from "vitest";
import { descargasDelPedido, lugarVacio, lugaresDeDescarga, type LugarDeDescarga } from "../shared/en-ruta";
import { cargasSinDescarga, descargasSinBoleta, faltaDescarga } from "@shared/domain";

/**
 * Dónde descargó el viaje, por lugar, al cerrar (Otros Viajes).
 *
 * Rodrigo (25/9): siempre se llena el primer lugar y después de cada uno se pregunta "¿Agregamos
 * otro lugar de descarga?". Cada lugar: departamento, dónde descargó y la foto de la boleta; kilos o
 * pallets, opcionales. Lo que tiene que ser cierto: siempre hay al menos un lugar, la boleta es
 * obligatoria PERO "No pude sacar la boleta" deja cerrar (un chofer sin señal no queda atrapado), y
 * los kilos y pallets no se exigen.
 */

const lugar = (sid: string, extra: Partial<LugarDeDescarga> = {}): LugarDeDescarga => ({
  ...lugarVacio(sid),
  departamento: "Salto",
  lugar: "Molino",
  ...extra,
});

describe("lugaresDeDescarga", () => {
  it("un lugar completo con su boleta se manda con la forma final", () => {
    const r = lugaresDeDescarga([lugar("d1")], { d1: 1 });
    expect(r).toEqual({ descargas: [{ sid: "d1", departamento: "Salto", lugar: "Molino", kilos: null, pallets: null }] });
  });

  it("sin ningún lugar no se cierra: siempre hay al menos uno", () => {
    expect(lugaresDeDescarga([])).toEqual({ error: "Falta dónde descargaste." });
  });

  it("falta el departamento o dónde descargó: dice cuál y en qué lugar", () => {
    const r = lugaresDeDescarga([lugar("a"), lugar("b", { departamento: "" })], { a: 1, b: 1 });
    expect("error" in r && r.error).toBe("Lugar de descarga 2: indicá el departamento.");
    const s = lugaresDeDescarga([lugar("a", { lugar: " " })], { a: 1 });
    expect("error" in s && s.error).toBe("La descarga: escribí dónde descargaste.");
  });

  it("la boleta es obligatoria: sin foto no se cierra...", () => {
    const r = lugaresDeDescarga([lugar("a")], {});
    expect("error" in r && r.error).toContain("No pude sacar la boleta");
  });

  it("...pero 'No pude sacar la boleta' deja cerrar y queda marcado", () => {
    const r = lugaresDeDescarga([lugar("a", { sinBoleta: true })], {});
    expect(r).toEqual({
      descargas: [{ sid: "a", departamento: "Salto", lugar: "Molino", kilos: null, pallets: null, sin_boleta: true }],
    });
  });

  it("los kilos y los pallets son opcionales, y si vienen tienen que ser un número", () => {
    const ok = lugaresDeDescarga([lugar("a", { kilos: "1.500", pallets: "12" })], { a: 1 });
    expect(ok).toMatchObject({ descargas: [{ kilos: 1.5, pallets: 12 }] });
    const mal = lugaresDeDescarga([lugar("a", { kilos: "mucho" })], { a: 1 });
    expect("error" in mal && mal.error).toContain("en número");
  });

  it("varios lugares: cada uno con lo suyo, en orden", () => {
    const r = lugaresDeDescarga([lugar("a"), lugar("b", { departamento: "Artigas", lugar: "UAM" })], { a: 1, b: 2 });
    expect("descargas" in r && r.descargas.map((d) => d.lugar)).toEqual(["Molino", "UAM"]);
  });

  it("un id repetido se rechaza", () => {
    expect("error" in lugaresDeDescarga([lugar("a"), lugar("a")], { a: 1 })).toBe(true);
  });

  it("el servidor (sin mirar fotos) sólo valida lo que llegó", () => {
    expect(lugaresDeDescarga([lugar("a")])).toMatchObject({ descargas: [{ sid: "a" }] });
  });
});

describe("descargasDelPedido", () => {
  it("lo que llega del celular se convierte a la forma final", () => {
    const r = descargasDelPedido([{ sid: "d1", departamento: "Salto", lugar: "Molino", kilos: 500, pallets: null, sin_boleta: true }]);
    expect(r).toEqual({
      descargas: [{ sid: "d1", departamento: "Salto", lugar: "Molino", kilos: 500, pallets: null, sin_boleta: true }],
    });
  });

  it("sin lista, o con basura, se rechaza", () => {
    expect("error" in descargasDelPedido(undefined)).toBe(true);
    expect("error" in descargasDelPedido([])).toBe(true);
    expect("error" in descargasDelPedido([{ sid: "a" }])).toBe(true);
  });
});

describe("viajes del modelo anterior: cargasSinDescarga", () => {
  const pendiente = { destino: null, clientes: [] as string[] };
  const completa = { destino: "Salto", clientes: ["Molino"] };
  const viaje = (over: Record<string, unknown>) => ({ status: "COMPLETADO" as const, descarga_por_carga: true, ...over });

  it("un viaje cerrado con el cierre por carga y una carga sin descargar la cuenta", () => {
    expect(faltaDescarga(pendiente)).toBe(true);
    expect(cargasSinDescarga(viaje({ segments: [pendiente, completa] }))).toBe(1);
  });

  it("un viaje del modelo nuevo no cuenta: sus cargas no llevan destino y eso es lo normal", () => {
    const d = [{ sid: "d", departamento: "Salto", lugar: "Molino", kilos: null, pallets: null }];
    expect(cargasSinDescarga(viaje({ segments: [pendiente], descargas: d }))).toBe(0);
  });

  it("descargasSinBoleta cuenta los lugares donde el chofer no pudo sacarla", () => {
    const base = { sid: "d", departamento: "Salto", lugar: "Molino", kilos: null, pallets: null };
    expect(descargasSinBoleta({ descargas: [base, { ...base, sid: "e", sin_boleta: true }] })).toBe(1);
    expect(descargasSinBoleta({ descargas: [base] })).toBe(0);
    expect(descargasSinBoleta({})).toBe(0);
  });

  it("en curso, sin la marca de la plantilla, o con todas descargadas, no cuenta", () => {
    expect(cargasSinDescarga(viaje({ status: "EN_CURSO", segments: [pendiente] }))).toBe(0);
    expect(cargasSinDescarga(viaje({ descarga_por_carga: false, segments: [pendiente] }))).toBe(0);
    expect(cargasSinDescarga(viaje({ segments: [completa] }))).toBe(0);
  });
});
