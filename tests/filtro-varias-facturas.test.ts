import { describe, it, expect } from "vitest";
import { listaDeFacturas, pasaFiltroDeCobro } from "../shared/facturacion-por-cliente";
import { sqlFiltros } from "../api/repos/trips";

/**
 * Elegir más de una factura para filtrar la lista y exportar el Excel (pedido de Rodrigo).
 * Pasa el viaje que tenga CUALQUIERA de las elegidas.
 */
const viaje = (factura_numero: string | null) => ({ status: "COMPLETADO", factura_numero, pago_at: null, segments: [] });

describe("listaDeFacturas", () => {
  it("acepta una sola, varias o nada, sin vacías ni repetidas", () => {
    expect(listaDeFacturas("6041")).toEqual(["6041"]);
    expect(listaDeFacturas(["6041", " 6042 ", "", "6041", "a-1", "A-1"])).toEqual(["6041", "6042", "a-1"]);
    expect(listaDeFacturas(undefined)).toEqual([]);
    expect(listaDeFacturas("  ")).toEqual([]);
  });
});

describe("pasaFiltroDeCobro con varias facturas", () => {
  it("pasa el viaje con cualquiera de ellas, sin distinguir mayúsculas", () => {
    const f = { factura: ["6041", "saman"] };
    expect(pasaFiltroDeCobro(viaje("6041"), [], f)).toBe(true);
    expect(pasaFiltroDeCobro(viaje("SAMAN"), [], f)).toBe(true);
    expect(pasaFiltroDeCobro(viaje("6049"), [], f)).toBe(false);
    expect(pasaFiltroDeCobro(viaje(null), [], f)).toBe(false);
  });

  it("una sola como texto sigue funcionando igual que antes", () => {
    expect(pasaFiltroDeCobro(viaje("6041"), [], { factura: "6041" })).toBe(true);
    expect(pasaFiltroDeCobro(viaje("6042"), [], { factura: "6041" })).toBe(false);
  });

  it("sin facturas elegidas no filtra nada", () => {
    expect(pasaFiltroDeCobro(viaje("6042"), [], { factura: [] })).toBe(true);
  });

  it("por cliente, pasa si alguna de las facturas de sus clientes está elegida", () => {
    const porCliente = {
      status: "COMPLETADO",
      factura_numero: null,
      segments: [
        { cobro_a: "Jair", clientes: ["Jair"] },
        { cobro_a: "BMR", clientes: ["BMR"] },
      ] as never,
    };
    const marcas = [
      { cliente_clave: "jair", factura_numero: "6041", pago_at: null },
      { cliente_clave: "bmr", factura_numero: "6042", pago_at: null },
    ];
    expect(pasaFiltroDeCobro(porCliente, marcas, { factura: ["6042", "9999"] })).toBe(true);
    expect(pasaFiltroDeCobro(porCliente, marcas, { factura: ["9999"] })).toBe(false);
  });
});

describe("sqlFiltros con varias facturas", () => {
  const signos = (sql: string) => (sql.match(/\?/g) ?? []).length;

  it("una sola: la consulta de siempre", () => {
    const { sql, binds } = sqlFiltros({ factura: ["6041"] });
    expect(sql).toContain("lower(trim(t.factura_numero)) = lower(trim(?))");
    expect(binds).toEqual(["6041"]);
  });

  it("varias: cualquiera de ellas, con los binds en orden", () => {
    const { sql, binds } = sqlFiltros({ provider: "UAM", factura: ["6041", "6042"], from: "2026-09-01" });
    expect(sql).toContain("IN (lower(trim(?)), lower(trim(?)))");
    expect(binds).toEqual(["UAM", "6041", "6042", "2026-09-01"]);
    expect(signos(sql)).toBe(binds.length);
  });
});
