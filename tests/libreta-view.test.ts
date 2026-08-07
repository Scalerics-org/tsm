import { describe, it, expect } from "vitest";
import type { CobroRegla, LibretaEntry, PendienteCobro } from "@shared/domain";
import {
  agruparPendientes,
  describirDestino,
  filtrarEntradas,
  nombrePorId,
  ordenarEntradas,
  reglasDeRemitente,
} from "@/lib/libreta-view";

function entrada(e: Partial<LibretaEntry> & { id: number; nombre: string }): LibretaEntry {
  return {
    tipo: "remitente",
    provider_id: null,
    agrupador: false,
    estado: "confirmado",
    usos: 0,
    created_by: null,
    ...e,
  };
}

function pendiente(p: Partial<PendienteCobro> & { trip_id: number }): PendienteCobro {
  return {
    remitente: "Armco",
    remitente_id: 1,
    clientes: ["Galpón"],
    cliente_ids: [20],
    cantidad: null,
    unidad: null,
    remito: null,
    cobro_tipo: null,
    cobro_a: null,
    cobro_manual: false,
    idx: 0,
    fecha: "2026-08-01",
    cliente: "Varios",
    ...p,
  };
}

describe("ordenarEntradas", () => {
  it("pone primero lo que la oficina tiene que revisar", () => {
    // Lo pendiente no se busca: tiene que aparecer arriba solo, aunque no se use nunca.
    const r = ordenarEntradas([
      entrada({ id: 1, nombre: "Armco", usos: 50 }),
      entrada({ id: 2, nombre: "Nuevo Lugar", estado: "nuevo", usos: 0 }),
    ]);
    expect(r.map((e) => e.id)).toEqual([2, 1]);
  });

  it("entre confirmadas manda el uso y después el nombre", () => {
    const r = ordenarEntradas([
      entrada({ id: 1, nombre: "Zeta", usos: 2 }),
      entrada({ id: 2, nombre: "Alfa", usos: 9 }),
      entrada({ id: 3, nombre: "Beta", usos: 2 }),
    ]);
    expect(r.map((e) => e.nombre)).toEqual(["Alfa", "Beta", "Zeta"]);
  });

  it("no muta el array recibido", () => {
    const original = [entrada({ id: 1, nombre: "Zeta" }), entrada({ id: 2, nombre: "Alfa" })];
    ordenarEntradas(original);
    expect(original.map((e) => e.id)).toEqual([1, 2]);
  });
});

describe("filtrarEntradas", () => {
  const LISTA = [
    entrada({ id: 1, nombre: "Galpón", provider_id: null }),
    entrada({ id: 2, nombre: "Armco", provider_id: 7 }),
    entrada({ id: 3, nombre: "Agronorte", provider_id: 8 }),
  ];

  it("busca ignorando acentos y mayúsculas", () => {
    expect(filtrarEntradas(LISTA, { query: "GALPON" }).map((e) => e.id)).toEqual([1]);
  });

  it("el filtro por cliente incluye las globales, que sirven a todos", () => {
    expect(filtrarEntradas(LISTA, { alcance: 7 }).map((e) => e.id)).toEqual([1, 2]);
  });

  it("'globales' deja solo las que no tienen cliente", () => {
    expect(filtrarEntradas(LISTA, { alcance: "globales" }).map((e) => e.id)).toEqual([1]);
  });

  it("sin filtros devuelve todo", () => {
    expect(filtrarEntradas(LISTA)).toHaveLength(3);
  });
});

describe("reglasDeRemitente", () => {
  const REGLAS: CobroRegla[] = [
    { id: 1, remitente_id: 1, destinatario_id: null, cobro_tipo: "proveedor", cobro_a: "General" },
    { id: 2, remitente_id: 1, destinatario_id: 20, cobro_tipo: "cliente", cobro_a: "Armco" },
    { id: 3, remitente_id: 2, destinatario_id: null, cobro_tipo: "proveedor", cobro_a: "Agencia" },
  ];

  it("trae solo las del remitente, con la general al final", () => {
    // Se leen en el mismo orden en que se aplican: primero el par exacto, después el fallback.
    expect(reglasDeRemitente(REGLAS, 1).map((r) => r.id)).toEqual([2, 1]);
  });

  it("un remitente sin reglas devuelve vacío", () => {
    expect(reglasDeRemitente(REGLAS, 99)).toEqual([]);
  });
});

describe("describirDestino", () => {
  const nombres = nombrePorId([entrada({ id: 20, nombre: "Galpón", tipo: "destinatario" })]);

  it("nombra el destinatario cuando la regla es de un par", () => {
    const r: CobroRegla = { id: 1, remitente_id: 1, destinatario_id: 20, cobro_tipo: "cliente", cobro_a: "x" };
    expect(describirDestino(r, nombres)).toBe("Galpón");
  });

  it("una regla sin destinatario aplica a cualquier destino", () => {
    const r: CobroRegla = { id: 1, remitente_id: 1, destinatario_id: null, cobro_tipo: "cliente", cobro_a: "x" };
    expect(describirDestino(r, nombres)).toBe("cualquier destino");
  });

  it("no rompe si el destinatario ya no está en la libreta", () => {
    const r: CobroRegla = { id: 1, remitente_id: 1, destinatario_id: 404, cobro_tipo: "cliente", cobro_a: "x" };
    expect(describirDestino(r, nombres)).toBe("#404");
  });
});

describe("agruparPendientes", () => {
  it("junta las cargas de la misma combinación y cuenta viajes sin repetir", () => {
    // El trabajo es una regla por combinación, no una por renglón: si se listaran sueltas
    // parecería trabajo diario algo que se hace una vez.
    const r = agruparPendientes([
      pendiente({ trip_id: 10 }),
      pendiente({ trip_id: 10, idx: 1 }),
      pendiente({ trip_id: 11 }),
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].cargas).toBe(3);
    expect(r[0].viajes).toEqual([10, 11]);
  });

  it("separa el mismo remitente cuando cambia el destino", () => {
    const r = agruparPendientes([
      pendiente({ trip_id: 1, clientes: ["Galpón"], cliente_ids: [20] }),
      pendiente({ trip_id: 2, clientes: ["Varios Clientes"], cliente_ids: [26] }),
    ]);
    expect(r).toHaveLength(2);
  });

  it("el orden de los clientes no arma dos grupos distintos", () => {
    const r = agruparPendientes([
      pendiente({ trip_id: 1, clientes: ["Jair", "Agronorte"], cliente_ids: [50, 51] }),
      pendiente({ trip_id: 2, clientes: ["Agronorte", "Jair"], cliente_ids: [51, 50] }),
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].cargas).toBe(2);
  });

  it("agrupa por nombre normalizado cuando el remitente no está en la libreta", () => {
    const r = agruparPendientes([
      pendiente({ trip_id: 1, remitente: "Polo Este", remitente_id: null }),
      pendiente({ trip_id: 2, remitente: "POLO ESTE", remitente_id: null }),
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].remitente_id).toBeNull();
  });

  it("ordena por cantidad de cargas: primero lo que más destraba", () => {
    const r = agruparPendientes([
      pendiente({ trip_id: 1, remitente: "Poco", remitente_id: 5 }),
      pendiente({ trip_id: 2, remitente: "Mucho", remitente_id: 6 }),
      pendiente({ trip_id: 3, remitente: "Mucho", remitente_id: 6 }),
    ]);
    expect(r.map((g) => g.remitente)).toEqual(["Mucho", "Poco"]);
  });

  it("sin pendientes no devuelve grupos", () => {
    expect(agruparPendientes([])).toEqual([]);
  });
});
