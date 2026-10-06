import { describe, it, expect } from "vitest";
import { TIPOS_DE_VEHICULO, posiciones, tipoDeVehiculo } from "../src/features/taller/disposicion";

/**
 * Los tipos de vehículo como los pasó Rodrigo: nombres exactos y en orden, cantidad de cubiertas, cómo se numeran las
 * posiciones y cada cuántos km toca el service.
 */

const por = (id: string) => tipoDeVehiculo(id);

describe("los tipos de vehículo", () => {
  it("son estos nombres, en este orden", () => {
    expect(TIPOS_DE_VEHICULO.map((t) => t.nombre)).toEqual([
      "Camión tractor",
      "Camión tractor sencillo",
      "Camión doble eje",
      "Camión chico",
      "Remolque tres ejes",
      "Remolque dos ejes",
      "Sorra sencilla",
      "Sorra doble eje",
    ]);
  });

  it("cada uno lleva las cubiertas que tiene", () => {
    const cantidad = Object.fromEntries(TIPOS_DE_VEHICULO.map((t) => [t.nombre, posiciones(t).length]));
    expect(cantidad).toEqual({
      "Camión tractor": 10,
      "Camión tractor sencillo": 6,
      "Camión doble eje": 10,
      "Camión chico": 6,
      "Remolque tres ejes": 12,
      "Remolque dos ejes": 8,
      "Sorra sencilla": 4,
      "Sorra doble eje": 6,
    });
  });

  it("el camión tractor y el sencillo llevan quinta rueda; el doble eje y el chico, caja de carga", () => {
    expect([por("tractor"), por("tractor-sencillo")].map((t) => t.carroceria)).toEqual(["tractor", "tractor"]);
    expect([por("doble-eje"), por("camion-chico")].map((t) => t.carroceria)).toEqual(["rigido", "rigido"]);
  });

  it("el service es cada 25.000 km los grandes y 15.000 el chico; remolques y sorras no tienen service por km", () => {
    expect(["tractor", "tractor-sencillo", "doble-eje"].map((id) => por(id).intervaloServiceKm)).toEqual([25_000, 25_000, 25_000]);
    expect(por("camion-chico").intervaloServiceKm).toBe(15_000);
    for (const id of ["remolque-3", "remolque-2", "sorra-sencilla", "sorra-doble"]) expect(por(id).intervaloServiceKm).toBeNull();
  });

  it("remolques duales y sorras simples, y lo dicen como 'a confirmar'", () => {
    for (const id of ["remolque-3", "remolque-2"]) {
      expect(por(id).ejes.every((e) => e.tipo === "dual")).toBe(true);
      expect(por(id).aConfirmar).toMatch(/A confirmar/);
    }
    for (const id of ["sorra-sencilla", "sorra-doble"]) {
      expect(por(id).ejes.every((e) => e.tipo === "simple")).toBe(true);
      expect(por(id).aConfirmar).toMatch(/A confirmar/);
    }
  });

  it("la sorra sencilla tiene un eje delantero y uno trasero; la doble, un delantero y dos traseros", () => {
    expect(por("sorra-sencilla").ejes.map((e) => e.nombre)).toEqual(["Eje delantero", "Eje trasero"]);
    expect(por("sorra-doble").ejes.map((e) => e.nombre)).toEqual(["Eje delantero", "Eje trasero 1", "Eje trasero 2"]);
  });

  it("la numeración va de adelante hacia atrás y, en cada eje dual: izquierda exterior, izquierda interior, derecha interior, derecha exterior", () => {
    const nombres = posiciones(por("tractor-sencillo")).map((p) => `${p.numero} ${p.nombre}`);
    expect(nombres).toEqual([
      "1 Dirección · izquierda",
      "2 Dirección · derecha",
      "3 Eje trasero · izquierda exterior",
      "4 Eje trasero · izquierda interior",
      "5 Eje trasero · derecha interior",
      "6 Eje trasero · derecha exterior",
    ]);
  });

  it("los ejes no se pisan en el dibujo: queda aire entre una fila de cubiertas y la siguiente", () => {
    for (const t of TIPOS_DE_VEHICULO) {
      const ys = t.ejes.map((e) => e.y);
      for (let i = 1; i < ys.length; i++) expect(ys[i] - ys[i - 1]).toBeGreaterThanOrEqual(80);
    }
  });
});
