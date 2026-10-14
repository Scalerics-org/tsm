import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Rodrigo pidió no preguntarle nada de esto al chofer ("¿Desde dónde salís a buscar la carga?"). La pregunta se
 * sacó de la pantalla del chofer que inicia el viaje y de lo que manda. Del lado del servidor y de la oficina el
 * dato sigue existiendo: los viajes que ya lo tienen quedan como están, y un envío viejo que todavía lo traiga no
 * se rompe (eso lo prueba salida-del-viaje-api.test.ts contra una D1 de verdad).
 */
describe("la pantalla del chofer que inicia el viaje", () => {
  const fuente = readFileSync("src/features/chofer/StartTripPage.tsx", "utf8");

  it("no pregunta desde dónde sale", () => {
    expect(fuente).not.toContain("SelectorDeSalida");
    expect(fuente).not.toContain("Desde dónde salís");
  });

  it("no manda salida_desde ni pide la sugerencia", () => {
    expect(fuente).not.toContain("salida_desde");
    expect(fuente).not.toContain("salida-sugerida");
  });
});

describe("la oficina sigue pudiendo cargarla", () => {
  it("el alta y la corrección de la oficina conservan el selector", () => {
    expect(readFileSync("src/features/operaciones/NuevoViajePage.tsx", "utf8")).toContain("SelectorDeSalida");
    expect(readFileSync("src/features/operaciones/EditarCabecera.tsx", "utf8")).toContain("salida_desde");
  });
});
