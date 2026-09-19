import { describe, it, expect } from "vitest";
import { clientesDeCarga, sqlFiltros } from "../api/repos/trips";

/**
 * El filtro por cliente de la carga, en Viajes.
 *
 * "Ahí no están todos los clientes. Todos los clientes que están en el viaje Mdeo Bella Unión,
 * esos son clientes a cobrar, y no puedo filtrarlos." — Rodrigo, 16/9/2026.
 *
 * El desplegable de siempre lista los VIAJES (`trips.provider_name`). Adentro de un viaje van
 * cargas para otros clientes —Armco, Agronorte— que no son el nombre de ningún viaje.
 */

const signos = (sql: string) => (sql.match(/\?/g) ?? []).length;

describe("sqlFiltros con cliente de la carga", () => {
  it("busca adentro de las cargas: en los clientes y en a quién se cobra", () => {
    const { sql, binds } = sqlFiltros({ cliente: "Armco" });
    expect(sql).toContain("json_each");
    expect(sql).toContain("$.cobro_a");
    expect(sql).toContain("$.clientes");
    expect(sql).toContain("$.remitente");
    expect(binds).toEqual(["Armco", "Armco", "Armco"]);
    expect(signos(sql)).toBe(binds.length);
  });

  it("no toca el filtro por viaje, que usan el Excel y la facturación", () => {
    const { sql, binds } = sqlFiltros({ provider: "UAM" });
    expect(sql).toContain("t.provider_name = ?");
    expect(sql).not.toContain("json_each");
    expect(binds).toEqual(["UAM"]);
  });

  it("los dos juntos se suman, con los binds en orden", () => {
    const { sql, binds } = sqlFiltros({ provider: "Montevideo - BU", cliente: "Agronorte", from: "2026-09-01" });
    expect(binds).toEqual(["Montevideo - BU", "Agronorte", "Agronorte", "Agronorte", "2026-09-01"]);
    expect(signos(sql)).toBe(binds.length);
  });
});

describe("clientesDeCarga — las opciones del desplegable", () => {
  it("junta clientes y cobros, sin repetir aunque cambie la mayúscula o haya espacios", () => {
    const opciones = clientesDeCarga([
      { nombre: "Armco", cobra: 1 },
      { nombre: "ARMCO ", cobra: 0 },
      { nombre: "Jair", cobra: 0 },
      { nombre: "Agronorte", cobra: 0 },
      { nombre: "agronorte", cobra: 1 },
    ]);
    expect(opciones).toEqual([
      { nombre: "Agronorte", cobra: true, soloCarga: false },
      { nombre: "Armco", cobra: true, soloCarga: false },
      { nombre: "Jair", cobra: false, soloCarga: false },
    ]);
  });

  it("descarta vacíos y nulos", () => {
    expect(clientesDeCarga([{ nombre: null, cobra: 1 }, { nombre: "  ", cobra: 0 }])).toEqual([]);
  });

  it("ordena como se lee en castellano", () => {
    const opciones = clientesDeCarga([
      { nombre: "Óptica", cobra: 0 },
      { nombre: "Nayna", cobra: 0 },
      { nombre: "Ñandú", cobra: 0 },
    ]);
    expect(opciones.map((o) => o.nombre)).toEqual(["Nayna", "Ñandú", "Óptica"]);
  });
});

/**
 * "Acá en la parte de viajes no tengo cómo poner un tick, color tipo Excel, a los facturados.
 * Porque ahí yo filtro por mes, por camión, y ya sé qué viaje está facturado y cuál no." —
 * Rodrigo, 16/9/2026.
 */
describe("sqlFiltros por facturación", () => {
  it("facturados: los que tienen número de factura", () => {
    const { sql, binds } = sqlFiltros({ facturado: "si" });
    expect(sql).toContain("t.factura_numero IS NOT NULL");
    expect(binds).toEqual([]);
  });

  it("sin facturar: completados y sin número (un cancelado no se factura)", () => {
    const { sql } = sqlFiltros({ facturado: "no" });
    expect(sql).toContain("t.factura_numero IS NULL AND t.status = 'COMPLETADO'");
  });

  it("sin el filtro no se toca nada", () => {
    expect(sqlFiltros({}).sql).not.toContain("factura_numero IS");
  });
});

/**
 * "Ahora los internacionales son 3 clientes diferentes, tengo que facturar uno, y tengo la
 * opción de filtrar sólo por Internacional. Tengo que entrar adentro de cada viaje para ver
 * cuál es." — Rodrigo, 18/9/2026. Para los choferes no cambia nada: se filtra por tipo de
 * viaje (la plantilla) adentro del cliente.
 */
describe("sqlFiltros por tipo de viaje", () => {
  it("filtra por la plantilla", () => {
    const { sql, binds } = sqlFiltros({ provider: "Internacional", templateId: 8 });
    expect(sql).toContain("t.template_id = ?");
    expect(binds).toEqual(["Internacional", 8]);
  });

  it("la lista trae el nombre del tipo de viaje", () => {
    expect(sqlFiltros({}).sql).toContain("AS template_name");
  });
});

describe("clientesDeCarga — lugares de carga (Otros Viajes)", () => {
  it("un lugar donde sólo se cargó queda aparte; si también es cliente, no", () => {
    const o = clientesDeCarga([
      { nombre: "Maccio", cobra: 0, remite: 1 },
      { nombre: "UAM", cobra: 0, remite: 1 },
      { nombre: "UAM", cobra: 0, remite: 0 },
    ]);
    expect(o).toEqual([
      { nombre: "Maccio", cobra: false, soloCarga: true },
      { nombre: "UAM", cobra: false, soloCarga: false },
    ]);
  });
});
