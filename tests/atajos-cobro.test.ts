import { describe, it, expect } from "vitest";
import { atajosDeCarga } from "../src/features/operaciones/atajos-cobro";

const libreta = [
  { id: 20, nombre: "Galpón Santa María BU" },
  { id: 49, nombre: "Agronorte" },
];

describe("atajosDeCarga", () => {
  it("el botón dice el nombre actual de la libreta, no el que quedó escrito en la carga", () => {
    const r = atajosDeCarga({ clientes: ["Galpón"], cliente_ids: [20] }, libreta);
    expect(r).toEqual([{ id: 20, nombre: "Galpón Santa María BU" }]);
  });

  it("uno por destinatario, en el orden de la carga", () => {
    const r = atajosDeCarga({ clientes: ["Agronorte", "Galpón"], cliente_ids: [49, 20] }, libreta);
    expect(r.map((a) => a.id)).toEqual([49, 20]);
  });

  it("un destinatario que ya no es elegible no ofrece atajo", () => {
    expect(atajosDeCarga({ clientes: ["Varios Clientes"], cliente_ids: [26] }, libreta)).toEqual([]);
  });

  it("sin ids no hay atajos: no se inventan a partir de un texto", () => {
    expect(atajosDeCarga({ clientes: ["Galpón"], cliente_ids: [] }, libreta)).toEqual([]);
  });

  it("un id repetido cuenta una vez", () => {
    expect(atajosDeCarga({ clientes: ["A", "B"], cliente_ids: [49, 49] }, libreta)).toHaveLength(1);
  });
});
