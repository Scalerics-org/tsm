import { Hono } from "hono";
import type { Env, Vars } from "../env";
import { ok, fail } from "../lib/response";
import { requireAuth, requireRole } from "../middleware/auth";
import {
  MENSAJE_LECTURA_PENDIENTE,
  ROLES,
  bloqueaSalidaPorLectura,
  corrimientoEnDias,
  esFechaValida,
  plantillaHabilitada,
  TRIP_STATUS,
  UNIDAD,
  aplicarCobro,
  avisoViajeCerrado,
  fotosFaltantes,
  parseRenglon,
  requiereFotoCarga,
  sinCobro,
  sirveComoLugarDeCarga,
  type Trip,
  type TripSegmentInput,
  type TripTemplate,
} from "../../shared/domain";
import { kmEstimados } from "../../shared/distancias";
import * as tripsRepo from "../repos/trips";
import * as templatesRepo from "../repos/templates";
import * as photosRepo from "../repos/photos";
import * as libretaRepo from "../repos/libreta";
import * as lecturasRepo from "../repos/lecturas";
import * as driversRepo from "../repos/drivers";
import { periodoDeHoy } from "../lib/periodo";
import { notificarOficina } from "../lib/avisos";

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

// El mapeo de los once campos vive en domain.ts, compartido con la ruta de plantillas.
// Acá sólo se le agrega el sid y se descarta el renglón sin lugar de carga.
// (Ciudad y destino propios del renglón sólo llegan en el combinado genérico; en los demás
//  quedan null y vale lo del viaje.)
function parseSegments(raw: any, usados = new Set<string>()): TripSegmentInput[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r: any) => ({ sid: sidDe(r?.sid, usados), ...parseRenglon(r) }))
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
  // Cada renglón que se guarda cuenta como un uso de los nombres que eligió. De ese contador
  // cuelgan el orden de la libreta (los más usados arriba, que es lo que hace que el chofer
  // los encuentre) y el aviso de la oficina antes de borrar. Estaba escrito y sin llamar:
  // los 42 nombres decían 0 usos.
  await libretaRepo.bumpUsos(db, segs.flatMap((s) => [s.remitente_id, ...s.cliente_ids]));
  // Y de paso se aprende de qué departamento es cada lugar de carga: el chofer eligió
  // "Artigas" y después "TIMBER", así que TIMBER es de Artigas. Con eso el selector se afina
  // solo y deja de mostrarle los de Montevideo a alguien que está cargando en el norte.
  await libretaRepo.aprenderDepartamento(
    db,
    segs
      .filter((s) => s.remitente_id != null && s.origen)
      .map((s) => ({ entryId: s.remitente_id as number, departamento: s.origen as string })),
  );
  return aplicarCobro(await libretaRepo.listReglas(db), segs);
}

/**
 * El primer renglón cuyo lugar de carga es un agrupador, o null si están todos bien.
 *
 * Los tres caminos que guardan renglones tienen que aplicar la misma regla. Antes vivía
 * inline en uno solo, y por eso la oficina podía grabar "Varios" como lugar de carga.
 */
async function primerAgrupador(db: D1Database, segs: TripSegmentInput[]): Promise<string | null> {
  for (const seg of segs) {
    if (seg.remitente_id == null) continue;
    const entrada = await libretaRepo.getEntry(db, seg.remitente_id);
    if (!sirveComoLugarDeCarga(entrada)) return entrada?.nombre ?? seg.remitente;
  }
  return null;
}

const mensajeAgrupador = (nombre: string) =>
  `"${nombre}" no sirve como lugar de carga: elegí dónde cargaste.`;

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
    carga_photo_label: tpl?.carga_photo_label ?? null,
    // Lo que la pantalla del chofer necesita saber de la plantilla.
    multi_renglon: !!tpl?.multi_renglon,
    pide_kilometros: !!tpl?.pide_kilometros,
    viaje_vacio: !!tpl?.viaje_vacio,
    // Misma regla que valida el cierre: la pantalla no puede pedir algo que el backend no
    // exige. Sin R2 las fotos ni se guardan, así que tampoco se piden — si no, el chofer
    // no podría registrar una carga y le quedaría un "falta la foto" que nunca se va.
    foto_carga_requerida: !!c.env.FOTOS && requiereFotoCarga(tpl),
    renglon_pide_ubicacion: !!tpl?.renglon_pide_ubicacion,
    renglon_pide_departamento: !!tpl?.renglon_pide_departamento,
    provider_id: tpl?.provider_id ?? null,
  });
});

// POST /api/trips — el chofer inicia un viaje desde una plantilla
trips.post("/", async (c) => {
  const user = c.get("user");
  const esChoferQueSale = user.role === ROLES.CHOFER && user.driver_id != null;
  const esOficina = user.role === ROLES.ENCARGADO || user.role === ROLES.ADMIN;
  if (!esChoferQueSale && !esOficina) {
    return fail(c, "Solo un chofer puede iniciar un viaje", 403);
  }

  const b = await c.req.json<any>().catch(() => null);
  if (!b || !b.template_id || !b.destino) return fail(c, "Elegí el viaje y el destino", 400);

  // La oficina puede cargar un viaje a mano, para corregir uno que el chofer no registró.
  // Como no lo está manejando ella, tiene que decir de quién es; el chofer siempre es él.
  const driverId = esChoferQueSale ? user.driver_id : b.driver_id ? Number(b.driver_id) : null;
  if (driverId == null) return fail(c, "Elegí de qué chofer es el viaje", 400);

  // Un viaje a la vez: hasta no cerrar el actual no se puede abrir otro. Evita que se
  // acumulen viajes abiertos sin evidencia y que la oficina no sepa cuál está en curso.
  // No aplica a la oficina: está cargando un viaje que YA pasó, no abriendo uno.
  if (esChoferQueSale) {
    const abierto = await tripsRepo.activeTripForDriver(c.env.DB, driverId);
    if (abierto) {
      return fail(
        c,
        `Todavía tenés un viaje sin cerrar: ${abierto.origin} → ${abierto.destination}. Registrá la llegada antes de empezar otro.`,
        409,
      );
    }
  }

  const truckId = b.truck_id ? Number(b.truck_id) : user.truck_id;
  if (!truckId) return fail(c, "No tenés un camión asignado", 400);

  // La foto del tacógrafo del mes, antes de salir.
  //
  // "Por ahora vamos a bloquearla, total es solo una foto al tacógrafo, no es complicado."
  // Bloquea EMPEZAR, no cerrar: el que arrancó el 31 termina su viaje el 1 sin que le pidan
  // nada —"si un chofer justo está en ruta cuando cambia el día, que le permita terminar el
  // viaje"— justamente porque este control está acá y no en el cierre.
  //
  // La oficina pasa: está cargando un viaje que ya pasó, no saliendo a la ruta.
  if (esChoferQueSale) {
    // El camión ASIGNADO, que es el mismo del que la pantalla le pide la foto. Si acá se
    // mirara el que sale manejando hoy, el que agarra otro camión quedaría trabado por una
    // lectura que la app nunca le va a pedir, y no tendría forma de destrabarse.
    // Sin `?? truckId`: si el chofer se quedó sin camión asignado, la pantalla de inicio no
    // le ofrece cargar ninguna foto —para ella no tiene camión— y bloquearlo por el que
    // agarró hoy lo dejaba sin ninguna acción posible en la app, esperando un llamado a la
    // oficina. `bloqueaSalidaPorLectura` con null no bloquea, y es a propósito.
    const suyo = await driversRepo.currentTruckId(c.env.DB, driverId);
    const lectura = suyo == null ? null : await lecturasRepo.getLectura(c.env.DB, suyo, periodoDeHoy());
    if (bloqueaSalidaPorLectura(suyo, lectura != null)) {
      return fail(c, MENSAJE_LECTURA_PENDIENTE, 409);
    }
  }

  const tpl = await templatesRepo.getTemplate(c.env.DB, Number(b.template_id));
  if (!tpl || !tpl.active) return fail(c, "Plantilla de viaje no disponible", 404);

  const values: Record<string, string> = b.field_values ?? {};
  const missing = missingField(tpl, "carga", values);
  if (missing) return fail(c, `Falta: ${missing}`, 400);

  const weightField = tpl.fields.find((f) => f.is_weight);
  const weight = weightField && values[weightField.key] ? Number(values[weightField.key]) : null;

  // Esconder la plantilla de la lista no alcanza: el id viaja en el pedido y se puede mandar
  // igual. Sin este control la restricción por camión es decorativa.
  // La oficina pasa: es quien define la asignación, y puede necesitar una excepción puntual.
  if (user.role === ROLES.CHOFER && !plantillaHabilitada(tpl, truckId)) {
    return fail(c, "Ese viaje no es de tu camión", 403);
  }

  // Los fijos se instancian SIEMPRE, no solo cuando el pedido no trae renglones: si no,
  // alcanzaba con crear el viaje mandando `segments` propios para que la ida y la vuelta de
  // la oficina no existieran nunca.
  const fijos = (await conCobro(c.env.DB, parseSegments(tpl.renglones_fijos ?? []))).map((x) => ({
    ...x,
    fijo: true,
  }));
  // Un viaje de un solo tramo no lleva renglones del chofer: cada renglón es una unidad
  // facturable, y ahí no hay ninguna que armar. La oficina sí puede, por PUT /:id/segments.
  const propios =
    user.role === ROLES.CHOFER && !tpl.multi_renglon
      ? []
      : parseSegments(b.segments, new Set(fijos.map((x) => x.sid)));

  const agrupadorAlta = await primerAgrupador(c.env.DB, propios);
  if (agrupadorAlta) return fail(c, mensajeAgrupador(agrupadorAlta), 400);

  const extra = await conCobro(c.env.DB, propios);

  const id = await tripsRepo.startTrip(c.env.DB, {
    template_id: tpl.id,
    provider_name: tpl.provider_name ?? "",
    origin: b.origin ? String(b.origin) : tpl.origin,
    // El remitente puede venir de la libreta (plantillas con campos_ubicacion);
    // si no, se mantiene el fijo de la plantilla.
    remite: b.remitente ? String(b.remitente).trim() : tpl.remite,
    destination: String(b.destino),
    destinatario: b.destinatario ? String(b.destinatario) : null,
    driver_id: driverId,
    truck_id: truckId,
    cargo_type: tpl.cargo_type,
    weight_tons: weight != null && !isNaN(weight) ? weight : null,
    field_values: values,
    // Los renglones que la oficina dejó puestos (la ida y la vuelta de Manassi) se crean
    // junto con el viaje: el chofer no los arma, sólo les completa la cantidad y la foto.
    // Cada viaje los instancia con su propio sid — si vinieran con uno de la plantilla,
    // todos los viajes compartirían el mismo y las fotos de uno aparecerían en los demás.
    segments: [...fijos, ...extra],
    kilometros: b.kilometros != null && b.kilometros !== "" ? Number(b.kilometros) : null,
  },
  // Si lo carga la oficina es porque el viaje ya se hizo y no quedó registrado: nace cerrado,
  // con la fecha que indique. Por eso tampoco se le exigen las fotos — no hubo app en el
  // momento, que es justamente el motivo por el que se está cargando a mano.
  esOficina
    ? {
        userId: user.id,
        when: nowIso(),
        startedAt: b.fecha ? `${String(b.fecha).slice(0, 10)} 00:00:00` : nowIso(),
      }
    : undefined,
  );
  return okViaje(c, await tripsRepo.getTrip(c.env.DB, id));
});

// POST /api/trips/:id/segments — el chofer suma una carga al viaje en curso.
trips.post("/:id/segments", async (c) => {
  const s = await scoped(c);
  if ("error" in s) return fail(c, s.error, s.status);
  if (s.trip.status !== TRIP_STATUS.EN_CURSO) return fail(c, "El viaje no está en curso", 409);

  // Esconder el panel de cargas no alcanza: el id del viaje viaja en el pedido y se puede
  // mandar igual. Si la plantilla es de un solo tramo el chofer no arma renglones.
  // La oficina pasa: corrige por PUT /:id/segments.
  const tplSeg = s.trip.template_id
    ? await templatesRepo.getTemplate(c.env.DB, s.trip.template_id)
    : null;
  if (c.get("user").role === ROLES.CHOFER && tplSeg && !tplSeg.multi_renglon) {
    return fail(c, "Este viaje no lleva cargas por renglón", 403);
  }

  const b = (await c.req.json().catch(() => ({}))) as { segments?: unknown };
  // Los sid ya usados entran al set para que una carga nueva no pise el de otra —
  // y con él, la foto de otra.
  const nuevos = parseSegments(b.segments, new Set(s.trip.segments.map((x) => x.sid)));
  if (!nuevos.length) return fail(c, "Falta el lugar de carga", 400);

  const agrupador = await primerAgrupador(c.env.DB, nuevos);
  if (agrupador) return fail(c, mensajeAgrupador(agrupador), 400);

  const todos = [...s.trip.segments, ...(await conCobro(c.env.DB, nuevos))];
  await tripsRepo.updateSegments(c.env.DB, s.trip.id, todos);
  return okViaje(c, await tripsRepo.getTrip(c.env.DB, s.trip.id));
});

/**
 * PATCH /api/trips/:id/segments/:sid — el chofer completa la cantidad de una carga.
 *
 * Es lo que necesitan los viajes con renglones ya puestos: la oficina dejó armada la ida
 * y la vuelta, y al chofer sólo le queda decir cuántos pallets y sacar la foto. No puede
 * tocar el lugar ni los clientes — eso lo definió la oficina y es de donde sale el cobro.
 */
trips.patch("/:id/segments/:sid", async (c) => {
  const s = await scoped(c);
  if ("error" in s) return fail(c, s.error, s.status);
  if (s.trip.status !== TRIP_STATUS.EN_CURSO) return fail(c, "El viaje no está en curso", 409);

  const sid = c.req.param("sid");
  if (!s.trip.segments.some((x) => x.sid === sid)) return fail(c, "Carga inexistente", 404);

  const b = (await c.req.json().catch(() => ({}))) as { cantidad?: unknown; unidad?: unknown; remito?: unknown };
  const cantidad = b.cantidad != null && b.cantidad !== "" ? Number(b.cantidad) : null;
  if (cantidad != null && (isNaN(cantidad) || cantidad <= 0)) {
    return fail(c, "La cantidad tiene que ser mayor a cero", 400);
  }

  const actualizados = s.trip.segments.map((x) =>
    x.sid !== sid
      ? x
      : {
          ...x,
          cantidad,
          unidad: cantidad != null && (b.unidad === UNIDAD.KILOS || b.unidad === UNIDAD.PALLETS)
            ? b.unidad
            : cantidad != null
              ? x.unidad
              : null,
          remito: b.remito ? String(b.remito).trim() : x.remito,
        },
  );
  await tripsRepo.updateSegments(c.env.DB, s.trip.id, actualizados);
  return okViaje(c, await tripsRepo.getTrip(c.env.DB, s.trip.id));
});

// DELETE /api/trips/:id/segments/:sid — quitar una carga cargada por error.
trips.delete("/:id/segments/:sid", async (c) => {
  const s = await scoped(c);
  if ("error" in s) return fail(c, s.error, s.status);
  if (s.trip.status !== TRIP_STATUS.EN_CURSO) return fail(c, "El viaje no está en curso", 409);
  // Se identifica por `sid` y no por posición. Con el índice, un segundo toque sobre la misma
  // fila (señal mala, la pantalla no se había refrescado) borraba la carga SIGUIENTE: el
  // backend ya había sacado la primera y la posición pasaba a apuntar a otra. Probado, y era
  // una carga facturable perdida sin rastro. `sid` es lo único estable — el resto del renglón
  // (la cantidad, la foto, la corrección de oficina) ya se direccionaba así.
  const sid = c.req.param("sid");
  const objetivo = s.trip.segments.find((x) => x.sid === sid);
  if (!objetivo) return fail(c, "Esa carga ya no está en el viaje", 404);

  // La ida y la vuelta las dejó puestas la oficina, y de ahí sale el cobro: el chofer les
  // completa la cantidad y la foto, no las saca. Es la misma razón por la que el PATCH no lo
  // deja tocar el lugar ni los clientes. La oficina corrige por PUT /:id/segments.
  if (c.get("user").role === ROLES.CHOFER && objetivo.fijo) {
    return fail(c, "Ese renglón lo puso la oficina: no se puede quitar.", 403);
  }

  const quedan = s.trip.segments.filter((x) => x.sid !== sid);
  await tripsRepo.updateSegments(c.env.DB, s.trip.id, quedan);
  return okViaje(c, await tripsRepo.getTrip(c.env.DB, s.trip.id));
});

// PUT /api/trips/:id/segments — la oficina corrige las cargas, incluso de un viaje cerrado.
trips.put("/:id/segments", requireRole(ROLES.ENCARGADO, ROLES.ADMIN), async (c) => {
  const trip = await tripsRepo.getTrip(c.env.DB, Number(c.req.param("id")));
  if (!trip) return fail(c, "Viaje no encontrado", 404);
  const b = (await c.req.json().catch(() => ({}))) as { segments?: unknown };
  const segs = parseSegments(b.segments);

  // La misma regla que ya frena al chofer: "Varios" no vale como lugar de carga. Faltaba
  // acá, así que la oficina podía dejarlo grabado — y ése es el dato que no se puede perder.
  const agrupador = await primerAgrupador(c.env.DB, segs);
  if (agrupador) return fail(c, mensajeAgrupador(agrupador), 400);

  const conReglas = await conCobro(c.env.DB, segs);

  // `fijo` no viaja en lo que manda el cliente (no está en TripSegmentInput), así que sin
  // esto una corrección de oficina le sacaba la marca a la ida y la vuelta de Manassi y el
  // chofer pasaba a poder borrarlas. Se recupera por sid, que es lo único estable: el orden
  // de los renglones lo decide quien corrige.
  const eranFijos = new Set(trip.segments.filter((x) => x.fijo).map((x) => x.sid));

  // La oficina puede fijar el cobro a mano; eso no lo pisa la regla después.
  //
  // Se empareja por `sid` y no por posición: `parseSegments` descarta los renglones sin lugar
  // de carga, así que una fila vacía en el medio corría el índice y el cobro escrito a mano
  // aterrizaba en OTRO renglón, o se perdía. Verificado antes de arreglarlo.
  const manuales = new Map<string, any>();
  if (Array.isArray(b.segments)) {
    for (const m of b.segments as any[]) {
      if (m?.cobro_manual && m?.sid) manuales.set(String(m.sid), m);
    }
  }

  const finales = conReglas.map((seg) => {
    const conFijo = eranFijos.has(seg.sid) ? { ...seg, fijo: true } : seg;
    const m = manuales.get(seg.sid);
    if (!m) return conFijo;
    return { ...conFijo, cobro_tipo: m.cobro_tipo ?? null, cobro_a: m.cobro_a ?? null, cobro_manual: true };
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
  } else if (s.trip.kilometros == null) {
    // Si nadie los puso, los estima la app con el origen y el destino.
    //
    // Es lo que hace posible el control de fin de mes sin pedirle un dato más al chofer:
    // "el vacío, si bien está buenazo, lo veo muy llenador para ellos" — y los kilómetros
    // la app ya los sabe. Es un aproximado y así se usa: sirve para detectar que faltan
    // 3.000 km en el mes, no para facturar por kilómetro.
    //
    // Si no reconoce alguna de las dos puntas queda en null, que es lo honesto: mejor un
    // hueco visible que un número inventado que después nadie sabe de dónde salió.
    const estimado = kmEstimados(s.trip.origin, s.trip.destination);
    if (estimado != null) await tripsRepo.setKilometros(c.env.DB, s.trip.id, estimado);
  }

  // Un viaje no se cierra sin su evidencia: queda pendiente hasta que estén las fotos.
  // Solo se exige si R2 está configurado — sin R2 las fotos no se guardan y el viaje
  // nunca podría cerrarse. Al habilitarlo, la regla empieza a aplicar sola.
  if (c.env.FOTOS) {
    const fotos = await photosRepo.listPhotos(c.env.DB, s.trip.id);
    const faltantes = fotosFaltantes(tpl, s.trip.segments, fotos);
    if (faltantes.length) {
      return fail(c, `El viaje queda pendiente hasta que cargues ${faltantes.join(" y ")}.`, 409);
    }
  }

  await tripsRepo.finishTrip(c.env.DB, s.trip.id, nowIso(), merged, b.notes ?? s.trip.notes ?? null);
  const cerrado = await tripsRepo.getTrip(c.env.DB, s.trip.id);

  // El aviso a la oficina va DESPUÉS de cerrar y sin esperarlo: si el servidor de push está
  // caído o el celular no existe más, el chofer igual terminó su viaje. Con waitUntil el
  // Worker no corta la tarea al responder, así que el chofer no espera por esto.
  if (cerrado) {
    c.executionCtx.waitUntil(
      avisarViajeCerrado(c.env, cerrado, tpl?.fields ?? []).catch(() => {}),
    );
  }

  return okViaje(c, cerrado);
});

/**
 * Aviso de viaje cerrado a los celulares de la oficina.
 *
 * "Al finalizar el viaje, notificar el celular." El reparto —a quiénes, con qué claves y qué
 * hacer con las suscripciones muertas— vive en lib/avisos: acá sólo se arma el texto.
 */
async function avisarViajeCerrado(env: Env, trip: Trip, campos: TripTemplate["fields"]): Promise<void> {
  await notificarOficina(env, avisoViajeCerrado(trip, campos));
}

// POST /api/trips/:id/cancel
trips.post("/:id/cancel", async (c) => {
  const s = await scoped(c);
  if ("error" in s) return fail(c, s.error, s.status);
  const b = (await c.req.json().catch(() => ({}))) as { notes?: string };
  await tripsRepo.cancelTrip(c.env.DB, s.trip.id, b.notes ?? "");
  return okViaje(c, await tripsRepo.getTrip(c.env.DB, s.trip.id));
});

/**
 * PATCH /api/trips/:id/fecha — la oficina corrige la fecha de un viaje ya cargado.
 *
 * "Pidió que pueda cambiar la fecha porque si quiere ingresar un viaje pasado, no puede." Al
 * CREARLO ya se podía elegir la fecha; lo que faltaba era corregirla después, que es el caso
 * real: el viaje se carga rápido y la fecha se mira al otro día.
 *
 * Un viaje ya facturado NO se mueve: cambiarlo de mes lo saca del resumen del período que
 * cubre una factura que ya se emitió, y el número de factura se quedaría donde estaba.
 */
trips.patch("/:id/fecha", requireRole(ROLES.ENCARGADO, ROLES.ADMIN), async (c) => {
  const trip = await tripsRepo.getTripFacturable(c.env.DB, Number(c.req.param("id")));
  if (!trip) return fail(c, "Viaje no encontrado", 404);
  if (trip.factura_numero) {
    return fail(
      c,
      `Ese viaje ya está en la factura ${trip.factura_numero}. Desmarcalo desde Facturación y después cambiale la fecha.`,
      409,
    );
  }

  const b = (await c.req.json().catch(() => null)) as { fecha?: unknown } | null;
  if (!esFechaValida(b?.fecha)) return fail(c, "La fecha va como 2026-08-21", 400);

  const dias = corrimientoEnDias(trip.started_at, b!.fecha as string);
  if (dias !== 0) {
    await tripsRepo.correrFecha(c.env.DB, trip.id, dias, { userId: c.get("user").id, when: nowIso() });
  }
  return okViaje(c, await tripsRepo.getTrip(c.env.DB, trip.id));
});

/**
 * DELETE /api/trips/:id — la oficina borra un viaje cargado por error.
 *
 * "Rodrigo también quiere poder borrar viajes." Cancelar sigue siendo la opción blanda —el
 * viaje queda marcado y sale de la auditoría y de la facturación igual—; esto es para el que
 * nunca tendría que haber existido.
 *
 * Dos frenos que antes no había: un viaje que ya está en una factura no se borra (el número
 * quedó emitido y nadie sabría después qué cubría), y las fotos se borran también del bucket
 * —la fila se iba sola por CASCADE, pero el archivo quedaba pagando espacio para siempre.
 */
trips.delete("/:id", requireRole(ROLES.ENCARGADO, ROLES.ADMIN), async (c) => {
  const trip = await tripsRepo.getTripFacturable(c.env.DB, Number(c.req.param("id")));
  if (!trip) return fail(c, "Viaje no encontrado", 404);
  if (trip.factura_numero) {
    return fail(
      c,
      `Ese viaje ya está en la factura ${trip.factura_numero}. Si de verdad hay que sacarlo, desmarcalo desde Facturación primero.`,
      409,
    );
  }

  // Las claves se leen ANTES: después del DELETE la fila ya no está y no habría contra qué
  // borrar en R2.
  const fotos = await photosRepo.listPhotos(c.env.DB, trip.id);
  await tripsRepo.deleteTrip(c.env.DB, trip.id);

  const bucket = c.env.FOTOS;
  if (bucket) {
    const claves = fotos.map((f) => f.r2_key).filter((k): k is string => !!k);
    // El viaje ya se borró: que la limpieza del bucket tarde o falle no puede hacer fallar
    // la respuesta ni dejar a la oficina sin saber si borró o no.
    c.executionCtx.waitUntil(
      Promise.all(claves.map((k) => bucket.delete(k).catch(() => {}))).then(() => {}),
    );
  }
  return ok(c, { deleted: true, fotos: fotos.length });
});

export default trips;
