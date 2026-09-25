import { describe, it, expect } from "vitest";
import { descargasDelViaje, type Descarga } from "@shared/domain";

/**
 * Las descargas de un viaje, del modelo que sea.
 *
 * Conviven dos: el anterior (la descarga vive en `destino` y `clientes[0]` de cada carga: 23 viajes
 * en producción) y el nuevo (`trip.descargas`, por lugar). Nada se convierte: se lee de los dos
 * lados, y un viaje viejo tiene que verse igual que antes.
 */

const carga = (sid: string, destino: string | null, clientes: string[]) => ({ sid, destino, clientes });

describe("descargasDelViaje", () => {
  it("modelo nuevo: la lista del viaje, tal cual", () => {
    const d: Descarga[] = [{ sid: "d1", departamento: "Salto", lugar: "Molino", kilos: 500, pallets: null }];
    expect(descargasDelViaje({ descargas: d, segments: [carga("a", "Artigas", ["Otro"])] })).toBe(d);
  });

  it("modelo anterior: una descarga por cada par distinto de las cargas", () => {
    const r = descargasDelViaje({
      descargas: null,
      segments: [carga("a", "Salto", ["Molino"]), carga("b", "Salto", ["MOLINO"]), carga("c", "Artigas", ["UAM"])],
    });
    expect(r.map((x) => [x.departamento, x.lugar])).toEqual([
      ["Salto", "Molino"],
      ["Artigas", "UAM"],
    ]);
    expect(r[0]).toMatchObject({ kilos: null, pallets: null });
  });

  it("modelo anterior: una carga sin destino ni lugar no inventa una descarga", () => {
    expect(descargasDelViaje({ segments: [carga("a", null, [])] })).toEqual([]);
  });

  it("modelo anterior con sólo una parte: se conserva lo que hay", () => {
    expect(descargasDelViaje({ segments: [carga("a", "Salto", [])] })).toEqual([
      { sid: "a", departamento: "Salto", lugar: "", kilos: null, pallets: null },
    ]);
  });

  it("un viaje sin nada de descargas da una lista vacía", () => {
    expect(descargasDelViaje({})).toEqual([]);
  });

  it("una lista nueva VACÍA cuenta como modelo nuevo: no se lee de las cargas", () => {
    expect(descargasDelViaje({ descargas: [], segments: [carga("a", "Salto", ["Molino"])] })).toEqual([]);
  });
});
