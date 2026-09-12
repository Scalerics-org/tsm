import { describe, it, expect } from "vitest";
import { mergeEntries, renombrarEnCargas } from "../api/repos/libreta";

/**
 * Renombrar y fusionar tienen que arrastrar las cargas ya registradas.
 *
 * `trips.segments` es JSON y guarda el id Y el nombre, copiados al crear la carga. Antes estas
 * dos operaciones tocaban la libreta y las reglas de cobro y dejaban las cargas como estaban:
 *
 * - Después de una FUSIÓN la carga seguía apuntando al id borrado. Ninguna regla la alcanza
 *   —`resolveCobro` busca por id— y la tarjeta de pendientes ofrecía definir una regla contra
 *   una entrada que ya no existe, con `cobro_reglas.remitente_id NOT NULL REFERENCES libreta`.
 * - Después de un RENOMBRE, el Excel y el resumen del cliente seguían saliendo con el nombre
 *   viejo.
 */

function fakeDB(viajes: { id: number; segments: string }[]) {
  const updates: { sql: string; binds: unknown[] }[] = [];
  const db = {
    prepare(sql: string) {
      const stmt: any = {
        bind: (...binds: unknown[]) => {
          if (/update trips/i.test(sql)) updates.push({ sql, binds });
          return stmt;
        },
        first: async () => (/from libreta/i.test(sql) ? { id: 7, nombre: "TIMBER" } : null),
        all: async () => ({ results: viajes }),
        run: async () => ({ meta: {} }),
      };
      return stmt;
    },
    batch: async () => [],
  } as unknown as D1Database;
  return { db, updates };
}

const carga = (remitenteId: number | null, nombre: string, clienteIds: (number | null)[] = [], clientes: string[] = []) =>
  JSON.stringify([
    { sid: "a", remitente: nombre, remitente_id: remitenteId, clientes, cliente_ids: clienteIds, cantidad: 12, unidad: "pallets" },
  ]);

describe("fusionar arrastra las cargas", () => {
  it("la carga pasa a apuntar al id que queda, con su nombre", async () => {
    const { db, updates } = fakeDB([{ id: 1, segments: carga(3, "Timber SA") }]);
    await mergeEntries(db, 3, 7);
    expect(updates).toHaveLength(1);
    const guardado = JSON.parse(updates[0].binds[0] as string);
    expect(guardado[0].remitente_id).toBe(7);
    expect(guardado[0].remitente).toBe("TIMBER");
  });

  it("también los clientes de la carga, que son varios", async () => {
    const { db, updates } = fakeDB([{ id: 1, segments: carga(9, "OTRO", [3, 5], ["Timber SA", "Jair"]) }]);
    await mergeEntries(db, 3, 7);
    const guardado = JSON.parse(updates[0].binds[0] as string);
    expect(guardado[0].cliente_ids).toEqual([7, 5]);
    expect(guardado[0].clientes).toEqual(["TIMBER", "Jair"]);
  });

  it("no toca los viajes que no la nombran", async () => {
    const { db, updates } = fakeDB([{ id: 1, segments: carga(99, "Otra cosa") }]);
    await mergeEntries(db, 3, 7);
    expect(updates).toEqual([]);
  });

  it("un JSON roto se deja como está en vez de pisarlo", async () => {
    const { db, updates } = fakeDB([{ id: 1, segments: "{esto no es json" }]);
    await mergeEntries(db, 3, 7);
    expect(updates).toEqual([]);
  });
});

describe("renombrar arrastra el nombre", () => {
  it("la carga queda con el nombre nuevo y el mismo id", async () => {
    const { db, updates } = fakeDB([{ id: 1, segments: carga(4, "timber") }]);
    await renombrarEnCargas(db, 4, "TIMBER");
    const guardado = JSON.parse(updates[0].binds[0] as string);
    expect(guardado[0].remitente).toBe("TIMBER");
    expect(guardado[0].remitente_id).toBe(4);
  });
});
