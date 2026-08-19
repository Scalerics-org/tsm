import { describe, it, expect } from "vitest";
import { litrosTotales } from "@shared/domain";

/**
 * "En parte de litros de gas oil. Las 3 ventanas. (gas oil tanque 1 + gas oil tanque 2,
 * litros totales)." — los camiones cargan en dos tanques.
 *
 * El total NO se tipea: se suma. Un total escrito a mano que no coincida con la suma deja
 * el consumo mintiendo y no habría forma de saber cuál de los tres números está bien.
 */
describe("litrosTotales", () => {
  it("suma los dos tanques", () => {
    expect(litrosTotales(180, 120)).toBe(300);
  });

  it("con un solo tanque cargado, ése es el total", () => {
    expect(litrosTotales(180, null)).toBe(180);
    expect(litrosTotales(null, 120)).toBe(120);
  });

  it("sin ninguno devuelve null, no cero", () => {
    // Es la diferencia entre "no cargó nada" y "cargó 0 litros": con cero, el cálculo de
    // consumo dividiría por cero y la surtida se guardaría vacía sin que nadie se entere.
    expect(litrosTotales(null, null)).toBeNull();
    expect(litrosTotales(undefined, undefined)).toBeNull();
  });

  it("un cero escrito sí cuenta", () => {
    expect(litrosTotales(0, 120)).toBe(120);
    expect(litrosTotales(0, 0)).toBe(0);
  });

  it("acepta decimales, que es como marca el surtidor", () => {
    expect(litrosTotales(180.5, 119.5)).toBe(300);
  });

  it("descarta lo que no es un número", () => {
    expect(litrosTotales(NaN, 120)).toBe(120);
    expect(litrosTotales(Infinity, 120)).toBe(120);
  });
});
