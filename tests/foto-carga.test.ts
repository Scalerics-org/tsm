import { describe, it, expect } from "vitest";
import { renglonesSinFoto, requiereFotoCarga, type TripPhoto, type TripSegment } from "@shared/domain";

describe("requiereFotoCarga (qué viajes necesitan foto para cerrarse)", () => {
  it("por defecto la plantilla la exige", () => {
    expect(requiereFotoCarga({ viaje_vacio: false, foto_carga_requerida: true })).toBe(true);
  });

  it("la plantilla puede eximirla (combinados: el respaldo es el N° de remito)", () => {
    // El chofer carga en 3 o 4 lugares; pedir una foto por cada uno termina en que no cierra el viaje.
    expect(requiereFotoCarga({ viaje_vacio: false, foto_carga_requerida: false })).toBe(false);
  });

  it("un viaje vacío nunca la pide: no hay carga que fotografiar", () => {
    expect(requiereFotoCarga({ viaje_vacio: true, foto_carga_requerida: true })).toBe(false);
  });

  it("sin plantilla se exige: perder la evidencia es peor que pedirla de más", () => {
    expect(requiereFotoCarga(null)).toBe(true);
  });
});

describe("renglonesSinFoto (una foto por lugar de carga)", () => {
  function carga(sid: string, remitente: string): TripSegment {
    return {
      sid,
      remitente,
      remitente_id: null,
      clientes: [],
      cliente_ids: [],
      cantidad: null,
      unidad: null,
      remito: null,
      cobro_tipo: null,
      cobro_a: null,
      cobro_manual: false,
    };
  }
  const foto = (segment_sid: string | null, kind: TripPhoto["kind"] = "carga") => ({ segment_sid, kind });

  it("marca las cargas que todavía no tienen su foto", () => {
    const r = renglonesSinFoto([carga("a", "Armco"), carga("b", "Sika")], [foto("a")]);
    expect(r.map((s) => s.remitente)).toEqual(["Sika"]);
  });

  it("con la foto de cada una no queda ninguna pendiente", () => {
    expect(renglonesSinFoto([carga("a", "Armco"), carga("b", "Sika")], [foto("a"), foto("b")])).toEqual([]);
  });

  it("una foto del viaje entero no cubre a ninguna carga puntual", () => {
    // Es el punto del cambio: con una sola foto no se sabe cuál de las tres se documentó.
    const r = renglonesSinFoto([carga("a", "Armco"), carga("b", "Sika")], [foto(null)]);
    expect(r).toHaveLength(2);
  });

  it("la foto de descarga no cuenta como foto de la carga", () => {
    const r = renglonesSinFoto([carga("a", "Armco")], [foto("a", "descarga")]);
    expect(r).toHaveLength(1);
  });

  it("se cruza por sid, así borrar una carga no corre las fotos de las demás", () => {
    // Si esto fuera por posición, al borrar la primera la foto de Sika pasaría a ser la de Armco.
    const quedan = [carga("b", "Sika"), carga("c", "Timber")];
    expect(renglonesSinFoto(quedan, [foto("b")]).map((s) => s.remitente)).toEqual(["Timber"]);
  });
});
