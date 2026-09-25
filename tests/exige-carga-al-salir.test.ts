import { describe, it, expect } from "vitest";
import { app } from "../api/app";
import { signToken } from "../api/lib/crypto";
import { sqlDeAlta } from "../api/repos/templates";
import { ROLES } from "@shared/domain";

/**
 * Plantillas que piden la carga ANTES de salir.
 *
 * "En Otros Viajes ellos tienen que agregar una carga para que les deje iniciar, porque hoy les
 * figura en curso sin ellos haber cargado nada." — Rodrigo, 24/9/2026. Pero "el UAM Bella Unión →
 * Mdeo sí está bien, porque carga en el camino": por eso es un tilde de la plantilla
 * (`exige_carga_al_salir`) y no una regla escrita en el código.
 *
 * Lo que tiene que ser cierto: con el tilde, el alta del chofer sin carga se frena en el
 * SERVIDOR y con un mensaje que el chofer entienda; sin el tilde nada cambia; la oficina no se
 * frena; y una plantilla que no admite cargas no deja al chofer sin poder salir.
 */

const SECRET = "test-secret-tsm";

function plantilla(opciones: Record<string, unknown> = {}) {
  return {
    id: 26,
    provider_id: 7,
    provider_name: "OTROS VIAJES",
    name: "Viaje COMBINADO",
    origin: "",
    remite: null,
    cargo_type: "Otros",
    dest_options: "[]",
    fields: "[]",
    arrival_photo_label: null,
    carga_photo_label: null,
    campos_ubicacion: JSON.stringify({
      origen: { modo: "libreta", libreta_tipo: "departamento", permite_alta: true, requerido: true },
    }),
    multi_renglon: 1,
    renglon_pide_ubicacion: 1,
    renglon_pide_departamento: 0,
    renglones_fijos: null,
    exige_carga_al_salir: 1,
    pide_kilometros: 0,
    viaje_vacio: 0,
    foto_carga_requerida: 1,
    active: 1,
    truck_ids: "",
    ...opciones,
  };
}

function viaje() {
  return {
    id: 1,
    template_id: 26,
    provider_name: "OTROS VIAJES",
    origin: "",
    remite: null,
    destination: "",
    destinatario: null,
    driver_id: 1,
    truck_id: 1,
    cargo_type: "Otros",
    kilos: null,
    field_values: "{}",
    status: "EN_CURSO",
    started_at: "2026-09-25 10:00:00",
    finished_at: null,
    notes: null,
    created_at: "2026-09-25 10:00:00",
    segments: "[]",
    kilometros: null,
    edited_by: null,
    edited_at: null,
    factura_numero: null,
    facturado_at: null,
    facturado_by: null,
    driver_name: "Carlos Méndez",
    truck_plate: "GTP 4413",
  };
}

type Escritura = { sql: string; binds: unknown[] };

function fakeDB(escrituras: Escritura[], tpl: ReturnType<typeof plantilla>) {
  const responder = (q: string) => {
    if (q.includes("from users")) return { id: 2, role: ROLES.ENCARGADO };
    if (q.includes("from lecturas_odometro")) return { id: 1, truck_id: 1, periodo: "2026-09" };
    if (q.includes("from trip_templates")) return tpl;
    if (q.includes("from trips") && q.includes("t.status = 'en_curso'")) return null;
    if (q.includes("from trips")) return viaje();
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
          return { meta: { last_row_id: 1, changes: 1 } };
        },
      };
      return stmt;
    },
    batch: async () => [],
  } as unknown as D1Database;
}

async function alta(tpl: ReturnType<typeof plantilla>, cuerpo: Record<string, unknown>, rol: string = ROLES.CHOFER) {
  const escrituras: Escritura[] = [];
  const token = await signToken(
    {
      id: 2,
      name: "Quien sea",
      role: rol,
      driver_id: rol === ROLES.CHOFER ? 1 : null,
      truck_id: rol === ROLES.CHOFER ? 1 : null,
      email: null,
    } as any,
    SECRET,
  );
  const res = await app.request(
    "/api/trips",
    {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ template_id: tpl.id, field_values: {}, ...cuerpo }),
    },
    { DB: fakeDB(escrituras, tpl), JWT_SECRET: SECRET } as any,
    { waitUntil: () => {}, passThroughOnException: () => {} } as any,
  );
  return { status: res.status, escrituras, body: (await res.json()) as any };
}

const CARGA = {
  sid: "c1",
  origen: "Artigas",
  destino: "Montevideo",
  remitente: "Galpón Prueba",
  clientes: ["Depósito Mdeo"],
  cantidad: 15000,
  unidad: "pallets",
};

describe("el alta del chofer con una plantilla que pide la carga para salir", () => {
  it("sin carga se frena en el servidor, con un mensaje que se entiende", async () => {
    const { status, body, escrituras } = await alta(plantilla(), {});
    expect(status).toBe(400);
    expect(body.error).toBe("Para salir tenés que agregar la carga.");
    // No quedó ningún viaje creado.
    expect(escrituras.find((e) => e.sql.includes("insert into trips"))).toBeUndefined();
  });

  it("con la carga en el mismo pedido, el viaje sale", async () => {
    const { status, escrituras } = await alta(plantilla(), { segments: [CARGA] });
    expect(status).toBe(200);
    expect(escrituras.find((e) => e.sql.includes("insert into trips"))).toBeDefined();
  });

  it("el viaje que nace con carga ya trae el recorrido de esa carga, no 'a definir'", async () => {
    const { escrituras } = await alta(plantilla(), { segments: [CARGA] });
    const recorrido = escrituras.find((e) => e.sql.includes("update trips set origin=?, destination=?"));
    expect(recorrido!.binds.slice(0, 2)).toEqual(["Artigas", "Montevideo"]);
  });

  it("una lista de cargas vacía cuenta como sin carga", async () => {
    const { status } = await alta(plantilla(), { segments: [] });
    expect(status).toBe(400);
  });
});

describe("lo que NO se frena", () => {
  // UAM Bella Unión → Mdeo: carga en el camino, no lleva el tilde.
  it("sin el tilde, salir sin carga sigue andando como siempre", async () => {
    const { status } = await alta(plantilla({ exige_carga_al_salir: 0 }), {});
    expect(status).toBe(200);
  });

  it("si la plantilla ya trae la carga puesta por la oficina, ya hay carga", async () => {
    const fijo = [
      { sid: "f1", remitente: "Agencia", clientes: ["Galpón"], cobro_tipo: "cliente", cobro_a: "Agencia" },
    ];
    const { status } = await alta(plantilla({ renglones_fijos: JSON.stringify(fijo) }), {});
    expect(status).toBe(200);
  });

  it("una plantilla que no admite cargas ignora el tilde: no deja al chofer sin poder salir", async () => {
    const { status } = await alta(plantilla({ multi_renglon: 0, renglon_pide_ubicacion: 0 }), { destino: "Salto" });
    expect(status).not.toBe(400);
  });

  it("la oficina no se frena: sus viajes nacen cerrados, ya pasaron", async () => {
    const { body } = await alta(plantilla(), { driver_id: 1, truck_id: 1 }, ROLES.ENCARGADO);
    expect(body.error).not.toBe("Para salir tenés que agregar la carga.");
  });
});

describe("la plantilla guarda el tilde", () => {
  it("el alta lo incluye entre las columnas, y por defecto está apagado", () => {
    const base = {
      provider_id: 7,
      name: "X",
      origin: "",
      remite: null,
      cargo_type: "",
      dest_options: [],
      fields: [],
      arrival_photo_label: null,
      carga_photo_label: null,
      campos_ubicacion: null,
      multi_renglon: true,
      renglon_pide_ubicacion: false,
      renglon_pide_departamento: false,
      renglones_fijos: null,
      pide_kilometros: false,
      viaje_vacio: false,
      foto_carga_requerida: true,
      truck_ids: null,
      active: true,
    };
    const encendido = sqlDeAlta({ ...base, exige_carga_al_salir: true } as any);
    const columnas = encendido.sql.split("VALUES")[0];
    expect(columnas).toContain("exige_carga_al_salir");
    expect(encendido.binds[columnas.replace(/.*\(/s, "").split(",").map((c) => c.trim()).indexOf("exige_carga_al_salir")]).toBe(1);

    const apagado = sqlDeAlta({ ...base, exige_carga_al_salir: false } as any);
    expect(apagado.binds).toContain(0);
  });
});
