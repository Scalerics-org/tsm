import { describe, it, expect } from "vitest";
import { app } from "../api/app";
import { signToken } from "../api/lib/crypto";
import { ROLES } from "@shared/domain";
import { cargaJson, fakeD1Facturacion, viajeBase, type FilaMarca, type FilaViaje } from "./helpers/fake-d1-facturacion";

/**
 * La factura y el pago por CLIENTE dentro del viaje: las rutas por ítem y lo que hacen los atajos de
 * siempre (`{ trip_ids }`) con un viaje por cliente.
 *
 * Usa una D1 de mentira con estado (ver el helper): prueba la lógica de las rutas. El SQL se probó aparte
 * contra la D1 local.
 */

const SECRET = "test-secret-tsm";

async function llamar(
  ruta: string,
  cuerpo: unknown,
  viajes: FilaViaje[],
  marcas: FilaMarca[] = [],
  role: string = ROLES.ADMIN,
) {
  const d1 = fakeD1Facturacion(viajes, marcas, role);
  const token = await signToken({ id: 2, name: "Oficina", role, driver_id: null, truck_id: null, email: null } as any, SECRET);
  const res = await app.request(
    `/api/facturacion/${ruta}`,
    { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(cuerpo) },
    { DB: d1.db, JWT_SECRET: SECRET } as any,
  );
  return { status: res.status, json: (await res.json()) as any, ...d1 };
}

/** Un viaje de tres cargas para tres clientes distintos. */
const tresClientes = (id = 1) =>
  viajeBase({ id, segments: JSON.stringify([cargaJson("a", "Jair"), cargaJson("b", "BMR"), cargaJson("c", "UAM")]) });
/** Un viaje de tres cargas para un solo cliente. */
const unSoloCliente = (id = 2) =>
  viajeBase({ id, segments: JSON.stringify([cargaJson("a", "Jair"), cargaJson("b", "Jair"), cargaJson("c", "jair")]) });

const JAIR = "cliente:jair";
const BMR = "cliente:bmr";

describe("POST /facturacion/marcar-clientes", () => {
  it("marca sólo a ese cliente, con quién y cuándo, y deja los otros sin facturar", async () => {
    const r = await llamar("marcar-clientes", { items: [{ trip_id: 1, cliente_clave: JAIR }], factura_numero: "A-1" }, [tresClientes()]);
    expect(r.status).toBe(200);
    expect(r.json.data).toMatchObject({ marcados: 1, sin_tocar: 0, factura_numero: "A-1" });
    expect(r.marcas).toHaveLength(1);
    expect(r.marcas[0]).toMatchObject({ trip_id: 1, cliente_clave: JAIR, cliente_nombre: "Jair", factura_numero: "A-1", facturado_by: 2 });
    expect(r.marcas[0].facturado_at).toMatch(/^\d{4}-\d{2}-\d{2} /);
  });

  it("marca varios clientes de varios viajes de una vez, con el mismo número", async () => {
    const r = await llamar(
      "marcar-clientes",
      { items: [{ trip_id: 1, cliente_clave: JAIR }, { trip_id: 1, cliente_clave: BMR }, { trip_id: 3, cliente_clave: JAIR }], factura_numero: "A-7" },
      [tresClientes(1), tresClientes(3)],
    );
    expect(r.json.data.marcados).toBe(3);
    expect(r.marcas.map((m) => `${m.trip_id}:${m.cliente_clave}`)).toEqual(["1:cliente:jair", "1:cliente:bmr", "3:cliente:jair"]);
  });

  it("no pisa una factura puesta y dice por qué", async () => {
    const r1 = await llamar("marcar-clientes", { items: [{ trip_id: 1, cliente_clave: JAIR }], factura_numero: "A-1" }, [tresClientes()]);
    const r2 = await llamar("marcar-clientes", { items: [{ trip_id: 1, cliente_clave: JAIR }], factura_numero: "A-2" }, r1.viajes, r1.marcas);
    expect(r2.json.data).toMatchObject({ marcados: 0, sin_tocar: 1 });
    expect(r2.json.data.rechazados[0].motivo).toMatch(/Ya tenía factura/);
    expect(r2.marcas[0].factura_numero).toBe("A-1");
  });

  it("rechaza un cliente que no está entre las cargas de ahora, sin escribir nada", async () => {
    const r = await llamar("marcar-clientes", { items: [{ trip_id: 1, cliente_clave: "cliente:fantasma" }], factura_numero: "A-1" }, [tresClientes()]);
    expect(r.json.data.marcados).toBe(0);
    expect(r.json.data.rechazados[0].motivo).toMatch(/ya no figura/);
    expect(r.marcas).toEqual([]);
  });

  it("rechaza un viaje que no está completado", async () => {
    const enCurso = viajeBase({ id: 1, status: "EN_CURSO", segments: JSON.stringify([cargaJson("a", "Jair")]) });
    const r = await llamar("marcar-clientes", { items: [{ trip_id: 1, cliente_clave: JAIR }], factura_numero: "A-1" }, [enCurso]);
    expect(r.json.data.rechazados[0].motivo).toMatch(/completado/);
    expect(r.marcas).toEqual([]);
  });

  it("un viaje que ya salió entero en una factura de viaje no se marca por cliente", async () => {
    const viejo = viajeBase({ id: 1, factura_numero: "A-0", segments: JSON.stringify([cargaJson("a", "Jair")]) });
    const r = await llamar("marcar-clientes", { items: [{ trip_id: 1, cliente_clave: JAIR }], factura_numero: "A-1" }, [viejo]);
    expect(r.json.data.rechazados[0].motivo).toMatch(/entero en la factura A-0/);
    expect(r.marcas).toEqual([]);
    expect(r.viajes[0].factura_numero).toBe("A-0");
  });

  it("un viaje sin cargas (clásico) no se marca por cliente", async () => {
    const r = await llamar("marcar-clientes", { items: [{ trip_id: 1, cliente_clave: JAIR }], factura_numero: "A-1" }, [viajeBase({ id: 1 })]);
    expect(r.json.data.rechazados[0].motivo).toMatch(/no tiene cargas/);
  });

  it("pide al menos un ítem y un número", async () => {
    expect((await llamar("marcar-clientes", { items: [], factura_numero: "A-1" }, [])).status).toBe(400);
    expect((await llamar("marcar-clientes", { items: [{ trip_id: 1, cliente_clave: JAIR }], factura_numero: "  " }, [tresClientes()])).status).toBe(400);
    expect((await llamar("marcar-clientes", { items: [{ trip_id: "x", cliente_clave: JAIR }], factura_numero: "A-1" }, [])).status).toBe(400);
    expect((await llamar("marcar-clientes", { items: [{ trip_id: 1 }], factura_numero: "A-1" }, [])).status).toBe(400);
  });

  it("el lector no llega (la lista blanca no la incluye)", async () => {
    const r = await llamar("marcar-clientes", { items: [{ trip_id: 1, cliente_clave: JAIR }], factura_numero: "A-1" }, [tresClientes()], [], ROLES.LECTOR);
    expect(r.status).toBe(403);
    expect(r.marcas).toEqual([]);
  });
});

describe("desmarcar la factura de un cliente", () => {
  it("la saca, saca su pago y deja el rastro; los otros clientes no se tocan", async () => {
    const v = tresClientes();
    const a = await llamar("marcar-clientes", { items: [{ trip_id: 1, cliente_clave: JAIR }, { trip_id: 1, cliente_clave: BMR }], factura_numero: "A-1" }, [v]);
    await llamar("marcar-pagos-clientes", { items: [{ trip_id: 1, cliente_clave: JAIR }] }, a.viajes, a.marcas);
    const r = await llamar("desmarcar-clientes", { items: [{ trip_id: 1, cliente_clave: JAIR }] }, a.viajes, a.marcas);
    expect(r.json.data).toMatchObject({ desmarcados: 1 });
    const jair = r.marcas.find((m) => m.cliente_clave === JAIR)!;
    expect(jair).toMatchObject({ factura_numero: null, factura_quitada: "A-1", pago_at: null });
    expect(r.marcas.find((m) => m.cliente_clave === BMR)!.factura_numero).toBe("A-1");
  });

  it("después de sacarla se puede volver a facturar con otro número", async () => {
    const a = await llamar("marcar-clientes", { items: [{ trip_id: 1, cliente_clave: JAIR }], factura_numero: "A-1" }, [tresClientes()]);
    const b = await llamar("desmarcar-clientes", { items: [{ trip_id: 1, cliente_clave: JAIR }] }, a.viajes, a.marcas);
    const c = await llamar("marcar-clientes", { items: [{ trip_id: 1, cliente_clave: JAIR }], factura_numero: "B-9" }, b.viajes, b.marcas);
    expect(c.json.data.marcados).toBe(1);
    expect(c.marcas[0]).toMatchObject({ factura_numero: "B-9", factura_quitada: "A-1" });
  });
});

describe("el pago por cliente", () => {
  it("sólo se marca a un cliente que ya tiene factura", async () => {
    const r = await llamar("marcar-pagos-clientes", { items: [{ trip_id: 1, cliente_clave: JAIR }] }, [tresClientes()]);
    expect(r.status).toBe(409);
    expect(r.marcas).toEqual([]);
  });

  it("se marcan varios clientes de una vez y se registra quién y cuándo", async () => {
    const a = await llamar("marcar-clientes", { items: [{ trip_id: 1, cliente_clave: JAIR }, { trip_id: 1, cliente_clave: BMR }], factura_numero: "A-1" }, [tresClientes()]);
    const r = await llamar("marcar-pagos-clientes", { items: [{ trip_id: 1, cliente_clave: JAIR }, { trip_id: 1, cliente_clave: BMR }] }, a.viajes, a.marcas);
    expect(r.json.data.marcados).toBe(2);
    expect(r.marcas.every((m) => m.pago_at && m.pago_by === 2)).toBe(true);
  });

  it("un pago ya marcado no se pisa; sacarlo deja la factura", async () => {
    const a = await llamar("marcar-clientes", { items: [{ trip_id: 1, cliente_clave: JAIR }], factura_numero: "A-1" }, [tresClientes()]);
    const p = await llamar("marcar-pagos-clientes", { items: [{ trip_id: 1, cliente_clave: JAIR }] }, a.viajes, a.marcas);
    const cuando = p.marcas[0].pago_at;
    const otra = await llamar("marcar-pagos-clientes", { items: [{ trip_id: 1, cliente_clave: JAIR }] }, p.viajes, p.marcas);
    expect(otra.status).toBe(409);
    expect(otra.marcas[0].pago_at).toBe(cuando);
    const s = await llamar("desmarcar-pagos-clientes", { items: [{ trip_id: 1, cliente_clave: JAIR }] }, p.viajes, p.marcas);
    expect(s.marcas[0]).toMatchObject({ pago_at: null, factura_numero: "A-1" });
  });
});

describe("los atajos de siempre ({ trip_ids }) con un viaje por cliente", () => {
  it("con UN solo cliente marcan a ese cliente (y no escriben el número en el viaje)", async () => {
    const r = await llamar("marcar", { trip_ids: [2], factura_numero: "A-5" }, [unSoloCliente(2)]);
    expect(r.json.data.marcados).toBe(1);
    expect(r.marcas).toHaveLength(1);
    expect(r.marcas[0]).toMatchObject({ trip_id: 2, cliente_clave: JAIR, factura_numero: "A-5" });
    expect(r.viajes[0].factura_numero).toBeNull();
  });

  it("con VARIOS clientes no marcan nada y lo dicen: ningún atajo le pone un solo número a clientes que se facturan aparte", async () => {
    const r = await llamar("marcar", { trip_ids: [1], factura_numero: "A-5" }, [tresClientes(1)]);
    expect(r.json.data).toMatchObject({ marcados: 0, sin_tocar: 1 });
    expect(r.json.data.rechazados[0].motivo).toMatch(/por cliente/);
    expect(r.marcas).toEqual([]);
    expect(r.viajes[0].factura_numero).toBeNull();
  });

  it("un viaje por cliente que ya tiene un cliente facturado no se marca entero por el atajo viejo", async () => {
    const a = await llamar("marcar-clientes", { items: [{ trip_id: 2, cliente_clave: JAIR }], factura_numero: "A-1" }, [unSoloCliente(2)]);
    // Aunque el reparto lo mandara por el camino de siempre, el SQL tampoco lo deja.
    const r = await llamar("marcar", { trip_ids: [2], factura_numero: "A-9" }, a.viajes, a.marcas);
    expect(r.json.data.marcados).toBe(0);
    expect(r.viajes[0].factura_numero).toBeNull();
    expect(r.marcas[0].factura_numero).toBe("A-1");
  });

  it("los viajes de siempre (sin cargas, o ya facturados por viaje) siguen igual", async () => {
    const clasico = viajeBase({ id: 5 });
    const yaFacturado = viajeBase({ id: 6, factura_numero: "A-0", segments: JSON.stringify([cargaJson("a", "Jair"), cargaJson("b", "BMR")]) });
    const r = await llamar("marcar", { trip_ids: [5, 6], factura_numero: "A-5" }, [clasico, yaFacturado]);
    expect(r.json.data).toMatchObject({ marcados: 1, sin_tocar: 1 });
    expect(r.viajes.find((v) => v.id === 5)!.factura_numero).toBe("A-5");
    expect(r.viajes.find((v) => v.id === 6)!.factura_numero).toBe("A-0");
    expect(r.marcas).toEqual([]);
  });

  it("el pago de siempre sobre un viaje con un solo cliente marca el pago de ese cliente", async () => {
    const a = await llamar("marcar", { trip_ids: [2], factura_numero: "A-5" }, [unSoloCliente(2)]);
    const r = await llamar("marcar-pago", { trip_ids: [2] }, a.viajes, a.marcas);
    expect(r.json.data.marcados).toBe(1);
    expect(r.marcas[0].pago_at).toBeTruthy();
    expect(r.viajes[0].pago_at).toBeNull();
  });
});

describe("los atajos de siempre no pasan por encima de lo que las rutas por cliente frenan", () => {
  it("un viaje por cliente EN CURSO o CANCELADO, de un solo cliente, no se marca por el atajo viejo", async () => {
    for (const status of ["EN_CURSO", "CANCELADO"]) {
      const v = viajeBase({ id: 2, status, segments: JSON.stringify([cargaJson("a", "Jair")]) });
      const r = await llamar("marcar", { trip_ids: [2], factura_numero: "A-5" }, [v]);
      expect(r.json.data.marcados).toBe(0);
      expect(r.json.data.rechazados[0].motivo).toMatch(/completado/);
      expect(r.marcas).toEqual([]);
    }
  });

  it("aunque el viaje cambie entre la lectura y la escritura, el INSERT no deja una marca en un viaje que ya no la admite", async () => {
    // Se salta la validación de la ruta y va directo al repo, como en una carrera.
    const { marcarClientes } = await import("../api/repos/facturacion-clientes");
    const d1 = fakeD1Facturacion([viajeBase({ id: 9, status: "CANCELADO", segments: JSON.stringify([cargaJson("a", "Jair")]) })]);
    const r = await marcarClientes(d1.db, [{ trip_id: 9, cliente_clave: JAIR, cliente_nombre: "Jair" }], "A-1", { userId: 2, when: "2026-10-01 10:00:00" });
    expect(r).toEqual([false]);
    expect(d1.marcas).toEqual([]);
  });

  it("sacar la factura por el atajo viejo anda aunque haya una carga sin asignar (marcarla sí lo exige)", async () => {
    const segs = JSON.stringify([cargaJson("a", "Jair"), cargaJson("b", null)]);
    const marcaJair = { trip_id: 2, cliente_clave: JAIR, cliente_nombre: "Jair", factura_numero: "A-1", facturado_at: "2026-10-01 10:00:00", facturado_by: 2, factura_quitada: null, factura_quitada_at: null, pago_at: null, pago_by: null };
    const sacar = await llamar("desmarcar", { trip_ids: [2] }, [viajeBase({ id: 2, segments: segs })], [marcaJair]);
    expect(sacar.json.data.desmarcados).toBe(1);
    const marcar = await llamar("marcar", { trip_ids: [2], factura_numero: "B-1" }, [viajeBase({ id: 2, segments: segs })]);
    expect(marcar.json.data.marcados).toBe(0);
  });

  it("un viaje con cargas y NINGÚN cobro asignado se factura por viaje, con el tilde de siempre", async () => {
    const v = viajeBase({ id: 3, segments: JSON.stringify([cargaJson("a", null), cargaJson("b", null)]) });
    const r = await llamar("marcar", { trip_ids: [3], factura_numero: "A-7" }, [v]);
    expect(r.json.data.marcados).toBe(1);
    expect(r.viajes[0].factura_numero).toBe("A-7");
    expect(r.marcas).toEqual([]);
  });
});
