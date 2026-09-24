import { describe, it, expect } from "vitest";
import { app } from "../api/app";
import { signToken } from "../api/lib/crypto";
import { FIELD_STAGE, ROLES, missingField, type TripTemplate } from "@shared/domain";
import { destinoAlCierre, partesAlCerrar, valoresDeRuta } from "@shared/en-ruta";

/**
 * Los internacionales: el MIC en el puente y el destino al cerrar.
 *
 * "Tipo que le pida iniciar viaje, y donde cargo. Después para continuar, que le pida el nro
 * del MIC y la foto. Y luego sí cerrarlo. Cuando lleguen: departamento, donde descargo, kilos y
 * foto." — Rodrigo, 18/9/2026.
 *
 * Lo que tiene que ser cierto: que al salir no se le pida ni el MIC ni el destino; que en el
 * camino sólo pueda completar los datos del puente (no cambiarle al viaje el remito o el peso);
 * y que el cierre no deje pasar un internacional sin MIC o sin destino — con el destino
 * guardado ANTES de estimar los km, que salen de él.
 */

const SECRET = "test-secret-tsm";

const CAMPOS = [
  { key: "nro_mic", label: "N° de MIC", type: "numero", required: true, stage: "ruta" },
  { key: "ton_carga", label: "Kilos de Descarga", type: "numero", required: true, stage: "descarga", is_weight: true },
];

const UBICACION = {
  origen: { modo: "libreta", label: "Origen", libreta_tipo: "lugar", permite_alta: true },
  remitente: { modo: "texto", label: "Lugar de carga" },
  destino: { modo: "libreta", label: "Destino", libreta_tipo: "departamento", permite_alta: false, al_cerrar: true },
  destinatario: { modo: "texto", label: "Lugar de descarga", al_cerrar: true },
};

/** La fila de trip_templates como la devuelve la base: los JSON como texto. */
function plantilla(ubicacion: unknown = UBICACION) {
  return {
    id: 9,
    provider_id: 5,
    provider_name: "Internacional",
    name: "Internacional Minabel",
    origin: "",
    remite: null,
    cargo_type: "Internacional",
    dest_options: "[]",
    fields: JSON.stringify(CAMPOS),
    arrival_photo_label: "Remito de descarga",
    carga_photo_label: "Hoja MIC",
    campos_ubicacion: JSON.stringify(ubicacion),
    multi_renglon: 0,
    renglon_pide_ubicacion: 0,
    renglon_pide_departamento: 0,
    renglones_fijos: null,
    pide_kilometros: 0,
    viaje_vacio: 0,
    foto_carga_requerida: 1,
    active: 1,
    truck_ids: "",
  };
}

/** La fila de trips: un internacional que salió de Concordia, todavía sin destino. */
function viaje(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    template_id: 9,
    provider_name: "Internacional",
    origin: "Concordia",
    remite: "Galpón 3",
    destination: "",
    destinatario: null,
    driver_id: 1,
    truck_id: 1,
    cargo_type: "Internacional",
    kilos: null,
    field_values: "{}",
    status: "EN_CURSO",
    started_at: "2026-09-18 07:30:00",
    finished_at: null,
    notes: null,
    created_at: "2026-09-18 07:30:00",
    segments: "[]",
    kilometros: null,
    edited_by: null,
    edited_at: null,
    factura_numero: null,
    facturado_at: null,
    facturado_by: null,
    driver_name: "Carlos Méndez",
    truck_plate: "STZ 4821",
    ...overrides,
  };
}

type Escritura = { sql: string; binds: unknown[] };

interface Base {
  trip?: ReturnType<typeof viaje> | null;
  tpl?: ReturnType<typeof plantilla>;
  /** El chofer ya tiene un viaje abierto (para el alta). */
  abierto?: boolean;
}

function fakeDB(escrituras: Escritura[], base: Base, role: string) {
  const responder = (q: string) => {
    // El rol se relee de la base en cada pedido (ver `usuarioDeOficina`): tiene que coincidir
    // con el del token que firma `pedir`.
    if (q.includes("from users")) return { id: 2, role };
    if (q.includes("from lecturas_odometro")) return { id: 1, truck_id: 1, periodo: "2026-09" };
    if (q.includes("from trip_templates")) return base.tpl ?? plantilla();
    // El viaje abierto del chofer: el alta lo mira antes de crear uno.
    if (q.includes("from trips") && q.includes("t.status = 'en_curso'")) return base.abierto ? base.trip : null;
    if (q.includes("from trips")) return base.trip ?? null;
    if (q.includes("from drivers")) return { id: 1, status: "activo", default_truck_id: 1 };
    return null;
  };
  return {
    prepare(sql: string) {
      let binds: unknown[] = [];
      const q = sql.replace(/\s+/g, " ").trim().toLowerCase();
      const stmt = {
        bind: (...b: unknown[]) => {
          binds = b;
          return stmt;
        },
        first: async () => responder(q),
        all: async () => ({ results: [] }),
        run: async () => {
          escrituras.push({ sql: q, binds });
          return { meta: { last_row_id: 1 } };
        },
      };
      return stmt;
    },
    batch: async () => [],
  } as unknown as D1Database;
}

const token = (role: string) =>
  signToken(
    {
      id: 2,
      name: "Quien sea",
      role,
      driver_id: role === ROLES.CHOFER ? 1 : null,
      truck_id: role === ROLES.CHOFER ? 1 : null,
      email: null,
    } as any,
    SECRET,
  );

async function pedir(url: string, method: string, json: unknown, base: Base, rol: string = ROLES.CHOFER) {
  const escrituras: Escritura[] = [];
  const res = await app.request(
    url,
    {
      method,
      headers: { authorization: `Bearer ${await token(rol)}`, "content-type": "application/json" },
      body: JSON.stringify(json),
    },
    { DB: fakeDB(escrituras, base, rol), JWT_SECRET: SECRET } as any,
    { waitUntil: () => {}, passThroughOnException: () => {} } as any,
  );
  return { status: res.status, escrituras, body: (await res.json()) as any };
}

const escribio = (e: Escritura[], texto: string) => e.find((x) => x.sql.includes(texto));

describe("PATCH /api/trips/:id/campos — el MIC en el puente", () => {
  it("guarda el N° de MIC sin perder lo que el viaje ya tenía", async () => {
    const base = { trip: viaje({ field_values: JSON.stringify({ otro: "x" }) }) };
    const { status, escrituras } = await pedir("/api/trips/1/campos", "PATCH", { field_values: { nro_mic: " 4417 " } }, base);
    expect(status).toBe(200);
    const w = escribio(escrituras, "set field_values");
    expect(JSON.parse(w!.binds[0] as string)).toEqual({ otro: "x", nro_mic: "4417" });
    expect(w!.sql).toContain("status='en_curso'");
  });

  it("no deja tocar un campo que no es del camino: el peso lo corrige la oficina", async () => {
    const { status, escrituras } = await pedir(
      "/api/trips/1/campos",
      "PATCH",
      { field_values: { nro_mic: "4417", ton_carga: "1" } },
      { trip: viaje() },
    );
    expect(status).toBe(400);
    expect(escrituras).toHaveLength(0);
  });

  it("un MIC que no es número se rechaza", async () => {
    const { status, body, escrituras } = await pedir("/api/trips/1/campos", "PATCH", { field_values: { nro_mic: "abc" } }, { trip: viaje() });
    expect(status).toBe(400);
    expect(body.error).toMatch(/N° de MIC/);
    expect(escrituras).toHaveLength(0);
  });

  it("con el viaje ya cerrado da 409 y no escribe", async () => {
    const { status, escrituras } = await pedir(
      "/api/trips/1/campos",
      "PATCH",
      { field_values: { nro_mic: "4417" } },
      { trip: viaje({ status: "COMPLETADO", destination: "Durazno" }) },
    );
    expect(status).toBe(409);
    expect(escrituras).toHaveLength(0);
  });

  it("el viaje de otro chofer no se toca", async () => {
    const { status, escrituras } = await pedir(
      "/api/trips/1/campos",
      "PATCH",
      { field_values: { nro_mic: "4417" } },
      { trip: viaje({ driver_id: 7 }) },
    );
    expect(status).toBe(403);
    expect(escrituras).toHaveLength(0);
  });
});

describe("POST /api/trips/:id/finish — lo que el cierre exige", () => {
  const COMPLETO = { field_values: { nro_mic: "4417", ton_carga: "29710" }, destino: "Durazno", destinatario: "Barraca Paraná" };

  it("sin el MIC no cierra: si no lo cargó en el puente, se lo pide acá", async () => {
    const { status, body, escrituras } = await pedir(
      "/api/trips/1/finish",
      "POST",
      { ...COMPLETO, field_values: { ton_carga: "29710" } },
      { trip: viaje() },
    );
    expect(status).toBe(400);
    expect(body.error).toBe("Falta: N° de MIC");
    expect(escrituras).toHaveLength(0);
  });

  it("sin el destino no cierra, y el viaje queda como estaba", async () => {
    const { status, body, escrituras } = await pedir(
      "/api/trips/1/finish",
      "POST",
      { ...COMPLETO, destino: undefined },
      { trip: viaje() },
    );
    expect(status).toBe(400);
    expect(body.error).toBe("Falta: Destino");
    expect(escrituras).toHaveLength(0);
  });

  it("sin el lugar de descarga tampoco", async () => {
    const { status, body } = await pedir("/api/trips/1/finish", "POST", { ...COMPLETO, destinatario: "  " }, { trip: viaje() });
    expect(status).toBe(400);
    expect(body.error).toBe("Falta: Lugar de descarga");
  });

  it("con todo, guarda el destino ANTES de estimar los km, pasa el peso a kilos y cierra", async () => {
    const { status, escrituras } = await pedir("/api/trips/1/finish", "POST", COMPLETO, { trip: viaje() });
    expect(status).toBe(200);

    const destino = escrituras.findIndex((e) => e.sql.includes("set destination=?, destinatario=?"));
    expect(escrituras[destino].binds).toEqual(["Durazno", "Barraca Paraná", 1]);

    // Concordia → Durazno la app lo conoce: con el destino vacío, la estimación daba null.
    const km = escrituras.findIndex((e) => e.sql.includes("set kilometros=?"));
    expect(km).toBeGreaterThan(destino);
    expect(escrituras[km].binds[0]).toEqual(expect.any(Number));

    expect(escribio(escrituras, "set kilos=?")?.binds).toEqual([29710, 1]);
    const cierre = escribio(escrituras, "status='completado'");
    expect(JSON.parse(cierre!.binds[1] as string)).toEqual({ nro_mic: "4417", ton_carga: "29710" });
  });

  it("un viaje que salió antes del cambio, con destino y MIC, cierra sin que se los vuelvan a pedir", async () => {
    const antes = viaje({
      destination: "Durazno",
      destinatario: "Barraca Paraná",
      field_values: JSON.stringify({ nro_mic: "4417" }),
    });
    const { status, escrituras } = await pedir(
      "/api/trips/1/finish",
      "POST",
      { field_values: { ton_carga: "29710" }, destino: "Florida" },
      { trip: antes },
    );
    expect(status).toBe(200);
    // El destino que eligió al salir vale: el cierre no lo cambia.
    expect(escribio(escrituras, "set destination=?")).toBeUndefined();
  });
});

describe("POST /api/trips — al salir, sólo dónde cargó", () => {
  const SALIDA = { template_id: 9, origin: "Concordia", remitente: "Galpón 3", field_values: {} };

  it("el chofer arranca sin destino cuando la plantilla lo deja para el cierre", async () => {
    const { status, escrituras } = await pedir("/api/trips", "POST", SALIDA, { trip: viaje() });
    expect(status).toBe(200);
    const alta = escribio(escrituras, "insert into trips");
    // origin, remite, destination, destinatario van en las posiciones 2 a 5.
    expect(alta!.binds.slice(2, 6)).toEqual(["Concordia", "Galpón 3", "", null]);
  });

  it("sin la marca de 'al cerrar', el destino se sigue exigiendo", async () => {
    const { destino, destinatario, ...resto } = UBICACION;
    const sinMarca = plantilla({ ...resto, destino: { ...destino, al_cerrar: undefined }, destinatario });
    const { status, body } = await pedir("/api/trips", "POST", SALIDA, { trip: viaje(), tpl: sinMarca });
    expect(status).toBe(400);
    expect(body.error).toBe("Elegí el destino");
  });

  it("la oficina sí tiene que mandarlo: su viaje nace cerrado y no hay cierre después", async () => {
    const { status, body } = await pedir(
      "/api/trips",
      "POST",
      { ...SALIDA, driver_id: 1, truck_id: 1 },
      { trip: viaje() },
      ROLES.ENCARGADO,
    );
    expect(status).toBe(400);
    expect(body.error).toBe("Elegí el destino");
  });
});

describe("las reglas compartidas", () => {
  const TPL = { fields: CAMPOS } as unknown as Pick<TripTemplate, "fields">;

  it("missingField con la etapa del camino", () => {
    expect(missingField(TPL, FIELD_STAGE.RUTA, {})).toBe("N° de MIC");
    expect(missingField(TPL, FIELD_STAGE.RUTA, { nro_mic: "4417" })).toBeNull();
    // Y la carga ya no lo pide: al salir no lo tiene.
    expect(missingField(TPL, FIELD_STAGE.CARGA, {})).toBeNull();
  });

  it("valoresDeRuta: vacío vale (se completa después), sin datos no", () => {
    expect(valoresDeRuta(TPL.fields, { nro_mic: "" })).toEqual({ values: { nro_mic: "" } });
    expect(valoresDeRuta(TPL.fields, {})).toEqual({ error: "Faltan los datos" });
    expect(valoresDeRuta(TPL.fields, null)).toEqual({ error: "Faltan los datos" });
  });

  it("un destino fijo no se pregunta al cerrar aunque tenga la marca", () => {
    const fijo = { destino: { modo: "fijo", valor: "Montevideo", al_cerrar: true } } as any;
    expect(partesAlCerrar(fijo, { destination: "", destinatario: null })).toEqual({});
  });

  it("un destino opcional puede quedar sin elegir", () => {
    const opcional = { destino: { ...UBICACION.destino, requerido: false } } as any;
    const r = destinoAlCierre(opcional, { destination: "", destinatario: null }, {});
    expect(r).toEqual({ destination: "", destinatario: null, cambia: false });
  });
});
