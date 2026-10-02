import { describe, it, expect } from "vitest";
import { app } from "../api/app";
import { signToken } from "../api/lib/crypto";
import { ROLES } from "@shared/domain";
import {
  bloqueoPorCambioDeCargas,
  bloqueoPorFacturacion,
  tieneAlgoFacturado,
  type Alcance,
} from "../shared/bloqueo-facturacion";
import { cargaJson, fakeD1Facturacion, viajeBase, type FilaMarca, type FilaViaje } from "./helpers/fake-d1-facturacion";

/**
 * Los bloqueos de "ya está facturado" cuando la factura es por CLIENTE dentro del viaje.
 * Para los viajes de siempre (por viaje) la regla y los mensajes son los de `bloqueo-facturacion.test.ts`.
 */

const c = (sid: string, cobro_a: string | null, o: Record<string, unknown> = {}) => cargaJson(sid, cobro_a, o) as any;

const JAIR = { cliente_clave: "cliente:jair", cliente_nombre: "Jair", factura_numero: "A-1" };
const BMR_SACADA = { cliente_clave: "cliente:bmr", cliente_nombre: "BMR", factura_numero: null };

const tres = [c("a", "Jair"), c("b", "BMR"), c("c", "UAM")];
const viaje = (marcas = [JAIR]) => ({ factura_numero: null, segments: tres, clientes_facturacion: marcas });

const ALCANCES: Alcance[] = [
  { tipo: "viaje", cambio: "descargas" },
  { tipo: "viaje", cambio: "cabecera" },
  { tipo: "viaje", cambio: "fecha" },
  { tipo: "viaje", cambio: "llegada" },
  { tipo: "viaje", cambio: "cancelar" },
  { tipo: "viaje", cambio: "borrar" },
];

describe("el viaje entero, con un cliente facturado", () => {
  it.each(ALCANCES)("se frena %o, nombrando la factura y al cliente", (alcance) => {
    expect(bloqueoPorFacturacion(viaje(), alcance)).toMatch(/^Ese viaje ya tiene facturado a Jair \(factura A-1\)\. /);
  });
  it("nombra a todos los facturados", () => {
    const m = bloqueoPorFacturacion(viaje([JAIR, { cliente_clave: "cliente:bmr", cliente_nombre: "BMR", factura_numero: "B-2" }]), ALCANCES[0]);
    expect(m).toContain("Jair (factura A-1) y BMR (factura B-2)");
  });
  it.each(ALCANCES)("sin ningún cliente facturado (o con la factura sacada) se puede tocar %o", (alcance) => {
    expect(bloqueoPorFacturacion(viaje([]), alcance)).toBeNull();
    expect(bloqueoPorFacturacion(viaje([BMR_SACADA]), alcance)).toBeNull();
  });
});

describe("una carga puntual (a quién se le cobra)", () => {
  it("la de un cliente facturado se frena", () => {
    expect(bloqueoPorFacturacion(viaje(), { tipo: "carga", sid: "a" })).toMatch(/Esa carga ya está en la factura A-1 \(Jair\)/);
  });
  it("la de otro cliente del mismo viaje se puede corregir", () => {
    expect(bloqueoPorFacturacion(viaje(), { tipo: "carga", sid: "b" })).toBeNull();
  });
});

describe("las fotos", () => {
  it("la de una carga facturada se frena; la de otra carga, no", () => {
    expect(bloqueoPorFacturacion(viaje(), { tipo: "foto", sid: "a" })).toMatch(/factura A-1 \(Jair\)/);
    expect(bloqueoPorFacturacion(viaje(), { tipo: "foto", sid: "b" })).toBeNull();
  });
  it("la del viaje entero, o la boleta de un lugar de descarga (un sid que no es de ninguna carga), se frena", () => {
    expect(bloqueoPorFacturacion(viaje(), { tipo: "foto" })).toMatch(/ya tiene facturado a Jair/);
    expect(bloqueoPorFacturacion(viaje(), { tipo: "foto", sid: "descarga-sid-1" })).toMatch(/ya tiene facturado a Jair/);
  });
});

describe("corregir la lista de cargas (PUT segments)", () => {
  it("no tocar nada, o tocar sólo a otros clientes, se puede", () => {
    expect(bloqueoPorCambioDeCargas(viaje(), tres)).toBeNull();
    expect(bloqueoPorCambioDeCargas(viaje(), [c("a", "Jair"), c("b", "BMR", { cantidad: 99 }), c("c", "UAM")])).toBeNull();
  });
  it("cambiar la cantidad de una carga del cliente facturado se frena", () => {
    expect(bloqueoPorCambioDeCargas(viaje(), [c("a", "Jair", { cantidad: 11 }), c("b", "BMR"), c("c", "UAM")])).toMatch(
      /tocan lo que ya está facturado a Jair \(factura A-1\)/,
    );
  });
  it("borrar la carga de un cliente facturado se frena; borrar la de otro no", () => {
    expect(bloqueoPorCambioDeCargas(viaje(), [c("b", "BMR"), c("c", "UAM")])).not.toBeNull();
    expect(bloqueoPorCambioDeCargas(viaje(), [c("a", "Jair"), c("c", "UAM")])).toBeNull();
  });
  it("sumarle una carga nueva a un cliente facturado se frena; a otro cliente, no", () => {
    expect(bloqueoPorCambioDeCargas(viaje(), [...tres, c("d", "Jair")])).not.toBeNull();
    expect(bloqueoPorCambioDeCargas(viaje(), [...tres, c("d", "Nuevo S.A.")])).toBeNull();
  });
  it("pasarle a un cliente facturado una carga de otro se frena (aunque la carga no fuera de él)", () => {
    expect(bloqueoPorCambioDeCargas(viaje(), [c("a", "Jair"), c("b", "Jair"), c("c", "UAM")])).not.toBeNull();
  });
  it("sacarle una carga a un cliente facturado y dársela a otro se frena", () => {
    expect(bloqueoPorCambioDeCargas(viaje(), [c("a", "BMR"), c("b", "BMR"), c("c", "UAM")])).not.toBeNull();
  });
  it("el mismo cliente escrito distinto no es un cambio (espacios de más)", () => {
    expect(bloqueoPorCambioDeCargas(viaje(), [c("a", " Jair "), c("b", "BMR"), c("c", "UAM")])).toBeNull();
  });
  it("sin clientes facturados se puede todo", () => {
    expect(bloqueoPorCambioDeCargas(viaje([]), [c("a", "Otro")])).toBeNull();
  });
});

describe("los trabajos que reescriben cargas por su cuenta", () => {
  it("un viaje con algo facturado (por viaje o por cliente) no se reescribe", () => {
    expect(tieneAlgoFacturado({ factura_numero: "A-1" })).toBe(true);
    expect(tieneAlgoFacturado(viaje())).toBe(true);
    expect(tieneAlgoFacturado(viaje([]))).toBe(false);
    expect(tieneAlgoFacturado(viaje([BMR_SACADA]))).toBe(false);
    expect(tieneAlgoFacturado(null)).toBe(false);
  });
});

// ── Por las rutas ──

const SECRET = "test-secret-tsm";
const tresClientes = () => viajeBase({ id: 1, segments: JSON.stringify([c("a", "Jair"), c("b", "BMR"), c("c", "UAM")]) });
const marcaJair = (): FilaMarca => ({
  trip_id: 1, cliente_clave: "cliente:jair", cliente_nombre: "Jair", factura_numero: "A-1", facturado_at: "2026-10-01 10:00:00",
  facturado_by: 2, factura_quitada: null, factura_quitada_at: null, pago_at: null, pago_by: null,
});

async function pedir(method: string, ruta: string, cuerpo: unknown, viajes: FilaViaje[], marcas: FilaMarca[]) {
  const d1 = fakeD1Facturacion(viajes, marcas);
  const token = await signToken({ id: 2, name: "Oficina", role: ROLES.ADMIN, driver_id: null, truck_id: null, email: null } as any, SECRET);
  const res = await app.request(
    ruta,
    { method, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) },
    { DB: d1.db, JWT_SECRET: SECRET } as any,
  );
  return { status: res.status, json: (await res.json().catch(() => null)) as any, escrituras: d1.escrituras };
}

describe("las rutas con un viaje por cliente a medio facturar", () => {
  it("PUT /segments: corregir la carga del cliente facturado da 409 y no escribe nada", async () => {
    const r = await pedir("PUT", "/api/trips/1/segments", { segments: [{ ...c("a", "Jair"), cantidad: 99 }, c("b", "BMR"), c("c", "UAM")] }, [tresClientes()], [marcaJair()]);
    expect(r.status).toBe(409);
    expect(r.json.error).toMatch(/Jair \(factura A-1\)/);
    expect(r.escrituras.filter((e) => e.startsWith("update trips set segments"))).toEqual([]);
  });

  it("PUT /segments: corregir la de otro cliente del mismo viaje se guarda", async () => {
    const r = await pedir("PUT", "/api/trips/1/segments", { segments: [c("a", "Jair"), { ...c("b", "BMR"), cantidad: 99 }, c("c", "UAM")] }, [tresClientes()], [marcaJair()]);
    expect(r.status).toBe(200);
    expect(r.escrituras.some((e) => e.startsWith("update trips set segments"))).toBe(true);
  });

  it("PUT /segments/:sid/cobro: no se le cambia el cobro a la carga de un cliente facturado", async () => {
    const r = await pedir("PUT", "/api/trips/1/segments/a/cobro", { cobro_tipo: "cliente", cobro_a: "Otro" }, [tresClientes()], [marcaJair()]);
    expect(r.status).toBe(409);
  });

  it("PUT /segments/:sid/cobro: tampoco se le pasa una carga a un cliente ya facturado", async () => {
    const r = await pedir("PUT", "/api/trips/1/segments/b/cobro", { cobro_tipo: "cliente", cobro_a: "Jair" }, [tresClientes()], [marcaJair()]);
    expect(r.status).toBe(409);
  });

  it("PUT /segments/:sid/cobro: la carga de otro cliente sí se reasigna a uno sin facturar", async () => {
    const r = await pedir("PUT", "/api/trips/1/segments/b/cobro", { cobro_tipo: "cliente", cobro_a: "Otro S.A." }, [tresClientes()], [marcaJair()]);
    expect(r.status).toBe(200);
  });

  it("PATCH /:id/fecha y POST /:id/cancel: el viaje entero se frena en cuanto un cliente está facturado", async () => {
    const fecha = await pedir("PATCH", "/api/trips/1/fecha", { fecha: "2026-09-25" }, [tresClientes()], [marcaJair()]);
    expect(fecha.status).toBe(409);
    expect(fecha.json.error).toMatch(/ya tiene facturado a Jair/);
    const cancelar = await pedir("POST", "/api/trips/1/cancel", {}, [tresClientes()], [marcaJair()]);
    expect(cancelar.status).toBe(409);
  });

  it("DELETE /:id: no se borra un viaje con un cliente facturado", async () => {
    const r = await pedir("DELETE", "/api/trips/1", undefined, [tresClientes()], [marcaJair()]);
    expect(r.status).toBe(409);
    expect(r.escrituras.some((e) => e.startsWith("delete from trips"))).toBe(false);
  });

  it("sin nada facturado, todo sigue como antes", async () => {
    const r = await pedir("PATCH", "/api/trips/1/fecha", { fecha: "2026-09-25" }, [tresClientes()], []);
    expect(r.status).not.toBe(409);
  });
});
