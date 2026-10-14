import { describe, expect, it } from "vitest";
import { BUSCAR_CARGA_DESDE, REGLAS_BUSCAR_CARGA, reglaDeBuscarCarga } from "@shared/buscar-carga";
import { auditoriaKilometros } from "@shared/domain";
import { KM_VACIO_MINIMO, paraVacios, vaciosDelPeriodo, vaciosEntreViajes } from "@shared/vacios";

/**
 * Los km de "ir a buscar carga" con reglas fijas del cliente (Rodrigo, 13 y 14/10/2026): si el camión terminó en
 * Bella Unión y va a cargar a Artigas son 137 km; si va a cargar a ALUR (plantilla 12), 15. Sin preguntarle nada al
 * chofer, por lugar y no por plantilla anterior, sin el piso de 70 km, y sólo para viajes desde el 1/10/2026.
 */

const PLANTILLAS_MDEO_BELLA_UNION = [5, 19, 20, 22];
const CASARONE = 1;
const MANASSI_ARTIGAS_MINAS = 11;
const MANASSI_ALUR = 12;
const AGENCIA_ARTIGAS = 28; // Bella Unión → Artigas, ya cargado

let siguienteId = 1;
function viaje(
  inicio: string,
  origen: string,
  destino: string,
  plantilla: number | null,
  extra: Record<string, unknown> = {},
) {
  return paraVacios({
    id: siguienteId++,
    started_at: inicio,
    origin: origen,
    destination: destino,
    kilometros: null,
    segments: [],
    template_id: plantilla,
    ...extra,
  });
}
const bellaUnion = (inicio: string, plantilla = 5) => viaje(inicio, "Mdeo", "Bella Unión", plantilla);

describe("las reglas de km de buscar carga", () => {
  it("Bella Unión → carga en Artigas con Casarone: 137 km fijos, un solo tramo", () => {
    const t = vaciosEntreViajes([bellaUnion("2026-10-06 14:00:00"), viaje("2026-10-08 10:00:00", "Artigas", "Montevideo", CASARONE)]);
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ desde: "Bella Unión", hasta: "Artigas", km: 137, tipo: "buscar_carga" });
  });

  it("también con la ida y vuelta de Manassi Artigas - Minas", () => {
    const t = vaciosEntreViajes([
      bellaUnion("2026-10-06 14:00:00"),
      viaje("2026-10-08 10:00:00", "Artigas", "Minas", MANASSI_ARTIGAS_MINAS),
    ]);
    expect(t).toMatchObject([{ desde: "Bella Unión", hasta: "Artigas", km: 137, tipo: "buscar_carga" }]);
  });

  it.each(PLANTILLAS_MDEO_BELLA_UNION)("da lo mismo qué viaje lo dejó en Bella Unión: la plantilla %i", (plantilla) => {
    const t = vaciosEntreViajes([
      bellaUnion("2026-10-06 14:00:00", plantilla),
      viaje("2026-10-08 10:00:00", "Artigas", "Montevideo", CASARONE),
    ]);
    expect(t).toMatchObject([{ km: 137, tipo: "buscar_carga" }]);
  });

  it("es por lugar: cualquier viaje que termine en Bella Unión, escrito como se escriba", () => {
    for (const fin of ["BU", "bella union", "Bella Unión", "BELLA UNIÓN"]) {
      const t = vaciosEntreViajes([
        viaje("2026-10-06 14:00:00", "Mdeo", fin, null),
        viaje("2026-10-08 10:00:00", "Artigas", "Montevideo", CASARONE),
      ]);
      expect(t, fin).toMatchObject([{ km: 137, tipo: "buscar_carga" }]);
    }
  });

  it("Bella Unión → carga en ALUR (plantilla 12): 15 km, aunque sea menos que el piso de 70", () => {
    expect(15).toBeLessThan(KM_VACIO_MINIMO);
    const t = vaciosEntreViajes([
      bellaUnion("2026-10-06 14:00:00"),
      viaje("2026-10-08 10:00:00", "Bella Unión", "Minas", MANASSI_ALUR),
    ]);
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ desde: "Bella Unión", hasta: "Bella Unión", km: 15, tipo: "buscar_carga" });
  });

  it("la excepción de Rodrigo: si el viaje anterior es «Agencia Artigas» (cargado hasta Artigas), no hay nada que buscar", () => {
    const t = vaciosEntreViajes([
      bellaUnion("2026-10-06 14:00:00"),
      viaje("2026-10-07 09:00:00", "Bella Unión", "Artigas", AGENCIA_ARTIGAS),
      viaje("2026-10-08 10:00:00", "Artigas", "Montevideo", CASARONE),
    ]);
    expect(t.filter((x) => x.tipo === "buscar_carga")).toHaveLength(0);
    // Bella Unión → Bella Unión (el origen de la agencia) es el mismo lugar, y Artigas → Artigas también: ningún tramo.
    expect(t).toHaveLength(0);
  });

  it("le gana al retorno: si el camión venía de cargar en Artigas y quedó en Bella Unión, sigue siendo buscar carga", () => {
    const t = vaciosEntreViajes([
      viaje("2026-10-06 14:00:00", "Artigas", "Bella Unión", null, { kilometros: 140 }),
      viaje("2026-10-08 10:00:00", "Artigas", "Montevideo", CASARONE),
    ]);
    expect(t).toMatchObject([{ km: 137, tipo: "buscar_carga" }]);
  });

  it("ignora la salida que el chofer haya cargado en esos pares", () => {
    const t = vaciosEntreViajes([
      bellaUnion("2026-10-06 14:00:00"),
      viaje("2026-10-08 10:00:00", "Artigas", "Montevideo", CASARONE, { salida_desde: "Salto" }),
    ]);
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ desde: "Bella Unión", hasta: "Artigas", km: 137, tipo: "buscar_carga" });
  });
});

describe("antes del 1/10/2026 no cambia ni un km", () => {
  it("el mismo par de setiembre sigue siendo una reposición estimada, no un tramo de regla", () => {
    const t = vaciosEntreViajes([
      bellaUnion("2026-09-20 14:00:00"),
      viaje("2026-09-22 10:00:00", "Artigas", "Montevideo", CASARONE),
    ]);
    expect(t).toMatchObject([{ desde: "Bella Unión", hasta: "Artigas", tipo: "reposicion" }]);
    expect(t[0].km).toBeGreaterThan(0);
  });

  it("Alur en setiembre sigue sin tramo (Bella Unión → Bella Unión es 0 km)", () => {
    const t = vaciosEntreViajes([
      bellaUnion("2026-09-20 14:00:00"),
      viaje("2026-09-22 10:00:00", "Bella Unión", "Minas", MANASSI_ALUR),
    ]);
    expect(t).toEqual([]);
  });

  it("la salida del chofer sigue valiendo en setiembre", () => {
    const t = vaciosEntreViajes([
      viaje("2026-09-10 08:00:00", "Artigas", "Montevideo", CASARONE, { kilometros: 627 }),
      viaje("2026-09-14 08:00:00", "Artigas", "Montevideo", CASARONE, { salida_desde: "Bella Unión" }),
    ]);
    expect(t.map((x) => `${x.desde}→${x.hasta}`)).toEqual(["Montevideo→Bella Unión", "Bella Unión→Artigas"]);
    expect(t.every((x) => x.tipo === "reposicion")).toBe(true);
  });

  it("el corte es la medianoche de Uruguay, no la de UTC: 02:59 UTC del 1/10 todavía es 30/9", () => {
    const antes = reglaDeBuscarCarga("Bella Unión", { started_at: "2026-10-01 02:59:59", origin: "Artigas" });
    const despues = reglaDeBuscarCarga("Bella Unión", { started_at: "2026-10-01 03:00:00", origin: "Artigas" });
    expect(antes).toBeNull();
    expect(despues?.km).toBe(137);
    expect(BUSCAR_CARGA_DESDE).toBe("2026-10-01");
  });

  it("una fecha ilegible no aplica la regla en vez de romper", () => {
    expect(reglaDeBuscarCarga("Bella Unión", { started_at: "ayer", origin: "Artigas" })).toBeNull();
  });
});

describe("los pares sin regla siguen como hoy", () => {
  it("Montevideo → Artigas es un retorno con los km del viaje", () => {
    const t = vaciosEntreViajes([
      viaje("2026-10-02 08:00:00", "Artigas", "Montevideo", CASARONE, { kilometros: 627 }),
      viaje("2026-10-06 08:00:00", "Artigas", "Montevideo", CASARONE),
    ]);
    expect(t).toMatchObject([{ desde: "Montevideo", hasta: "Artigas", km: 627, tipo: "retorno" }]);
  });

  it("Rivera → Artigas es una reposición estimada, con su piso de 70", () => {
    const t = vaciosEntreViajes([
      viaje("2026-10-02 08:00:00", "Montevideo", "Rivera", null),
      viaje("2026-10-06 08:00:00", "Artigas", "Montevideo", CASARONE),
    ]);
    expect(t).toMatchObject([{ desde: "Rivera", hasta: "Artigas", tipo: "reposicion" }]);
  });

  it("Bella Unión → un lugar que no tiene regla (Concordia) se estima como siempre", () => {
    const t = vaciosEntreViajes([
      bellaUnion("2026-10-02 08:00:00"),
      viaje("2026-10-06 08:00:00", "Concordia", "Montevideo", null),
    ]);
    expect(t).toMatchObject([{ desde: "Bella Unión", hasta: "Concordia", tipo: "reposicion" }]);
  });

  it("de Bella Unión a Alur con otra plantilla que no es la 12, no es la regla de 15", () => {
    expect(reglaDeBuscarCarga("Bella Unión", { started_at: "2026-10-08 10:00:00", origin: "Bella Unión", template_id: 30 })).toBeNull();
  });
});

describe("cómo cuentan en los totales", () => {
  const viajes = [
    bellaUnion("2026-10-06 14:00:00"),
    viaje("2026-10-08 10:00:00", "Artigas", "Montevideo", CASARONE),
    bellaUnion("2026-10-12 14:00:00"),
    viaje("2026-10-14 10:00:00", "Bella Unión", "Minas", MANASSI_ALUR),
  ];

  it("el resumen suma los km fijos en «a buscar carga», no en retorno", () => {
    const r = vaciosDelPeriodo(viajes, "2026-10-01", "2026-10-31");
    expect(r.km_reposicion).toBeGreaterThanOrEqual(137 + 15);
    expect(r.km_retorno).toBe(0);
  });

  it("Control los resta de los km sin justificar igual que cualquier otro «a buscar carga»", () => {
    const tramos = vaciosEntreViajes(viajes).filter((t) => t.tipo === "buscar_carga");
    const a = auditoriaKilometros(
      "2026-10",
      { kilometraje: 11_000, tomada_at: "2026-11-01 10:00:00" },
      { kilometraje: 1_000, tomada_at: "2026-10-01 10:00:00" },
      [],
      tramos,
    );
    expect(a.km_reposicion).toBe(137 + 15);
    expect(a.km_sin_justificar).toBe(10_000 - 152);
  });
});

describe("la tabla de reglas", () => {
  it("tiene las dos reglas del cliente, la más específica (ALUR) antes que la general", () => {
    expect(REGLAS_BUSCAR_CARGA.map((r) => [r.siguiente.plantilla ?? r.siguiente.origen, r.km])).toEqual([
      [12, 15],
      ["Artigas", 137],
    ]);
  });

  it("crece sin tocar la lógica: una regla nueva en la tabla se aplica", () => {
    const reglas = [...REGLAS_BUSCAR_CARGA, { fin: "Salto", siguiente: { origen: "Artigas" }, km: 225, motivo: "prueba" }];
    expect(reglaDeBuscarCarga("Salto", { started_at: "2026-10-08 10:00:00", origin: "Artigas" }, reglas)?.km).toBe(225);
    expect(reglaDeBuscarCarga("Salto", { started_at: "2026-10-08 10:00:00", origin: "Artigas" })).toBeNull();
  });
});
