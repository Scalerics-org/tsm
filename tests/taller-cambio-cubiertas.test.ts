import { describe, it, expect } from "vitest";
import { aplicarCambios } from "../src/features/taller/cambio-cubiertas";
import type { CubiertaEnStock } from "../src/features/taller/datos-extra";
import type { Cubierta } from "../src/features/taller/tipos";

/**
 * Un service que cambia una cubierta actualiza la ficha de su posición, el historial de esa posición y el stock.
 * Es la cuenta de la maqueta del Taller; el modelo real tendrá que respetar las mismas reglas.
 */

const cubierta = (numero: number, extra: Partial<Cubierta> = {}): Cubierta => ({
  numero,
  codigo: `TSM-${numero}`,
  modeloId: "multi",
  fecha: "2026-01-10",
  kmInicial: 60_000,
  obs: "",
  anteriores: [],
  ...extra,
});

const vehiculo = { patente: "GTP 4325", cubiertas: [cubierta(7), cubierta(8, { codigo: undefined, modeloId: "kmax" })] };
const service = { fecha: "2026-10-05", km: 151_273 };
const stock: CubiertaEnStock[] = [
  { codigo: "N-0103", modeloId: "r269", estado: "nueva", obs: "" },
  { codigo: "U-0211", modeloId: "multi", estado: "usada", obs: "" },
];

describe("una cubierta nueva en un service", () => {
  it("la ficha de la posición pasa a la nueva: arranca en 0 km contra el tacógrafo", () => {
    const r = aplicarCambios(vehiculo, service, [{ tipo: "nueva", numero: 7, modeloId: "fr85", codigo: "R-118" }], stock);
    const nueva = r.cubiertas.find((c) => c.numero === 7)!;
    expect(nueva).toMatchObject({ codigo: "R-118", modeloId: "fr85", fecha: "2026-10-05", kmInicial: 151_273 });
    expect(service.km - nueva.kmInicial).toBe(0);
  });

  it("la que estaba pasa al historial de esa posición, con sus km y el motivo", () => {
    const r = aplicarCambios(vehiculo, service, [{ tipo: "nueva", numero: 7, modeloId: "fr85", motivo: "Reventón en ruta" }], stock);
    const [anterior] = r.cubiertas.find((c) => c.numero === 7)!.anteriores;
    expect(anterior).toMatchObject({ codigo: "TSM-7", modeloId: "multi", desde: "2026-01-10", hasta: "2026-10-05", kmRecorridos: 91_273, motivo: "Reventón en ruta" });
  });

  it("sin motivo dice 'Cambio en service'", () => {
    const r = aplicarCambios(vehiculo, service, [{ tipo: "nueva", numero: 7, modeloId: "fr85" }], stock);
    expect(r.cubiertas.find((c) => c.numero === 7)!.anteriores[0].motivo).toBe("Cambio en service");
  });

  it("la que sale entra al stock como usada, con de dónde salió", () => {
    const r = aplicarCambios(vehiculo, service, [{ tipo: "nueva", numero: 7, modeloId: "fr85" }], stock);
    expect(r.usadas).toHaveLength(1);
    expect(r.usadas[0]).toMatchObject({ codigo: "TSM-7", modeloId: "multi", estado: "usada", obs: "Salió de GTP 4325 posición 7 el 05/10 · con 91.273 km" });
  });

  it("la nueva sin código se carga igual, y la vieja sin código también pasa al stock", () => {
    const r = aplicarCambios(vehiculo, service, [{ tipo: "nueva", numero: 8, modeloId: "r269" }], stock);
    expect(r.cubiertas.find((c) => c.numero === 8)!.codigo).toBeUndefined();
    expect(r.usadas[0].codigo).toBe("");
    expect(r.cubiertas.find((c) => c.numero === 8)!.anteriores[0].codigo).toBe("Sin código");
  });

  it("si salió del stock, toma su código y su modelo y se descuenta", () => {
    const r = aplicarCambios(vehiculo, service, [{ tipo: "nueva", numero: 7, modeloId: "fr85", delStock: "N-0103" }], stock);
    expect(r.cubiertas.find((c) => c.numero === 7)).toMatchObject({ codigo: "N-0103", modeloId: "r269" });
    expect(r.quitadasDelStock).toEqual(["N-0103"]);
  });

  it("una usada del stock no se puede descontar como si fuera nueva", () => {
    const r = aplicarCambios(vehiculo, service, [{ tipo: "nueva", numero: 7, modeloId: "fr85", delStock: "U-0211" }], stock);
    expect(r.quitadasDelStock).toEqual([]);
    expect(r.cubiertas.find((c) => c.numero === 7)!.modeloId).toBe("fr85");
  });

  it("no toca las demás posiciones ni el vehículo original", () => {
    const r = aplicarCambios(vehiculo, service, [{ tipo: "nueva", numero: 7, modeloId: "fr85" }], stock);
    expect(r.cubiertas.find((c) => c.numero === 8)).toEqual(vehiculo.cubiertas[1]);
    expect(vehiculo.cubiertas[0].codigo).toBe("TSM-7");
  });
});

describe("una rotación", () => {
  it("intercambia las cubiertas de las dos posiciones y no toca el stock", () => {
    const r = aplicarCambios(vehiculo, service, [{ tipo: "rotacion", numero: 7, haciaNumero: 8 }], stock);
    expect(r.cubiertas.find((c) => c.numero === 8)!.codigo).toBe("TSM-7");
    expect(r.cubiertas.find((c) => c.numero === 7)!.modeloId).toBe("kmax");
    expect(r.usadas).toEqual([]);
    expect(r.quitadasDelStock).toEqual([]);
  });

  it("si las dos posiciones se marcan una a la otra, se intercambian una sola vez", () => {
    const r = aplicarCambios(
      vehiculo,
      service,
      [
        { tipo: "rotacion", numero: 7, haciaNumero: 8 },
        { tipo: "rotacion", numero: 8, haciaNumero: 7 },
      ],
      stock,
    );
    expect(r.cubiertas.find((c) => c.numero === 8)!.codigo).toBe("TSM-7");
  });

  it("rotar hacia una posición vacía la mueve", () => {
    const r = aplicarCambios(vehiculo, service, [{ tipo: "rotacion", numero: 7, haciaNumero: 9 }], stock);
    expect(r.cubiertas.map((c) => c.numero)).toEqual([8, 9]);
  });
});
