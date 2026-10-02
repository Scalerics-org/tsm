import { Hono } from "hono";
import type { Env, Vars } from "../env";
import { ok, fail } from "../lib/response";
import { requireAuth, requireRole } from "../middleware/auth";
import { ROLES } from "../../shared/domain";
import {
  listTripsFacturables,
  marcarFacturados,
  desmarcarFacturados,
  marcarPagos,
  desmarcarPagos,
  sinFacturarAntesDe,
} from "../repos/trips";
import { getTripsFacturables } from "../repos/trips";
import {
  desmarcarClientes,
  desmarcarPagosClientes,
  marcarClientes,
  marcarPagosClientes,
} from "../repos/facturacion-clientes";
import {
  clienteUnicoDelViaje,
  clientesDelViaje,
  estrategiaDeFacturacion,
  motivoParaMarcarCliente,
} from "../../shared/facturacion-por-cliente";
import { listTemplates } from "../repos/templates";
import { resumenCliente } from "../lib/resumen-cliente";

/**
 * Facturación: qué viajes ya salieron en una factura y cuáles quedan por facturar.
 *
 * "Nosotros tenemos un sistema de facturación electrónica conectado con DGI... yo le pongo el
 * número de factura. Cuando facturamos le digo, anotate todos estos viajes que punteamos ahora,
 * le pongo el número de factura a todos los viajes."
 *
 * ACÁ NO SE EMITE NADA NI SE GENERA NINGÚN NÚMERO. La factura la hace su sistema; la app sólo
 * anota cuál es y a qué viajes les tocó, para que no vuelvan a aparecer.
 *
 * Todo esto es oficina: el chofer no entra ni de casualidad, es información de facturación.
 */
const facturacion = new Hono<{ Bindings: Env; Variables: Vars }>();
facturacion.use("*", requireAuth, requireRole(ROLES.ENCARGADO, ROLES.ADMIN));

/** El número lo tipea él a mano copiándolo de DGI, así que se guarda tal cual, sin formato. */
const LARGO_MAX_NUMERO = 40;

/** Los ids llegan de la pantalla; hay que desconfiar igual. */
function idsValidos(v: unknown): number[] | null {
  if (!Array.isArray(v) || v.length === 0) return null;
  const ids = v.map(Number).filter((n) => Number.isInteger(n) && n > 0);
  return ids.length === v.length ? [...new Set(ids)] : null;
}

const ahora = () => new Date().toISOString().replace("T", " ").slice(0, 19);

/** Cuántos ítems por pedido: la pantalla manda los que punteó la oficina, no el historial entero. */
const MAX_ITEMS = 200;

interface ItemCliente {
  trip_id: number;
  cliente_clave: string;
}

/** Los ítems llegan de la pantalla: hay que desconfiar igual. */
function itemsValidos(v: unknown): ItemCliente[] | null {
  if (!Array.isArray(v) || v.length === 0 || v.length > MAX_ITEMS) return null;
  const items: ItemCliente[] = [];
  const vistos = new Set<string>();
  for (const x of v) {
    const trip_id = Number(x?.trip_id);
    const clave = typeof x?.cliente_clave === "string" ? x.cliente_clave.trim() : "";
    if (!Number.isInteger(trip_id) || trip_id <= 0 || !clave || clave.length > 200) return null;
    const k = `${trip_id}|${clave}`;
    if (vistos.has(k)) continue;
    vistos.add(k);
    items.push({ trip_id, cliente_clave: clave });
  }
  return items;
}

/** Lo que se contesta por cada ítem que quedó afuera, para no decir "0 marcados" en silencio. */
interface Rechazado extends ItemCliente {
  motivo: string;
}

/**
 * GET /api/facturacion/resumen?provider=X&from=&to=&porDestino=1&incluirFacturados=1
 *
 * El resumen del cliente con lo que falta facturar. Por defecto los ya facturados no vienen;
 * con `incluirFacturados` vienen todos, que es como encuentra el que marcó por error.
 */
facturacion.get("/resumen", async (c) => {
  const q = c.req.query();
  const provider = q.provider?.trim();
  if (!provider) return fail(c, "Elegí el cliente", 400);

  // El tipo de viaje adentro del cliente: facturar TYCSUR sin sacar a Internacional de un solo
  // cliente para los choferes (Rodrigo, 18/9).
  const templateId = Number(q.plantilla) > 0 ? Number(q.plantilla) : undefined;
  const [trips, templates, anteriores] = await Promise.all([
    listTripsFacturables(c.env.DB, { provider, templateId, from: q.from, to: q.to }),
    listTemplates(c.env.DB),
    // Lo que quedó afuera por la fecha de arriba. La pantalla abre en el 1° del mes, así que
    // sin esto los viajes viejos sin facturar no los nombra nadie: hoy son 82.
    q.from ? sinFacturarAntesDe(c.env.DB, provider, q.from, templateId) : Promise.resolve(0),
  ]);

  return ok(c, {
    provider,
    desde: q.from ?? null,
    hasta: q.to ?? null,
    anteriores_sin_facturar: anteriores,
    ...resumenCliente(
      trips,
      templates.filter((t) => t.provider_name === provider && (templateId == null || t.id === templateId)),
      { porDestino: q.porDestino === "1", incluirFacturados: q.incluirFacturados === "1", cliente: provider },
    ),
  });
});

/**
 * POST /api/facturacion/marcar  { trip_ids: [1,2,3], factura_numero: "A-1234" }
 *
 * Los que ya tenían factura no se pisan y se los cuenta aparte: pisar el número de una factura
 * ya emitida deja el viaje cobrado en dos lados y no queda rastro de cuál era el bueno.
 */
facturacion.post("/marcar", async (c) => {
  const body = await c.req.json().catch(() => null);
  const ids = idsValidos(body?.trip_ids);
  if (!ids) return fail(c, "Elegí al menos un viaje para facturar", 400);

  const numero = String(body?.factura_numero ?? "").trim();
  if (!numero) return fail(c, "Escribí el número de la factura", 400);
  if (numero.length > LARGO_MAX_NUMERO) return fail(c, "Ese número de factura es demasiado largo", 400);

  const user = c.get("user");
  const quien = { userId: user.id, when: ahora() };

  // Un viaje por cliente con UN cliente se marca por ese cliente; con varios (o ninguno) no se toca: este
  // atajo no tiene cómo decir a quién va cada número, y no le va a poner uno solo a clientes que se
  // facturan aparte. Los demás (todo lo de siempre) siguen exactamente como estaban.
  const { porViaje, deClientes, rechazados } = await repartir(c.env.DB, ids);
  const marcadosViaje = await marcarFacturados(c.env.DB, porViaje, numero, quien);
  const hechos = await marcarClientes(
    c.env.DB,
    deClientes.map((d) => ({ trip_id: d.trip_id, cliente_clave: d.cliente.clave, cliente_nombre: d.cliente.nombre })),
    numero,
    quien,
  );
  const marcadosClientes = hechos.filter(Boolean).length;
  const marcados = marcadosViaje + marcadosClientes;

  return ok(c, {
    marcados,
    sin_tocar: ids.length - marcados,
    factura_numero: numero,
    ...(rechazados.length ? { rechazados } : {}),
  });
});

/**
 * POST /api/facturacion/desmarcar  { trip_ids: [1,2,3] }
 *
 * Le saca la factura al viaje y vuelve al resumen. Existe porque "se va a equivocar alguna vez"
 * y sin esto el viaje quedaría afuera para siempre, sin que nadie lo cobre.
 */
facturacion.post("/desmarcar", async (c) => {
  const body = await c.req.json().catch(() => null);
  const ids = idsValidos(body?.trip_ids);
  if (!ids) return fail(c, "Elegí al menos un viaje", 400);

  const { porViaje, deClientes, rechazados } = await repartir(c.env.DB, ids);
  const desmarcadosViaje = await desmarcarFacturados(c.env.DB, porViaje);
  const hechos = await desmarcarClientes(
    c.env.DB,
    deClientes.map((d) => ({ trip_id: d.trip_id, cliente_clave: d.cliente.clave })),
    ahora(),
  );
  const desmarcados = desmarcadosViaje + hechos.filter(Boolean).length;
  return ok(c, { desmarcados, sin_tocar: ids.length - desmarcados, ...(rechazados.length ? { rechazados } : {}) });
});

/**
 * POST /api/facturacion/marcar-pago  { trip_ids: [1,2,3] }
 *
 * "Cuando paguen le pongo sí en otro tick y queda en verde." (Rodrigo, 23/9). Sólo agrega
 * información: anota quién y cuándo, y no toca la factura ni saca al viaje de ningún resumen.
 *
 * Sólo se cobra lo que ya tiene factura o referencia; sin eso no hay nada que cobrar. Si ninguno
 * de los que llegan se pudo marcar, se dice por qué en vez de contestar "0 marcados" en silencio.
 */
facturacion.post("/marcar-pago", async (c) => {
  const body = await c.req.json().catch(() => null);
  const ids = idsValidos(body?.trip_ids);
  if (!ids) return fail(c, "Elegí al menos un viaje", 400);

  const user = c.get("user");
  const quien = { userId: user.id, when: ahora() };
  const { porViaje, deClientes, rechazados } = await repartir(c.env.DB, ids);
  const marcadosViaje = await marcarPagos(c.env.DB, porViaje, quien);
  const hechos = await marcarPagosClientes(
    c.env.DB,
    deClientes.map((d) => ({ trip_id: d.trip_id, cliente_clave: d.cliente.clave })),
    quien,
  );
  const marcados = marcadosViaje + hechos.filter(Boolean).length;
  if (marcados === 0) {
    return fail(c, "Sólo se marca pago un viaje que ya tiene factura o referencia y que todavía no figura pago.", 409);
  }
  return ok(c, { marcados, sin_tocar: ids.length - marcados, ...(rechazados.length ? { rechazados } : {}) });
});

/**
 * POST /api/facturacion/desmarcar-pago  { trip_ids: [1,2,3] }
 *
 * Saca el pago y nada más: el viaje sigue con su factura.
 */
facturacion.post("/desmarcar-pago", async (c) => {
  const body = await c.req.json().catch(() => null);
  const ids = idsValidos(body?.trip_ids);
  if (!ids) return fail(c, "Elegí al menos un viaje", 400);

  const { porViaje, deClientes, rechazados } = await repartir(c.env.DB, ids);
  const desmarcadosViaje = await desmarcarPagos(c.env.DB, porViaje);
  const hechos = await desmarcarPagosClientes(
    c.env.DB,
    deClientes.map((d) => ({ trip_id: d.trip_id, cliente_clave: d.cliente.clave })),
  );
  const desmarcados = desmarcadosViaje + hechos.filter(Boolean).length;
  return ok(c, { desmarcados, sin_tocar: ids.length - desmarcados, ...(rechazados.length ? { rechazados } : {}) });
});

/**
 * Reparte los viajes que llegan por `{ trip_ids }` según cómo se facturan: los de siempre (por viaje) siguen
 * por las funciones de siempre; los por cliente con un único cliente van por ese cliente; el resto se
 * rechaza diciendo por qué. Un viaje que no existe pasa por las de siempre, que ya lo dejan como `sin_tocar`.
 */
async function repartir(db: D1Database, ids: number[]) {
  const viajes = await getTripsFacturables(db, ids);
  const porId = new Map(viajes.map((v) => [v.id, v]));
  const porViaje: number[] = [];
  const deClientes: { trip_id: number; cliente: { clave: string; nombre: string } }[] = [];
  const rechazados: Rechazado[] = [];
  for (const id of ids) {
    const v = porId.get(id);
    if (!v || estrategiaDeFacturacion(v) === "por_viaje") {
      porViaje.push(id);
      continue;
    }
    const unico = clienteUnicoDelViaje(v.segments);
    if (unico.ok) deClientes.push({ trip_id: id, cliente: unico.cliente });
    else rechazados.push({ trip_id: id, cliente_clave: "", motivo: unico.motivo });
  }
  return { porViaje, deClientes, rechazados };
}

/**
 * Las rutas por CLIENTE: cada ítem es un cliente dentro de un viaje, `{ trip_id, cliente_clave }`, y en un
 * mismo pedido pueden ir varios (la oficina marca de una vez los que pagaron juntos). Todo se verifica acá,
 * con las cargas de ahora: ningún ítem se marca por haberlo dicho la pantalla.
 *
 * Contestan `marcados`, `sin_tocar` y, de cada ítem que quedó afuera, el motivo.
 */
async function porClientes(
  c: any,
  items: ItemCliente[],
  opts: {
    /** Verificar que se puede marcar (viaje completado, cliente que existe). Sacar una marca no lo exige. */
    verificar: boolean;
    aplicar: (validos: { trip_id: number; cliente_clave: string; cliente_nombre: string }[]) => Promise<boolean[]>;
    /** Qué decir de un ítem válido que no cambió nada (ya tenía factura, ya figuraba pago…). */
    sinCambio: string;
  },
) {
  const viajes = await getTripsFacturables(c.env.DB, [...new Set(items.map((i) => i.trip_id))]);
  const porId = new Map(viajes.map((v) => [v.id, v]));
  const rechazados: Rechazado[] = [];
  const validos: { trip_id: number; cliente_clave: string; cliente_nombre: string }[] = [];

  for (const i of items) {
    const viaje = porId.get(i.trip_id);
    const motivo = opts.verificar
      ? motivoParaMarcarCliente(viaje, i.cliente_clave)
      : !viaje
        ? "Ese viaje ya no está."
        : estrategiaDeFacturacion(viaje) === "por_viaje"
          ? "Este viaje se factura entero, no por cliente."
          : null;
    if (motivo) {
      rechazados.push({ ...i, motivo });
      continue;
    }
    const nombre =
      clientesDelViaje(viaje!.segments).clientes.find((x) => x.clave === i.cliente_clave)?.nombre ??
      viaje!.clientes_facturacion?.find((x) => x.cliente_clave === i.cliente_clave)?.cliente_nombre ??
      i.cliente_clave;
    validos.push({ ...i, cliente_nombre: nombre });
  }

  const hechos = await opts.aplicar(validos);
  hechos.forEach((ok_, n) => {
    if (!ok_) rechazados.push({ trip_id: validos[n].trip_id, cliente_clave: validos[n].cliente_clave, motivo: opts.sinCambio });
  });
  const hechosN = hechos.filter(Boolean).length;
  return { marcados: hechosN, sin_tocar: items.length - hechosN, rechazados };
}

/** POST /api/facturacion/marcar-clientes  { items: [{ trip_id, cliente_clave }], factura_numero } */
facturacion.post("/marcar-clientes", async (c) => {
  const body = await c.req.json().catch(() => null);
  const items = itemsValidos(body?.items);
  if (!items) return fail(c, "Elegí al menos un cliente para facturar", 400);
  const numero = String(body?.factura_numero ?? "").trim();
  if (!numero) return fail(c, "Escribí el número de la factura", 400);
  if (numero.length > LARGO_MAX_NUMERO) return fail(c, "Ese número de factura es demasiado largo", 400);

  const quien = { userId: c.get("user").id, when: ahora() };
  const r = await porClientes(c, items, {
    verificar: true,
    aplicar: (v) => marcarClientes(c.env.DB, v, numero, quien),
    sinCambio: "Ya tenía factura: no se pisa.",
  });
  return ok(c, { ...r, factura_numero: numero });
});

/** POST /api/facturacion/desmarcar-clientes  { items } — saca la factura (y el pago) de esos clientes. */
facturacion.post("/desmarcar-clientes", async (c) => {
  const body = await c.req.json().catch(() => null);
  const items = itemsValidos(body?.items);
  if (!items) return fail(c, "Elegí al menos un cliente", 400);
  const cuando = ahora();
  const r = await porClientes(c, items, {
    verificar: false,
    aplicar: (v) => desmarcarClientes(c.env.DB, v, cuando),
    sinCambio: "No tenía factura.",
  });
  return ok(c, { desmarcados: r.marcados, sin_tocar: r.sin_tocar, rechazados: r.rechazados });
});

/** POST /api/facturacion/marcar-pagos-clientes  { items } — sólo con factura puesta. */
facturacion.post("/marcar-pagos-clientes", async (c) => {
  const body = await c.req.json().catch(() => null);
  const items = itemsValidos(body?.items);
  if (!items) return fail(c, "Elegí al menos un cliente", 400);
  const quien = { userId: c.get("user").id, when: ahora() };
  const r = await porClientes(c, items, {
    verificar: false,
    aplicar: (v) => marcarPagosClientes(c.env.DB, v, quien),
    sinCambio: "Sólo se marca pago un cliente que ya tiene factura y que todavía no figura pago.",
  });
  if (r.marcados === 0) return fail(c, r.rechazados[0]?.motivo ?? "No se pudo marcar el pago.", 409);
  return ok(c, r);
});

/** POST /api/facturacion/desmarcar-pagos-clientes  { items } — saca el pago y nada más. */
facturacion.post("/desmarcar-pagos-clientes", async (c) => {
  const body = await c.req.json().catch(() => null);
  const items = itemsValidos(body?.items);
  if (!items) return fail(c, "Elegí al menos un cliente", 400);
  const r = await porClientes(c, items, {
    verificar: false,
    aplicar: (v) => desmarcarPagosClientes(c.env.DB, v),
    sinCambio: "No figuraba pago.",
  });
  return ok(c, { desmarcados: r.marcados, sin_tocar: r.sin_tocar, rechazados: r.rechazados });
});

export default facturacion;
