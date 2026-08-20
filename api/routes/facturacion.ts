import { Hono } from "hono";
import type { Env, Vars } from "../env";
import { ok, fail } from "../lib/response";
import { requireAuth, requireRole } from "../middleware/auth";
import { ROLES } from "../../shared/domain";
import { listTripsFacturables, marcarFacturados, desmarcarFacturados } from "../repos/trips";
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

  const [trips, templates] = await Promise.all([
    listTripsFacturables(c.env.DB, { provider, from: q.from, to: q.to }),
    listTemplates(c.env.DB),
  ]);

  return ok(c, {
    provider,
    desde: q.from ?? null,
    hasta: q.to ?? null,
    ...resumenCliente(
      trips,
      templates.filter((t) => t.provider_name === provider),
      { porDestino: q.porDestino === "1", incluirFacturados: q.incluirFacturados === "1" },
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
  const marcados = await marcarFacturados(c.env.DB, ids, numero, {
    userId: user.id,
    when: new Date().toISOString().replace("T", " ").slice(0, 19),
  });

  return ok(c, { marcados, sin_tocar: ids.length - marcados, factura_numero: numero });
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

  const desmarcados = await desmarcarFacturados(c.env.DB, ids);
  return ok(c, { desmarcados, sin_tocar: ids.length - desmarcados });
});

export default facturacion;
