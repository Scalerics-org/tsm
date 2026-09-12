import { describe, it, expect } from "vitest";
import { app } from "../api/app";
import { signToken } from "../api/lib/crypto";
import { ROLES } from "@shared/domain";

/**
 * El alta de un chofer desde la pantalla de Choferes.
 *
 * "SABES QUE QUIERO INGRESAR AL USUARIO DEL ULTIMO CAMION Y NO PUEDO. YO TENIA PARA PONERLES
 * LAS CONTRASEÑAS DESDE EL USUARIO OFFICINA PERO AHORA NO PUEDO." — Rodrigo, 12/9, sobre la
 * GTP 4267, el camión que acababa de dar de alta y que no tiene ningún chofer.
 *
 * El PIN es obligatorio para crear —sin PIN no hay con qué entrar— pero el formulario no lo
 * marcaba y `save()` no tenía `catch`: se apretaba Guardar y no pasaba nada. Estos tests fijan
 * qué contesta el servidor en cada caso, que es lo que la pantalla tiene que mostrar.
 */

const SECRET = "test-secret-tsm";

const CHOFER_NUEVO = {
  name: "Chofer del 4267",
  document: "1.234.567-8",
  license_number: "",
  license_category: "",
  license_expiry: "",
  phone: "",
  status: "activo",
  default_truck_id: 9,
};

/** D1 falso: anota las escrituras para poder afirmar que un rechazo no toca nada. */
function fakeDB(escrituras: string[]) {
  const stmt = (sql: string) => {
    const s = sql.trim().toLowerCase();
    return {
      bind: () => stmt(sql),
      first: async () => (s.startsWith("select") ? { id: 9, name: CHOFER_NUEVO.name } : null),
      all: async () => ({ results: [] }),
      run: async () => {
        escrituras.push(s.split(/\s+/).slice(0, 3).join(" "));
        return { meta: { last_row_id: 9 } };
      },
    };
  };
  return { prepare: (sql: string) => stmt(sql), batch: async () => [] } as unknown as D1Database;
}

const tokenAdmin = () =>
  signToken({ id: 2, name: "Rodrigo", role: ROLES.ADMIN, driver_id: null, truck_id: null, email: null } as any, SECRET);

async function alta(body: Record<string, unknown>) {
  const escrituras: string[] = [];
  const res = await app.request(
    "/api/drivers",
    {
      method: "POST",
      headers: { authorization: `Bearer ${await tokenAdmin()}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    },
    { DB: fakeDB(escrituras), JWT_SECRET: SECRET } as any,
  );
  return { status: res.status, json: (await res.json()) as any, escrituras };
}

describe("dar de alta un chofer con su PIN", () => {
  it("con PIN entra y queda creado", async () => {
    const { status, escrituras } = await alta({ ...CHOFER_NUEVO, pin: "4267" });
    expect(status).toBe(201);
    expect(escrituras.some((e) => e.startsWith("insert into drivers"))).toBe(true);
  });

  it("sin PIN lo rechaza, y el mensaje dice que sin PIN el chofer no puede entrar", async () => {
    const { status, json, escrituras } = await alta(CHOFER_NUEVO);
    expect(status).toBe(400);
    expect(json.error).toMatch(/PIN/);
    expect(json.error).toMatch(/entrar/i);
    expect(escrituras).toEqual([]);
  });

  it("un PIN de menos de 4 dígitos tampoco: es el único secreto que tiene el chofer", async () => {
    const { status, json } = await alta({ ...CHOFER_NUEVO, pin: "12" });
    expect(status).toBe(400);
    expect(json.error).toMatch(/PIN/);
  });

  /**
   * Sin camión el servidor NO frena: un chofer puede quedar sin camión un tiempo, y borrar el
   * camión le pone `default_truck_id` en null solo (ON DELETE SET NULL). Pero así no puede
   * entrar —se entra con la patente—, así que el aviso va en la pantalla, antes de guardar.
   */
  it("sin camión lo deja crear: quien avisa que no va a poder entrar es la pantalla", async () => {
    const { status } = await alta({ ...CHOFER_NUEVO, default_truck_id: null, pin: "4267" });
    expect(status).toBe(201);
  });
});

describe("cambiarle el PIN a un chofer que ya existe", () => {
  async function editar(body: Record<string, unknown>) {
    const escrituras: string[] = [];
    const res = await app.request(
      "/api/drivers/6",
      {
        method: "PUT",
        headers: { authorization: `Bearer ${await tokenAdmin()}`, "content-type": "application/json" },
        body: JSON.stringify(body),
      },
      { DB: fakeDB(escrituras), JWT_SECRET: SECRET } as any,
    );
    return { status: res.status, json: (await res.json()) as any, escrituras };
  }

  const cambio = (e: string[]) => e.filter((x) => x.startsWith("update drivers"));

  it("vacío significa dejarlo como está", async () => {
    const { status, escrituras } = await editar({ ...CHOFER_NUEVO, pin: "" });
    expect(status).toBe(200);
    // Un solo UPDATE: el de los datos. El PIN no se toca.
    expect(cambio(escrituras)).toHaveLength(1);
  });

  it("un PIN corto se rechaza en vez de ignorarse: la oficina creía haberlo cambiado", async () => {
    const { status, json, escrituras } = await editar({ ...CHOFER_NUEVO, pin: "12" });
    expect(status).toBe(400);
    expect(json.error).toMatch(/4 dígitos/);
    expect(escrituras).toEqual([]);
  });

  it("un PIN nuevo válido se guarda", async () => {
    const { status, escrituras } = await editar({ ...CHOFER_NUEVO, pin: "4267" });
    expect(status).toBe(200);
    expect(cambio(escrituras)).toHaveLength(2);
  });
});
