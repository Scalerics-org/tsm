import { describe, it, expect } from "vitest";
import { requiereFotoCarga } from "@shared/domain";

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
