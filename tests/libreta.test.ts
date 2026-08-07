import { describe, it, expect } from "vitest";
import {
  resolveCobro,
  aplicarCobro,
  completarPendientes,
  normalizeNombre,
  type CobroRegla,
  type TripSegment,
} from "@shared/domain";

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

describe("aplicarCobro (herencia de la regla en cada renglón)", () => {
  const base = { sid: "s1", cantidad: null, unidad: null, remito: null, cliente_ids: [] as number[] };

  it("cada renglón hereda según su propio par", () => {
    const r = aplicarCobro(REGLAS, [
      { ...base, remitente: "Armco", remitente_id: 1, clientes: ["Varios Clientes"], cliente_ids: [10] },
      { ...base, remitente: "Armco", remitente_id: 1, clientes: ["Galpón"], cliente_ids: [11] },
      { ...base, remitente: "Agencia", remitente_id: 2, clientes: ["Ancap"], cliente_ids: [99] },
    ]);
    expect(r.map((s) => s.cobro_tipo)).toEqual(["cliente", "proveedor", "proveedor"]);
    expect(r.every((s) => s.cobro_manual === false)).toBe(true);
  });

  it("sin regla queda pendiente, no inventa un cobro", () => {
    const r = aplicarCobro(REGLAS, [
      { ...base, remitente: "Timber", remitente_id: 77, clientes: ["Jair"], cliente_ids: [50] },
    ]);
    expect(r[0].cobro_tipo).toBeNull();
    expect(r[0].cobro_a).toBeNull();
  });

  it("con varios clientes usa el primero que tenga regla", () => {
    // Timber → Jair y Agronorte: alcanza con que uno matchee para saber a quién se factura.
    const reglas: CobroRegla[] = [
      { id: 9, remitente_id: 77, destinatario_id: 51, cobro_tipo: "cliente", cobro_a: "Timber" },
    ];
    const r = aplicarCobro(reglas, [
      { ...base, remitente: "Timber", remitente_id: 77, clientes: ["Jair", "Agronorte"], cliente_ids: [50, 51] },
    ]);
    expect(r[0].cobro_tipo).toBe("cliente");
    expect(r[0].cobro_a).toBe("Timber");
  });

  it("no pisa un cobro puesto a mano por la oficina", () => {
    const previos = [
      { ...base, remitente: "Armco", remitente_id: 1, clientes: [], cliente_ids: [],
        cobro_tipo: "proveedor" as const, cobro_a: "Excepción", cobro_manual: true },
    ];
    const r = aplicarCobro(REGLAS, previos);
    expect(r[0].cobro_a).toBe("Excepción");
    expect(r[0].cobro_manual).toBe(true);
  });
});

describe("completarPendientes (la oficina define una regla nueva)", () => {
  function carga(s: Partial<TripSegment> = {}): TripSegment {
    return {
      sid: "s1",
      remitente: "Armco",
      remitente_id: 1,
      clientes: ["Galpón"],
      cliente_ids: [11],
      cantidad: null,
      unidad: null,
      remito: null,
      cobro_tipo: null,
      cobro_a: null,
      cobro_manual: false,
      ...s,
    };
  }

  it("destraba las cargas que estaban esperando la regla", () => {
    // Sin esto el contador de pendientes nunca bajaría: la regla solo valdría para lo futuro.
    const r = completarPendientes(REGLAS, [carga(), carga()]);
    expect(r.map((s) => s.cobro_tipo)).toEqual(["proveedor", "proveedor"]);
  });

  it("no reescribe una carga que ya tenía cobro", () => {
    const previa = carga({ cobro_tipo: "cliente", cobro_a: "Lo facturado" });
    expect(completarPendientes(REGLAS, [previa])[0].cobro_a).toBe("Lo facturado");
  });

  it("respeta el override manual de la oficina", () => {
    const manual = carga({ cobro_tipo: null, cobro_a: null, cobro_manual: true });
    const r = completarPendientes(REGLAS, [manual])[0];
    expect(r.cobro_tipo).toBeNull();
    expect(r.cobro_manual).toBe(true);
  });

  it("lo que sigue sin regla sigue pendiente, no se inventa", () => {
    const r = completarPendientes(REGLAS, [carga({ remitente: "Timber", remitente_id: 77 })]);
    expect(r[0].cobro_tipo).toBeNull();
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
