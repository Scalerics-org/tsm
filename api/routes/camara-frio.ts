import { Hono } from "hono";
import type { Env, Vars } from "../env";
import { ok, fail } from "../lib/response";
import { requireAuth, requireRole } from "../middleware/auth";
import { leerFoto } from "../lib/archivo-foto";
import { camionDelChofer } from "../lib/camion-del-chofer";
import { ROLES, esFechaValida } from "../../shared/domain";
import { consumoFrioPorMes, validarHorasFrio } from "../../shared/camara-frio";
import { LITROS_MAX_POR_CARGA } from "../../shared/litros";
import * as repo from "../repos/camara-frio";

/**
 * La cámara de frío de los camiones que la llevan: el chofer registra el gasoil con la foto de
 * la boleta, y la oficina le pone las horas del equipo una vez por mes. Ver `shared/camara-frio.ts`.
 */
const frio = new Hono<{ Bindings: Env; Variables: Vars }>();
frio.use("*", requireAuth);

const OFICINA = requireRole(ROLES.ENCARGADO, ROLES.ADMIN);
const ahora = () => new Date().toISOString().replace("T", " ").slice(0, 19);

/** Un número que puede venir vacío: `null` es "no lo pusieron", distinto de un 0. */
function numeroOpcional(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : Number.NaN;
}

// GET /api/frio/estado — si el camión con el que anda el chofer lleva cámara (el botón de inicio).
frio.get("/estado", async (c) => {
  const truckId = await camionDelChofer(c, c.get("user"));
  return ok(c, { camara_frio: truckId != null && (await repo.tieneCamaraFrio(c.env.DB, truckId)) });
});

// GET /api/frio?truck=N — la ficha del camión: sus surtidas de cámara y el consumo por mes.
frio.get("/", OFICINA, async (c) => {
  const truckId = Number(c.req.query("truck"));
  if (!truckId) return fail(c, "Falta el camión", 400);
  const [surtidas, horas] = await Promise.all([
    repo.listSurtidasFrio(c.env.DB, truckId),
    repo.listHorasFrio(c.env.DB, truckId),
  ]);
  return ok(c, { surtidas, meses: consumoFrioPorMes(surtidas, horas) });
});

// POST /api/frio — registrar gasoil de la cámara (multipart: liters + boleta).
frio.post("/", async (c) => {
  const user = c.get("user");
  const form = await c.req.formData().catch(() => null);
  if (!form) return fail(c, "Se esperaba multipart/form-data", 400);

  const liters = Number(form.get("liters"));
  if (!Number.isFinite(liters) || liters <= 0) return fail(c, "Cargá los litros", 400);
  if (liters > LITROS_MAX_POR_CARGA) {
    return fail(c, `${liters.toLocaleString("es-UY")} litros no puede ser: revisá la coma (ej. 85,50).`, 400);
  }

  const truckId =
    user.role === ROLES.CHOFER
      ? await camionDelChofer(c, user)
      : form.get("truck_id")
        ? Number(form.get("truck_id"))
        : null;
  if (!truckId) return fail(c, "Falta el camión", 400);
  if (!(await repo.tieneCamaraFrio(c.env.DB, truckId))) {
    return fail(c, "Este camión no tiene cámara de frío", 400);
  }

  // La foto se valida por el contenido antes de subirla, igual que en la surtida del camión.
  let r2KeyBoleta: string | null = null;
  const file = form.get("boleta");
  if (file && typeof file !== "string" && c.env.FOTOS) {
    const foto = await leerFoto(file as unknown as File);
    if (!foto.ok) return fail(c, foto.motivo, 400);
    r2KeyBoleta = `frio/${truckId}/boleta-${Date.now()}.${foto.ext}`;
    await c.env.FOTOS.put(r2KeyBoleta, foto.bytes, { httpMetadata: { contentType: foto.tipo } });
  }

  const id = await repo.createSurtidaFrio(c.env.DB, {
    truck_id: truckId,
    driver_id: user.driver_id,
    liters,
    r2_key_boleta: r2KeyBoleta,
  });
  return ok(c, { id, r2_key_boleta: r2KeyBoleta }, 201);
});

// PUT /api/frio/horas/:truck/:mes — la oficina anota las horas del equipo al inicio y al final del mes.
frio.put("/horas/:truck/:mes", OFICINA, async (c) => {
  const truckId = Number(c.req.param("truck"));
  const mes = c.req.param("mes");
  if (!truckId) return fail(c, "Falta el camión", 400);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) return fail(c, "El mes va como 2026-09", 400);

  const b = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b) return fail(c, "Faltan datos", 400);
  const inicio = numeroOpcional(b.horas_inicio);
  const fin = numeroOpcional(b.horas_fin);
  const motivo = validarHorasFrio(inicio, fin);
  if (motivo) return fail(c, motivo, 400);
  if (!(await repo.tieneCamaraFrio(c.env.DB, truckId))) {
    return fail(c, "Este camión no tiene cámara de frío", 400);
  }

  await repo.guardarHorasFrio(
    c.env.DB,
    truckId,
    { mes, horas_inicio: inicio, horas_fin: fin },
    { userId: c.get("user").id, when: ahora() },
  );
  return ok(c, { mes, horas_inicio: inicio, horas_fin: fin });
});

// PUT /api/frio/:id — la oficina corrige los litros contra la boleta.
frio.put("/:id", OFICINA, async (c) => {
  const id = Number(c.req.param("id"));
  if (!(await repo.getSurtidaFrio(c.env.DB, id))) return fail(c, "Surtida no encontrada", 404);
  const b = (await c.req.json().catch(() => null)) as { liters?: unknown; fecha?: unknown } | null;
  const liters = Number(b?.liters);
  if (!Number.isFinite(liters) || liters <= 0) return fail(c, "Los litros tienen que ser un número mayor que cero", 400);
  const fecha = b?.fecha == null || b.fecha === "" ? null : String(b.fecha);
  if (fecha !== null && !esFechaValida(fecha)) return fail(c, "La fecha va como 2026-09-08", 400);
  await repo.updateSurtidaFrio(c.env.DB, id, { liters, fecha }, { userId: c.get("user").id, when: ahora() });
  return ok(c, await repo.getSurtidaFrio(c.env.DB, id));
});

// DELETE /api/frio/:id — sacar una surtida de cámara cargada por error.
frio.delete("/:id", OFICINA, async (c) => {
  const id = Number(c.req.param("id"));
  if (!(await repo.getSurtidaFrio(c.env.DB, id))) return fail(c, "Surtida no encontrada", 404);
  await repo.deleteSurtidaFrio(c.env.DB, id);
  return ok(c, { deleted: true });
});

export default frio;
