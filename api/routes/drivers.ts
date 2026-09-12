import { Hono } from "hono";
import type { Env, Vars } from "../env";
import { ok, fail } from "../lib/response";
import { requireAuth, requireRole } from "../middleware/auth";
import { ROLES, DRIVER_STATUS } from "../../shared/domain";
import { hashPassword } from "../lib/crypto";
import * as repo from "../repos/drivers";
import { motivoParaNoBorrarChofer } from "../lib/frenos-de-borrado";

const drivers = new Hono<{ Bindings: Env; Variables: Vars }>();
drivers.use("*", requireAuth);

drivers.get("/", requireRole(ROLES.ENCARGADO, ROLES.ADMIN), async (c) =>
  ok(c, await repo.listDrivers(c.env.DB)),
);

function parse(b: any): repo.DriverInput | null {
  if (!b || !b.name || !b.document) return null;
  return {
    name: String(b.name),
    document: String(b.document),
    license_number: String(b.license_number ?? ""),
    license_category: String(b.license_category ?? ""),
    license_expiry: String(b.license_expiry ?? ""),
    phone: String(b.phone ?? ""),
    status: b.status === DRIVER_STATUS.INACTIVO ? DRIVER_STATUS.INACTIVO : DRIVER_STATUS.ACTIVO,
    default_truck_id: b.default_truck_id ? Number(b.default_truck_id) : null,
  };
}

drivers.post("/", requireRole(ROLES.ADMIN), async (c) => {
  const b = await c.req.json<any>().catch(() => null);
  const input = parse(b);
  if (!input) return fail(c, "Nombre y documento son obligatorios", 400);
  // El chofer entra con la patente de su camión y este PIN: sin PIN no tiene con qué entrar.
  // El mensaje lo dice porque el formulario no marcaba el campo como obligatorio y el rechazo
  // no se veía en pantalla — "no puedo dar de alta al chofer del último camión".
  if (!b.pin || String(b.pin).length < 4) {
    return fail(c, "Sin PIN el chofer no puede entrar: poné uno de 4 dígitos o más.", 400);
  }
  const pinHash = await hashPassword(String(b.pin));
  const id = await repo.createDriver(c.env.DB, input, pinHash);
  return ok(c, await repo.getDriver(c.env.DB, id), 201);
});

drivers.put("/:id", requireRole(ROLES.ADMIN), async (c) => {
  const id = Number(c.req.param("id"));
  const b = await c.req.json<any>().catch(() => null);
  const input = parse(b);
  if (!input) return fail(c, "Nombre y documento son obligatorios", 400);
  // Vacío significa "dejá el PIN como está". Un PIN corto NO es eso: antes se ignoraba en
  // silencio y la oficina se quedaba creyendo que lo había cambiado.
  const pin = b.pin == null ? "" : String(b.pin);
  if (pin !== "" && pin.length < 4) {
    return fail(c, "El PIN nuevo tiene que tener 4 dígitos o más. Dejalo vacío para no cambiarlo.", 400);
  }
  await repo.updateDriver(c.env.DB, id, input);
  if (pin !== "") await repo.setPin(c.env.DB, id, await hashPassword(pin));
  return ok(c, await repo.getDriver(c.env.DB, id));
});

drivers.delete("/:id", requireRole(ROLES.ADMIN), async (c) => {
  const id = Number(c.req.param("id"));
  const motivo = motivoParaNoBorrarChofer(await repo.loAtadoAlChofer(c.env.DB, id));
  if (motivo) return fail(c, motivo, 409);
  await repo.deleteDriver(c.env.DB, id);
  return ok(c, { deleted: true });
});

export default drivers;
