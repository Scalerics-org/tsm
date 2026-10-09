import { describe, expect, it } from "vitest";
import { kmEstimados } from "@shared/distancias";
import { kmEstimadosDelViaje, paradasDelViaje } from "@shared/vacios";

/**
 * Los km estimados de un viaje suman TODAS sus paradas, no sólo la punta y la punta.
 *
 * "Descargamos en estancias, en el medio, y no las considera." (Rodrigo, 10/10). Un viaje de Artigas a
 * Montevideo que descarga antes en Salto recorre Artigas → Salto → Montevideo, que es más que el directo.
 */

const descarga = (departamento: string) => ({ departamento });
const directo = (a: string, b: string) => kmEstimados(a, b) as number;

describe("kmEstimadosDelViaje con descargas por lugar", () => {
  it("una descarga en el medio suma el desvío: Artigas → Salto → Montevideo", () => {
    const km = kmEstimadosDelViaje({
      origin: "Artigas",
      destination: "Montevideo",
      segments: [],
      descargas: [descarga("Salto"), descarga("Montevideo")],
    });
    expect(km).toBe(directo("Artigas", "Salto") + directo("Salto", "Montevideo"));
    expect(km).toBeGreaterThan(directo("Artigas", "Montevideo"));
  });

  it("nunca da menos que el directo", () => {
    for (const medio of ["Salto", "Paysandú", "Rivera", "Florida", "Minas"]) {
      const km = kmEstimadosDelViaje({
        origin: "Artigas",
        destination: "Montevideo",
        descargas: [descarga(medio), descarga("Montevideo")],
      });
      expect(km).toBeGreaterThanOrEqual(directo("Artigas", "Montevideo"));
    }
  });

  it("cuenta también donde cargó cada carga, en orden", () => {
    const km = kmEstimadosDelViaje({
      origin: "Artigas",
      destination: "Montevideo",
      segments: [{ origen: "Artigas" }, { origen: "Salto" }],
      descargas: [descarga("Montevideo")],
    });
    expect(km).toBe(directo("Artigas", "Salto") + directo("Salto", "Montevideo"));
  });

  it("una sola descarga en el destino da lo mismo que el directo", () => {
    const km = kmEstimadosDelViaje({
      origin: "Artigas",
      destination: "Montevideo",
      descargas: [descarga("Montevideo")],
    });
    expect(km).toBe(directo("Artigas", "Montevideo"));
  });

  it("las grafías distintas del mismo lugar no inventan un tramo (Mdeo = Montevideo)", () => {
    const km = kmEstimadosDelViaje({
      origin: "Artigas",
      destination: "Mdeo",
      descargas: [descarga("Montevideo"), descarga("MONTEVIDEO")],
    });
    expect(km).toBe(directo("Artigas", "Montevideo"));
  });

  it("una vuelta se conserva: Artigas → Minas → Artigas son los dos tramos", () => {
    const km = kmEstimadosDelViaje({
      origin: "Artigas",
      destination: "Artigas",
      descargas: [descarga("Minas"), descarga("Artigas")],
    });
    expect(km).toBe(directo("Artigas", "Minas") + directo("Minas", "Artigas"));
  });

  it("si un tramo tiene un lugar que la app no conoce, vuelve al directo de siempre", () => {
    const km = kmEstimadosDelViaje({
      origin: "Artigas",
      destination: "Montevideo",
      descargas: [descarga("Estancia Perdida"), descarga("Montevideo")],
    });
    expect(km).toBe(directo("Artigas", "Montevideo"));
  });
});

describe("lo que no cambia", () => {
  it("un viaje sin descargas por lugar da el directo, como hoy", () => {
    expect(kmEstimadosDelViaje({ origin: "Artigas", destination: "Montevideo", segments: [] })).toBe(
      directo("Artigas", "Montevideo"),
    );
    expect(paradasDelViaje({ origin: "Artigas", segments: [], descargas: null })).toBeNull();
    expect(paradasDelViaje({ origin: "Artigas", segments: [], descargas: [] })).toBeNull();
  });

  it("los cuatro viajes de Artigas a Montevideo de una sola descarga siguen en 627 km", () => {
    const km = kmEstimadosDelViaje({
      origin: "Artigas",
      destination: "Montevideo",
      segments: [],
      descargas: [descarga("Montevideo")],
    });
    expect(km).toBe(627);
  });

  it("la ida y vuelta de Manassi (modelo viejo) sigue sumando los dos tramos", () => {
    const km = kmEstimadosDelViaje({
      origin: "Artigas",
      destination: "Minas",
      segments: [
        { origen: "Artigas", destino: "Minas" },
        { origen: "Minas", destino: "Artigas" },
      ],
    });
    expect(km).toBe(directo("Artigas", "Minas") + directo("Minas", "Artigas"));
  });

  it("un destino desconocido sigue dando null", () => {
    expect(kmEstimadosDelViaje({ origin: "Artigas", destination: "Lugar Raro", segments: [] })).toBeNull();
  });
});
