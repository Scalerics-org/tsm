import { describe, it, expect } from "vitest";
import { resolveCobro, normalizeNombre, type CobroRegla } from "@shared/domain";

// Libreta: 1=Armco, 2=Agencia (remitentes) · 10=Varios Clientes, 11=Galpón (destinatarios)
const REGLAS: CobroRegla[] = [
  { id: 1, remitente_id: 1, destinatario_id: 10, cobro_tipo: "cliente", cobro_a: "Varios Clientes" },
  { id: 2, remitente_id: 1, destinatario_id: 11, cobro_tipo: "proveedor", cobro_a: "Armco" },
  { id: 3, remitente_id: 2, destinatario_id: null, cobro_tipo: "proveedor", cobro_a: "Agencia" },
];

describe("resolveCobro", () => {
  it("usa el par exacto remitente+destinatario", () => {
    expect(resolveCobro(REGLAS, 1, 10)).toEqual({ cobro_tipo: "cliente", cobro_a: "Varios Clientes" });
  });

  it("un mismo remitente se cobra distinto según el destino", () => {
    // Este es el caso que obliga a que la clave sea el par y no solo el remitente.
    expect(resolveCobro(REGLAS, 1, 10).cobro_tipo).toBe("cliente");
    expect(resolveCobro(REGLAS, 1, 11).cobro_tipo).toBe("proveedor");
  });

  it("cae en la regla general del remitente (destinatario NULL)", () => {
    expect(resolveCobro(REGLAS, 2, 99)).toEqual({ cobro_tipo: "proveedor", cobro_a: "Agencia" });
  });

  it("prefiere el par exacto por sobre la regla general", () => {
    const reglas: CobroRegla[] = [
      { id: 1, remitente_id: 5, destinatario_id: null, cobro_tipo: "proveedor", cobro_a: "General" },
      { id: 2, remitente_id: 5, destinatario_id: 7, cobro_tipo: "cliente", cobro_a: "Exacta" },
    ];
    expect(resolveCobro(reglas, 5, 7).cobro_a).toBe("Exacta");
  });

  it("sin regla que matchee devuelve null (va a 'pendientes'), nunca adivina", () => {
    expect(resolveCobro(REGLAS, 1, 99)).toEqual({ cobro_tipo: null, cobro_a: null });
    expect(resolveCobro(REGLAS, 404, 10)).toEqual({ cobro_tipo: null, cobro_a: null });
    expect(resolveCobro([], 1, 10)).toEqual({ cobro_tipo: null, cobro_a: null });
  });

  it("sin remitente no resuelve nada", () => {
    expect(resolveCobro(REGLAS, null, 10)).toEqual({ cobro_tipo: null, cobro_a: null });
  });

  it("con destinatario desconocido igual aplica la regla general", () => {
    expect(resolveCobro(REGLAS, 2, null).cobro_tipo).toBe("proveedor");
  });
});

describe("normalizeNombre (detección de duplicados en la libreta)", () => {
  it("ignora mayúsculas, acentos y espacios de más", () => {
    expect(normalizeNombre("  Cruce  POLOESTE ")).toBe("cruce poloeste");
    expect(normalizeNombre("Galpón")).toBe(normalizeNombre("GALPON"));
    expect(normalizeNombre("Bella Unión")).toBe("bella union");
  });

  it("distingue nombres realmente distintos", () => {
    expect(normalizeNombre("Armco")).not.toBe(normalizeNombre("Agencia"));
  });
});
