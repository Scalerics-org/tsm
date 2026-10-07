import { describe, it, expect } from "vitest";
import { estadoDelProximo } from "../src/features/taller/tipos";
import { UMBRAL_AMBAR_SERVICE_KM, UMBRAL_ROJO_SERVICE_KM } from "../src/features/taller/disposicion";

/**
 * El color de "faltan X km" para el próximo service: cortes fijos en km, iguales para los camiones
 * grandes (25.000) y los chicos (15.000). Lo pidió Rodrigo; antes era un tercio del intervalo.
 */
describe("estadoDelProximo por km", () => {
  it("los cortes son 3.000 y 10.000", () => {
    expect(UMBRAL_ROJO_SERVICE_KM).toBe(3_000);
    expect(UMBRAL_AMBAR_SERVICE_KM).toBe(10_000);
  });

  it.each([25_000, 15_000])("con intervalo de %i km, los mismos cortes", (intervalo) => {
    expect(estadoDelProximo(10_001, intervalo, "km")).toBe("verde");
    expect(estadoDelProximo(10_000, intervalo, "km")).toBe("ambar");
    expect(estadoDelProximo(3_000, intervalo, "km")).toBe("ambar");
    expect(estadoDelProximo(2_999, intervalo, "km")).toBe("rojo");
    expect(estadoDelProximo(0, intervalo, "km")).toBe("rojo");
  });

  it("ya pasado es rojo", () => {
    expect(estadoDelProximo(-1_200, 25_000, "km")).toBe("rojo");
  });

  it("un camión chico con 9.000 km de margen ya no es verde (con el tercio del intervalo lo era)", () => {
    expect(estadoDelProximo(9_000, 15_000, "km")).toBe("ambar");
  });
});

describe("estadoDelProximo en horas (montacargas)", () => {
  it("conserva su criterio: un tercio del intervalo y 25 horas", () => {
    expect(estadoDelProximo(201, 600, "h")).toBe("verde");
    expect(estadoDelProximo(200, 600, "h")).toBe("ambar");
    expect(estadoDelProximo(24, 600, "h")).toBe("rojo");
  });
});
