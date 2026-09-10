import { describe, it, expect } from "vitest";
import { vaciosEntreViajes, kmVacios } from "@shared/vacios";
import { TRIP_STATUS } from "@shared/domain";

/**
 * Un viaje cancelado no partió la cadena de vacíos ni sumó toneladas.
 *
 * Lo encontró el cliente probando: arrancó tres viajes, los canceló, y le quedaron
 * figurando como tramos vacíos en la ficha del camión. Control ya los filtraba
 * (`api/routes/lecturas.ts`); la ficha (`api/routes/reports.ts`) no, así que las dos
 * pantallas mostraban vacíos distintos del mismo camión.
 *
 * El daño no es cosmético: un cancelado con destino a otra punta del país mete un tramo
 * inventado de cientos de km y, peor, DESPLAZA los tramos reales — el hueco deja de ir
 * del viaje bueno al viaje bueno y pasa a medirse contra un lugar donde el camión
 * nunca estuvo.
 */

const viaje = (id: number, started_at: string, origin: string, destination: string, status = TRIP_STATUS.COMPLETADO) =>
  ({ id, started_at, origin, destination, kilometros: null, status });

/** Dos viajes reales pegados: Mdeo→Bella Unión y después Artigas→Mdeo. */
const REALES = [
  viaje(1, "2026-09-01 08:00:00", "Mdeo", "Bella Unión"),
  viaje(2, "2026-09-03 08:00:00", "Artigas", "Mdeo"),
];

const paraVacios = (ts: typeof REALES) =>
  ts
    .filter((t) => t.status !== TRIP_STATUS.CANCELADO)
    .map((t) => ({ id: t.id, started_at: t.started_at, origin: t.origin, destination: t.destination, kilometros: t.kilometros }));

describe("los viajes cancelados en la ficha del camión", () => {
  it("no inventan un tramo vacío", () => {
    const soloReales = vaciosEntreViajes(paraVacios(REALES));
    // Bella Unión → Artigas, el único hueco real.
    expect(soloReales).toHaveLength(1);
    expect(soloReales[0].desde).toBe("Bella Unión");
    expect(soloReales[0].hasta).toBe("Artigas");

    const conCancelado = [
      ...REALES,
      viaje(3, "2026-09-02 08:00:00", "Minas", "Rivera", TRIP_STATUS.CANCELADO),
    ].sort((a, b) => a.started_at.localeCompare(b.started_at));

    expect(vaciosEntreViajes(paraVacios(conCancelado))).toEqual(soloReales);
  });

  it("y sin filtrarlos, el cancelado además DESPLAZA el tramo real", () => {
    // La prueba de que no alcanza con que el total dé parecido: el tramo bueno
    // (Bella Unión → Artigas) desaparece y lo reemplazan dos que no existieron.
    const todos = [
      ...REALES,
      viaje(3, "2026-09-02 08:00:00", "Minas", "Rivera", TRIP_STATUS.CANCELADO),
    ].sort((a, b) => a.started_at.localeCompare(b.started_at));

    const sinFiltrar = vaciosEntreViajes(
      todos.map((t) => ({ id: t.id, started_at: t.started_at, origin: t.origin, destination: t.destination, kilometros: t.kilometros })),
    );
    expect(sinFiltrar.map((t) => `${t.desde}→${t.hasta}`)).toEqual([
      "Bella Unión→Minas",
      "Rivera→Artigas",
    ]);
    expect(kmVacios(sinFiltrar)).not.toBe(kmVacios(vaciosEntreViajes(paraVacios(todos))));
  });

  it("no suman toneladas: el camión no cargó nada", () => {
    const conKilos = [
      { ...REALES[0], kilos_carga: 29_000 },
      { ...REALES[1], kilos_carga: 28_000 },
      { ...viaje(3, "2026-09-02 08:00:00", "Minas", "Rivera", TRIP_STATUS.CANCELADO), kilos_carga: 30_000 },
    ];
    const tons = conKilos
      .filter((t) => t.status !== TRIP_STATUS.CANCELADO)
      .reduce((s, t) => s + (t.kilos_carga ?? 0), 0);
    expect(tons).toBe(57_000);
  });
});
