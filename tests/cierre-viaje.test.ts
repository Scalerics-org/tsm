import { describe, it, expect } from "vitest";
import { fotosFaltantes, sirveComoLugarDeCarga } from "@shared/domain";
import type { TripPhoto, TripSegment, TripTemplate } from "@shared/domain";

type Tpl = Pick<
  TripTemplate,
  "viaje_vacio" | "foto_carga_requerida" | "multi_renglon" | "arrival_photo_label"
>;

function tpl(p: Partial<Tpl> = {}): Tpl {
  return {
    viaje_vacio: false,
    foto_carga_requerida: true,
    multi_renglon: false,
    arrival_photo_label: null,
    ...p,
  };
}

const carga = (sid: string, remitente: string) =>
  ({ sid, remitente }) as Pick<TripSegment, "sid" | "remitente">;

const foto = (kind: string, segment_sid: string | null = null) =>
  ({ kind, segment_sid }) as Pick<TripPhoto, "kind" | "segment_sid">;

describe("fotosFaltantes", () => {
  it("un viaje común se cierra con la foto de la carga", () => {
    expect(fotosFaltantes(tpl(), [], [foto("carga")])).toEqual([]);
  });

  it("y sin ella, no", () => {
    expect(fotosFaltantes(tpl(), [], [])).toEqual(["la foto de la carga"]);
  });

  it("el viaje vacío no tiene qué fotografiar", () => {
    expect(fotosFaltantes(tpl({ viaje_vacio: true }), [], [])).toEqual([]);
  });

  it("un viaje sin plantilla igual exige la foto: quedarse sin evidencia es peor", () => {
    expect(fotosFaltantes(null, [], [])).toEqual(["la foto de la carga"]);
  });

  it("el combinado exige una foto por cada lugar de carga, y nombra los que faltan", () => {
    const segs = [carga("a", "TIMBER"), carga("b", "ONTIL"), carga("c", "AGROFEED")];
    const fotos = [foto("carga", "a")];
    expect(fotosFaltantes(tpl({ multi_renglon: true }), segs, fotos)).toEqual([
      "la foto de: ONTIL, AGROFEED",
    ]);
  });

  it("con la foto de cada uno, cierra", () => {
    const segs = [carga("a", "TIMBER"), carga("b", "ONTIL")];
    const fotos = [foto("carga", "a"), foto("carga", "b")];
    expect(fotosFaltantes(tpl({ multi_renglon: true }), segs, fotos)).toEqual([]);
  });

  /**
   * Éste es el que faltaba. Los renglones que deja puestos la oficina (Manassi, UAM) nacen
   * sin foto, y hasta ahora la pantalla del chofer no ofrecía forma de sacársela: el viaje
   * quedaba trabado para siempre. El test fija que la regla los cuenta, para que la pantalla
   * tenga que resolverlo en vez de que el viaje quede colgado.
   */
  it("los renglones que puso la oficina también cuentan", () => {
    const fijos = [carga("f1", "Manassi"), carga("f2", "Salus")];
    expect(fotosFaltantes(tpl({ multi_renglon: true }), fijos, [])).toEqual([
      "la foto de: Manassi, Salus",
    ]);
  });

  it("una foto de carga suelta no cubre a ningún renglón del combinado", () => {
    const segs = [carga("a", "TIMBER")];
    expect(fotosFaltantes(tpl({ multi_renglon: true }), segs, [foto("carga", null)])).toEqual([
      "la foto de: TIMBER",
    ]);
  });

  it("suma la foto de llegada cuando la plantilla la pide", () => {
    const t = tpl({ arrival_photo_label: "Hoja MIC" });
    expect(fotosFaltantes(t, [], [foto("carga")])).toEqual(["la foto: Hoja MIC"]);
  });

  it("las nombra a las dos, en el orden en que el chofer las resuelve", () => {
    const t = tpl({ multi_renglon: true, arrival_photo_label: "Hoja MIC" });
    expect(fotosFaltantes(t, [carga("a", "TIMBER")], [])).toEqual([
      "la foto de: TIMBER",
      "la foto: Hoja MIC",
    ]);
  });

  it("el vacío tampoco pide la de llegada si ya la tiene", () => {
    const t = tpl({ viaje_vacio: true, arrival_photo_label: "Remito" });
    expect(fotosFaltantes(t, [], [foto("descarga")])).toEqual([]);
  });
});

describe("sirveComoLugarDeCarga", () => {
  it("un lugar real sirve", () => {
    expect(sirveComoLugarDeCarga({ agrupador: false })).toBe(true);
  });

  it("un agrupador no: es justo el dato que no se puede perder", () => {
    expect(sirveComoLugarDeCarga({ agrupador: true })).toBe(false);
  });

  it("un nombre escrito a mano sirve: ahí el chofer ya dijo dónde cargó", () => {
    expect(sirveComoLugarDeCarga(null)).toBe(true);
  });
});
