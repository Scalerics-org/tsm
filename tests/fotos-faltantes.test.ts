import { describe, it, expect } from "vitest";
import { fotoQueFalta, leFaltaCarga, type EstadoFotosViaje } from "../api/lib/fotos-faltantes";

/**
 * Qué foto le falta a un viaje cerrado, contando sólo las que se le tenían que pedir.
 *
 * La alerta de "Viajes sin foto" marcaba todo viaje completado sin foto de carga. Al 11/9 eran
 * 0, pero cada viaje cargado por "+ Cargar viaje" —que pasó sin la app y nace sin fotos a
 * propósito— iba a quedar marcado para siempre, y a contar como "sin foto" en la ficha del
 * chofer, que no tuvo nada que ver.
 */

const viaje = (p: Partial<EstadoFotosViaje> = {}): EstadoFotosViaje => ({
  has_carga: 0,
  has_descarga: 0,
  arrival_photo_label: null,
  viaje_vacio: 0,
  foto_carga_requerida: 1,
  cargado_por_oficina: 0,
  ...p,
});

describe("qué foto le falta a un viaje cerrado", () => {
  it("un viaje del chofer sin foto de carga: le falta la carga", () => {
    expect(fotoQueFalta(viaje(), true)).toBe("carga");
    expect(leFaltaCarga(viaje(), true)).toBe(true);
  });

  it("uno cargado desde oficina no: pasó sin la app y nace sin fotos a propósito", () => {
    expect(fotoQueFalta(viaje({ cargado_por_oficina: 1 }), true)).toBeNull();
    expect(leFaltaCarga(viaje({ cargado_por_oficina: 1 }), true)).toBe(false);
  });

  it("un viaje vacío no lleva foto de carga", () => {
    expect(fotoQueFalta(viaje({ viaje_vacio: 1 }), true)).toBeNull();
  });

  it("una plantilla que no pide foto de carga, tampoco", () => {
    expect(fotoQueFalta(viaje({ foto_carga_requerida: 0 }), true)).toBeNull();
  });

  it("sin plantilla vale la regla general: se pide", () => {
    expect(fotoQueFalta(viaje({ viaje_vacio: null, foto_carga_requerida: null }), true)).toBe("carga");
  });

  it("sin R2 no se piden fotos: la exigencia depende de que exista", () => {
    expect(fotoQueFalta(viaje(), false)).toBeNull();
  });

  it("la de llegada se dice con el nombre que le puso la plantilla", () => {
    expect(fotoQueFalta(viaje({ has_carga: 1, arrival_photo_label: "Boleta rosada firmada" }), true)).toBe(
      "Boleta rosada firmada",
    );
    expect(fotoQueFalta(viaje({ arrival_photo_label: "Remito" }), true)).toBe("carga y descarga");
  });

  it("con las fotos que corresponden no le falta nada", () => {
    expect(fotoQueFalta(viaje({ has_carga: 1 }), true)).toBeNull();
  });
});
