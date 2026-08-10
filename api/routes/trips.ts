import { Hono } from "hono";
import type { Env, Vars } from "../env";
import { ok, fail } from "../lib/response";
import { requireAuth, requireRole } from "../middleware/auth";
import {
  ROLES,
  TRIP_STATUS,
  PHOTO_KIND,
  UNIDAD,
  aplicarCobro,
  renglonesSinFoto,
  sinCobro,
  requiereFotoCarga,
  type Trip,
  type TripSegmentInput,
  type TripTemplate,
} from "../../shared/domain";
import * as tripsRepo from "../repos/trips";
import * as templatesRepo from "../repos/templates";
import * as photosRepo from "../repos/photos";
import * as libretaRepo from "../repos/libreta";

const trips = new Hono<{ Bindings: Env; Variables: Vars }>();
trips.use("*", requireAuth);

const nowIso = () => new Date().toISOString().replace("T", " ").slice(0, 19);

type Scope = { trip: Trip } | { error: string; status: 403 | 404 };
async function scoped(c: any): Promise<Scope> {
  const trip = await tripsRepo.getTrip(c.env.DB, Number(c.req.param("id")));
  if (!trip) return { error: "Viaje no encontrado", status: 404 };
  const user = c.get("user");
  if (user.role === ROLES.CHOFER && trip.driver_id !== user.driver_id) {
    return { error: "No podés acceder a este viaje", status: 403 };
  }
  return { trip };
}

/** Normaliza los renglones que manda el chofer. Un renglón sin lugar de carga no sirve. */
/**
 * Id de la carga. Se respeta el que manda el cliente —así la foto que subió recién sigue
 * apuntando a su carga, y editar desde oficina no deja fotos huérfanas— pero se garantiza
 * que sea único dentro del viaje.
 */
function sidDe(raw: unknown, usados: Set<string>): string {
  const propuesto = typeof raw === "string" ? raw.trim() : "";
  const sid = propuesto && !usados.has(propuesto) ? propuesto : crypto.randomUUID();
  usados.add(sid);
  return sid;
}

function parseSegments(raw: any, usados = new Set<string>()): TripSegmentInput[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r: any) => ({
      sid: sidDe(r?.sid, usados),
      remitente: String(r?.remitente ?? "").trim(),
      remitente_id: r?.remitente_id ? Number(r.remitente_id) : null,
      clientes: Array.isArray(r?.clientes) ? r.clientes.map((c: any) => String(c).trim()).filter(Boolean) : [],
      cliente_ids: Array.isArray(r?.cliente_ids) ? r.cliente_ids.map(Number).filter((n: number) => !isNaN(n)) : [],
      cantidad: r?.cantidad != null && r.cantidad !== "" ? Number(r.cantidad) : null,
      unidad: r?.unidad === UNIDAD.KILOS || r?.unidad === UNIDAD.PALLETS ? r.unidad : null,
      remito: r?.remito ? String(r.remito).trim() : null,
    }))
    .filter((r) => r.remitente);
}

/**
 * Devuelve el viaje sacándole la facturación si quien pregunta es un chofer.
 * Se usa en TODA respuesta que lleve un viaje: alcanza con olvidarse en una para filtrarla.
 */
function okViaje(c: any, trip: Trip | null) {
  const esChofer = c.get("user").role === ROLES.CHOFER;
  return ok(c, trip && esChofer ? sinCobro(trip) : trip);
}

/** Completa la facturación de cada carga con las reglas. El chofer nunca manda esto. */
async function conCobro(db: D1Database, segs: TripSegmentInput[]) {
  if (!segs.length) return [];
  return aplicarCobro(await libretaRepo.listReglas(db), segs);
}

// Valida los campos requeridos de una etapa (carga/descarga) contra los valores enviados.
function missingField(tpl: TripTemplate, stage: string, values: Record<string, string>): string | null {
  for (const f of tpl.fields) {
    if (f.stage === stage && f.required && !String(values[f.key] ?? "").trim()) {
      return f.label;
    }
  }
  return null;
}

// GET /api/trips
trips.get("/", async (c) => {
  const user = c.get("user");
  const q = c.req.query();
  const filters: tripsRepo.TripFilters = {
    truckId: q.truck ? Number(q.truck) : undefined,
    status: (q.status as Trip["status"]) || undefined,
    provider: q.provider || undefined,
    from: q.from || undefined,
    to: q.to || undefined,
  };
  if (user.role === ROLES.CHOFER) {
    if (user.driver_id == null) return ok(c, []);
    filters.onlyDriverId = user.driver_id;
  } else if (q.driver) {
    filters.driverId = Number(q.driver);
  }
  const viajes = await tripsRepo.listTrips(c.env.DB, filters);
  return ok(c, user.role === ROLES.CHOFER ? viajes.map(sinCobro) : viajes);
});

// GET /api/trips/active — viaje en curso del chofer
trips.get("/active", async (c) => {
  const user = c.get("user");
  if (user.role !== ROLES.CHOFER || user.driver_id == null) return ok(c, null);
  const activo = await tripsRepo.activeTripForDriver(c.env.DB, user.driver_id);
  return ok(c, activo ? sinCobro(activo) : null);
});

// GET /api/trips/:id — detalle + fotos + definición de campos de la plantilla
trips.get("/:id", async (c) => {
  const s = await scoped(c);
  if ("error" in s) return fail(c, s.error, s.status);
  const [photos, tpl] = await Promise.all([
    photosRepo.listPhotos(c.env.DB, s.trip.id),
    s.trip.template_id ? templatesRepo.getTemplate(c.env.DB, s.trip.template_id) : Promise.resolve(null),
  ]);
  const esChofer = c.get("user").role === ROLES.CHOFER;
  const base = esChofer ? sinCobro(s.trip) : s.trip;
  const trip = { ...base, fields: tpl?.fields ?? [] };
  return ok(c, {
    trip,
    photos,
    arrival_photo_label: tpl?.arrival_photo_label ?? null,
    // Lo que la pantalla del chofer necesita saber de la plantilla.
    multi_renglon: !!tpl?.multi_renglon,
    pide_kilometros: !!tpl?.pide_kilometros,
    viaje_vacio: !!tpl?.viaje_vacio,
    // Misma regla que valida el cierre: la pantalla no puede pedir algo que el backend no
    // exige. Sin R2 las fotos ni se guardan, así que tampoco se piden — si no, el chofer
    // no podría registrar una carga y le quedaría un "falta la foto" que nunca se va.
    foto_carga_requerida: !!c.env.FOTOS && requiereFotoCarga(tpl),
    provider_id: tpl?.provider_id ?? null,
  });
});

// POST /api/trips — el chofer inicia un viaje desde una plantilla
trips.post("/", async (c) => {
  const user = c.get("user");
  if (user.role !== ROLES.CHOFER || user.driver_id == null) {
    return fail(c, "Solo un chofer puede iniciar un viaje", 403);
  }

  // Un viaje a la vez: hasta no cerrar el actual no se puede abrir otro. Evita que se
  // acumulen viajes abiertos sin evidencia y que la oficina no sepa cuál está en curso.
  const abierto = await tripsRepo.activeTripForDriver(c.env.DB, user.driver_id);
  if (abierto) {
    return fail(
      c,
      `Todavía tenés un viaje sin cerrar: ${abierto.origin} → ${abierto.destination}. Registrá la llegada antes de empezar otro.`,
      409,
    );
  }

  const b = await c.req.json<any>().catch(() => null);
  if (!b || !b.template_id || !b.destino) return fail(c, "Elegí el viaje y el destino", 400);

  const tpl = await templatesRepo.getTemplate(c.env.DB, Number(b.template_id));
  if (!tpl || !tpl.active) return fail(c, "Plantilla de viaje no disponible", 404);

  const values: Record<string, string> = b.field_values ?? {};
  const missing = missingField(tpl, "carga", values);
  if (missing) return fail(c, `Falta: ${missing}`, 400);

  const weightField = tpl.fields.find((f) => f.is_weight);
  const weight = weightField && values[weightField.key] ? Number(values[weightField.key]) : null;

  const truckId = b.truck_id ? Number(b.truck_id) : user.truck_id;
  if (!truckId) return fail(c, "No tenés un camión asignado", 400);

  const id = await tripsRepo.startTrip(c.env.DB, {
    template_id: tpl.id,
    provider_name: tpl.provider_name ?? "",
    origin: b.origin ? String(b.origin) : tpl.origin,
    // El remitente puede venir de la libreta (plantillas con campos_ubicacion);
    // si no, se mantiene el fijo de la plantilla.
    remite: b.remitente ? String(b.remitente).trim() : tpl.remite,
    destination: String(b.destino),
    destinatario: b.destinatario ? String(b.destinatario) : null,
    driver_id: user.driver_id,
    truck_id: truckId,
    cargo_type: tpl.cargo_type,
    weight_tons: weight != null && !isNaN(weight) ? weight : null,
    field_values: values,
    segments: await conCobro(c.env.DB, parseSegments(b.segments)),
  });
  return okViaje(c, await tripsRepo.getTrip(c.env.DB, id));
});

// POST /api/trips/:id/segments — el chofer suma una carga al viaje en curso.
trips.post("/:id/segments", async (c) => {
  const s = await scoped(c);
  if ("error" in s) return fail(c, s.error, s.status);
  if (s.trip.status !== TRIP_STATUS.EN_CURSO) return fail(c, "El viaje no está en curso", 409);

  const b = (await c.req.json().catch(() => ({}))) as { segments?: unknown };
  // Los sid ya usados entran al set para que una carga nueva no pise el de otra —
  // y con él, la foto de otra.
  const nuevos = parseSegments(b.segments, new Set(s.trip.segments.map((x) => x.sid)));
  if (!nuevos.length) return fail(c, "Falta el lugar de carga", 400);

  // Los agrupadores ("Varios") no valen como lugar de carga: es justo el dato
  // que no se puede perder para poder facturar.
  for (const seg of nuevos) {
    if (seg.remitente_id == null) continue;
    const entrada = await libretaRepo.getEntry(c.env.DB, seg.remitente_id);
    if (entrada?.agrupador) {
      return fail(c, `"${entrada.nombre}" no sirve como lugar de carga: elegí dónde cargaste.`, 400);
    }
  }

  const todos = [...s.trip.segments, ...(await conCobro(c.env.DB, nuevos))];
  await tripsRepo.updateSegments(c.env.DB, s.trip.id, todos);
  return okViaje(c, await tripsRepo.getTrip(c.env.DB, s.trip.id));
});

// DELETE /api/trips/:id/segments/:idx — quitar una carga cargada por error.
trips.delete("/:id/segments/:idx", async (c) => {
  const s = await scoped(c);
  if ("error" in s) return fail(c, s.error, s.status);
  if (s.trip.status !== TRIP_STATUS.EN_CURSO) return fail(c, "El viaje no está en curso", 409);
  const idx = Number(c.req.param("idx"));
  if (isNaN(idx) || idx < 0 || idx >= s.trip.segments.length) return fail(c, "Carga inexistente", 404);
  const quedan = s.trip.segments.filter((_, i) => i !== idx);
  await tripsRepo.updateSegments(c.env.DB, s.trip.id, quedan);
  return okViaje(c, await tripsRepo.getTrip(c.env.DB, s.trip.id));
});

// PUT /api/trips/:id/segments — la oficina corrige las cargas, incluso de un viaje cerrado.
trips.put("/:id/segments", requireRole(ROLES.ENCARGADO, ROLES.ADMIN), async (c) => {
  const trip = await tripsRepo.getTrip(c.env.DB, Number(c.req.param("id")));
  if (!trip) return fail(c, "Viaje no encontrado", 404);
  const b = (await c.req.json().catch(() => ({}))) as { segments?: unknown };
  const segs = parseSegments(b.segments);
  const conReglas = await conCobro(c.env.DB, segs);

  // La oficina puede fijar el cobro a mano; eso no lo pisa la regla después.
  const raw = Array.isArray(b.segments) ? (b.segments as any[]) : [];
  const finales = conReglas.map((seg, i) => {
    const m = raw[i];
    if (!m?.cobro_manual) return seg;
    return { ...seg, cobro_tipo: m.cobro_tipo ?? null, cobro_a: m.cobro_a ?? null, cobro_manual: true };
  });

  await tripsRepo.updateSegments(c.env.DB, trip.id, finales, {
    userId: c.get("user").id,
    when: nowIso(),
  });
  return ok(c, await tripsRepo.getTrip(c.env.DB, trip.id));
});

// POST /api/trips/:id/finish — registrar llegada (campos de descarga + observaciones)
trips.post("/:id/finish", async (c) => {
  const s = await scoped(c);
  if ("error" in s) return fail(c, s.error, s.status);
  if (s.trip.status !== TRIP_STATUS.EN_CURSO) return fail(c, "El viaje no está en curso", 409);

  const b = (await c.req.json().catch(() => ({}))) as {
    field_values?: Record<string, string>;
    notes?: string;
    kilometros?: number;
  };
  const merged = { ...s.trip.field_values, ...(b.field_values ?? {}) };

  const tpl = s.trip.template_id ? await templatesRepo.getTemplate(c.env.DB, s.trip.template_id) : null;
  if (tpl) {
    const missing = missingField(tpl, "descarga", merged);
    if (missing) return fail(c, `Falta: ${missing}`, 400);
  }

  // Un viaje combinado sin ninguna carga registrada no sirve para facturar.
  if (tpl?.multi_renglon && !tpl.viaje_vacio && !s.trip.segments.length) {
    return fail(c, "Registrá al menos una carga antes de cerrar el viaje.", 409);
  }

  if (tpl?.pide_kilometros && b.kilometros == null && s.trip.kilometros == null) {
    return fail(c, "Falta: kilómetros del recorrido.", 400);
  }
  if (b.kilometros != null) {
    await tripsRepo.setKilometros(c.env.DB, s.trip.id, Number(b.kilometros));
  }

  // Un viaje no se cierra sin su evidencia: queda pendiente hasta que estén las fotos.
  // Solo se exige si R2 está configurado — sin R2 las fotos no se guardan y el viaje
  // nunca podría cerrarse. Al habilitarlo, la regla empieza a aplicar sola.
  if (c.env.FOTOS) {
    const fotos = await photosRepo.listPhotos(c.env.DB, s.trip.id);
    const faltantes: string[] = [];
    if (requiereFotoCarga(tpl)) {
      if (tpl?.multi_renglon) {
        // En los combinados la evidencia es una foto por lugar de carga: con una sola
        // no se sabe cuál de las tres cargas quedó documentada.
        const sinFoto = renglonesSinFoto(s.trip.segments, fotos);
        if (sinFoto.length) {
          faltantes.push(`la foto de: ${sinFoto.map((x) => x.remitente).join(", ")}`);
        }
      } else if (!fotos.some((f) => f.kind === PHOTO_KIND.CARGA)) {
        faltantes.push("la foto de la carga");
      }
    }
    if (tpl?.arrival_photo_label && !fotos.some((f) => f.kind === PHOTO_KIND.DESCARGA)) {
      faltantes.push(`la foto: ${tpl.arrival_photo_label}`);
    }
    if (faltantes.length) {
      return fail(c, `El viaje queda pendiente hasta que cargues ${faltantes.join(" y ")}.`, 409);
    }
  }

  await tripsRepo.finishTrip(c.env.DB, s.trip.id, nowIso(), merged, b.notes ?? s.trip.notes ?? null);
  return okViaje(c, await tripsRepo.getTrip(c.env.DB, s.trip.id));
});

// POST /api/trips/:id/cancel
trips.post("/:id/cancel", async (c) => {
  const s = await scoped(c);
  if ("error" in s) return fail(c, s.error, s.status);
  const b = (await c.req.json().catch(() => ({}))) as { notes?: string };
  await tripsRepo.cancelTrip(c.env.DB, s.trip.id, b.notes ?? "");
  return okViaje(c, await tripsRepo.getTrip(c.env.DB, s.trip.id));
});

trips.delete("/:id", requireRole(ROLES.ENCARGADO, ROLES.ADMIN), async (c) => {
  await c.env.DB.prepare("DELETE FROM trips WHERE id = ?").bind(Number(c.req.param("id"))).run();
  return ok(c, { deleted: true });
});

export default trips;
