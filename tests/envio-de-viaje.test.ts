import { describe, it, expect } from "vitest";
import { compararLectura, salidaYaCreada, viajeYaCerrado } from "../shared/envio-de-viaje";

describe("salidaYaCreada", () => {
  it("un viaje en curso de la misma plantilla y camión es el que salió", () => {
    expect(salidaYaCreada({ template_id: 5, truck_id: 2 }, { template_id: 5, truck_id: 2 })).toBe(true);
  });
  it("sin camión mandado (usa el asignado), alcanza con la plantilla", () => {
    expect(salidaYaCreada({ template_id: 5, truck_id: null }, { template_id: 5, truck_id: 9 })).toBe(true);
  });
  it("otra plantilla, otro camión o ningún viaje: no salió", () => {
    expect(salidaYaCreada({ template_id: 5, truck_id: 2 }, { template_id: 6, truck_id: 2 })).toBe(false);
    expect(salidaYaCreada({ template_id: 5, truck_id: 2 }, { template_id: 5, truck_id: 3 })).toBe(false);
    expect(salidaYaCreada({ template_id: 5, truck_id: 2 }, null)).toBe(false);
  });
});

describe("viajeYaCerrado", () => {
  it("sólo si está completado", () => {
    expect(viajeYaCerrado({ status: "COMPLETADO" })).toBe(true);
    expect(viajeYaCerrado({ status: "EN_CURSO" })).toBe(false);
    expect(viajeYaCerrado({ status: "CANCELADO" })).toBe(false);
    expect(viajeYaCerrado(null)).toBe(false);
  });
});

describe("compararLectura", () => {
  it("misma, distinta o ninguna", () => {
    expect(compararLectura(481_000, { kilometraje: 481_000 })).toBe("misma");
    expect(compararLectura(481_000, { kilometraje: 480_000 })).toBe("distinta");
    expect(compararLectura(481_000, null)).toBe("ninguna");
  });
});
