import { describe, it, expect } from "vitest";
import { conDescargas, descargasAlCerrar, descargasFaltantes, faltaDescarga } from "../shared/en-ruta";
import type { TripSegment } from "@shared/domain";

/**
 * Dónde descargó cada carga, al cerrar el viaje (Otros Viajes).
 *
 * "Lugar de descarga lo tiene que pedir al final, para cerrar" (Rodrigo, 25/9). Al agregar la carga
 * sólo se dice dónde cargó; al cerrar, el chofer dice dónde descargó cada una o "todavía no sé".
 * Lo que tiene que ser cierto: no se pregunta lo que la carga ya trae, no queda ninguna sin
 * respuesta explícita, "no sé" no traba el cierre, y nada se aplica a la carga equivocada.
 */

const carga = (sid: string, extra: Partial<TripSegment> = {}): TripSegment => ({
  sid,
  origen: "Artigas",
  origen_id: null,
  destino: null,
  destino_id: null,
  remitente: `Lugar ${sid}`,
  remitente_id: null,
  clientes: [],
  cliente_ids: [],
  cantidad: 5,
  unidad: "pallets",
  remito: null,
  cobro_tipo: null,
  cobro_a: null,
  cobro_manual: false,
  ...extra,
});

describe("qué cargas hay que preguntar", () => {
  it("una carga con dónde cargó y nada más falta descargar", () => {
    expect(faltaDescarga(carga("a"))).toBe(true);
  });

  it("una carga con su destino y su lugar ya no se pregunta (las de antes del cambio)", () => {
    const completa = carga("a", { destino: "Montevideo", clientes: ["Depósito"] });
    expect(faltaDescarga(completa)).toBe(false);
    expect(descargasFaltantes([completa, carga("b")]).map((p) => p.sid)).toEqual(["b"]);
  });

  it("si sólo falta una de las dos partes, se pregunta y se conserva la otra", () => {
    const [p] = descargasFaltantes([carga("a", { destino: "Salto" })]);
    expect(p).toMatchObject({ sid: "a", numero: 1, destino: "Salto", lugar: "" });
  });

  it("el número es la posición en el viaje, no entre las pendientes", () => {
    const r = descargasFaltantes([carga("a", { destino: "X", clientes: ["Y"] }), carga("b")]);
    expect(r[0].numero).toBe(2);
  });
});

describe("la respuesta del chofer", () => {
  const pendientes = descargasFaltantes([carga("a"), carga("b")]);

  it("cada carga con sus dos partes se manda", () => {
    const r = descargasAlCerrar(pendientes, {
      a: { destino: "Montevideo", lugar: "Depósito", sinDefinir: false },
      b: { destino: "Salto", lugar: "Molino", sinDefinir: false },
    });
    expect(r).toEqual({
      descargas: [
        { sid: "a", destino: "Montevideo", descarga: "Depósito" },
        { sid: "b", destino: "Salto", descarga: "Molino" },
      ],
    });
  });

  it("una carga sin contestar frena el cierre y dice cuál", () => {
    const r = descargasAlCerrar(pendientes, { a: { destino: "Montevideo", lugar: "Depósito", sinDefinir: false } });
    expect("error" in r && r.error).toContain("Carga 2");
    expect("error" in r && r.error).toContain("Todavía no sé");
  });

  it("con una sola de las dos partes tampoco alcanza", () => {
    const r = descargasAlCerrar(pendientes, {
      a: { destino: "Montevideo", lugar: "", sinDefinir: false },
      b: { destino: "", lugar: "", sinDefinir: true },
    });
    expect("error" in r && r.error).toContain("Carga 1");
  });

  it("'todavía no sé' deja cerrar y esa carga no se manda", () => {
    const r = descargasAlCerrar(pendientes, {
      a: { destino: "", lugar: "", sinDefinir: true },
      b: { destino: "Salto", lugar: "Molino", sinDefinir: false },
    });
    expect(r).toEqual({ descargas: [{ sid: "b", destino: "Salto", descarga: "Molino" }] });
  });

  it("si la carga ya traía una parte, sólo hace falta la otra", () => {
    const p = descargasFaltantes([carga("a", { destino: "Salto" })]);
    const r = descargasAlCerrar(p, { a: { destino: "", lugar: "Molino", sinDefinir: false } });
    expect(r).toEqual({ descargas: [{ sid: "a", destino: "Salto", descarga: "Molino" }] });
  });
});

describe("aplicar lo que dijo el chofer (servidor)", () => {
  it("completa la carga que corresponde por sid y no toca las demás", () => {
    const segs = [carga("a"), carga("b")];
    const r = conDescargas(segs, [{ sid: "b", destino: "Salto", descarga: "Molino" }]);
    if ("error" in r) throw new Error(r.error);
    expect(r.cambia).toBe(true);
    expect(r.segments[1]).toMatchObject({ destino: "Salto", clientes: ["Molino"] });
    expect(r.segments[0]).toBe(segs[0]);
  });

  it("no pisa lo que la carga ya tenía", () => {
    const segs = [carga("a", { destino: "Montevideo", clientes: ["Depósito"] })];
    const r = conDescargas(segs, [{ sid: "a", destino: "Salto", descarga: "Otro" }]);
    if ("error" in r) throw new Error(r.error);
    expect(r.cambia).toBe(false);
    expect(r.segments[0]).toMatchObject({ destino: "Montevideo", clientes: ["Depósito"] });
  });

  it("un sid que no es del viaje se rechaza", () => {
    const r = conDescargas([carga("a")], [{ sid: "zzz", destino: "Salto", descarga: "X" }]);
    expect(r).toEqual({ error: "Esa carga no existe en el viaje" });
  });

  it("sin descargas no cambia nada", () => {
    const r = conDescargas([carga("a")], []);
    expect(r).toMatchObject({ cambia: false });
  });
});
