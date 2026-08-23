import { Hono } from "hono";
import type { Env, Vars } from "../env";
import { ok, fail } from "../lib/response";
import { requireAuth, requireRole } from "../middleware/auth";
import {
  ROLES,
  TRIP_STATUS,
  KM_SIN_JUSTIFICAR_ALERTA,
  auditoriaKilometros,
  periodoAnterior,
  senalKilometros,
  type AuthUser,
  type ViajeAuditado,
} from "../../shared/domain";
import { periodoDeHoy } from "../lib/periodo";
import * as repo from "../repos/lecturas";
import { listTrips } from "../repos/trips";
import { currentTruckId } from "../repos/drivers";
import { listTrucks, getTruck } from "../repos/trucks";
import { listTemplates } from "../repos/templates";

/**
 * Lecturas mensuales del tacógrafo y la auditoría de kilómetros que salen de ellas.
 *
 * "Necesito una forma de yo poder verificar y estar tranquilo." Con una foto por camión por
 * mes, la resta entre dos lecturas dice cuánto recorrió el camión de verdad, y contra eso se
 * comparan los viajes que cargaron los choferes.
 */
const lecturas = new Hono<{ Bindings: Env; Variables: Vars }>();
lecturas.use("*", requireAuth);

/**
 * El camión que el chofer tiene ASIGNADO, no el que está manejando hoy.
 *
 * "Tiene que pedir la foto del camión que tiene asignado." Es distinto de la surtida
 * (`routes/fuel.ts`), y a propósito: el gasoil va al camión que de verdad lo cargó, pero la
 * lectura del mes es de la máquina, y cada máquina la trae su chofer. Si fuera la del camión
 * que agarró ese día, el que se cambia de camión un martes deja sin lectura al suyo y le pisa
 * el mes a otro.
 *
 * Sale de la base y no del token: el token dura una semana, así que un chofer reasignado
 * seguiría trayendo la foto del camión anterior hasta que volviera a entrar.
 */
async function camionDelChofer(db: D1Database, user: AuthUser): Promise<number | null> {
  if (user.role !== ROLES.CHOFER || user.driver_id == null) return null;
  return (await currentTruckId(db, user.driver_id)) ?? user.truck_id;
}

function esPeriodo(v: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
}

/**
 * GET /api/lecturas/pendiente — lo que necesita el aviso de la pantalla del chofer.
 *
 * `falta` es lo único que mira el aviso. Un chofer sin camión no tiene tacógrafo que
 * fotografiar, así que para él nunca falta nada y el aviso no aparece.
 */
lecturas.get("/pendiente", async (c) => {
  const user = c.get("user");
  const q = c.req.query();
  const periodo = q.mes && esPeriodo(q.mes) ? q.mes : periodoDeHoy();
  const truckId =
    user.role === ROLES.CHOFER
      ? await camionDelChofer(c.env.DB, user)
      : q.truck
        ? Number(q.truck)
        : null;

  if (!truckId) {
    return ok(c, { periodo, truck_id: null, truck_plate: null, lectura: null, falta: false, km_anterior: null, exige_foto: !!c.env.FOTOS });
  }

  const [lectura, previa, camion] = await Promise.all([
    repo.getLectura(c.env.DB, truckId, periodo),
    repo.getLectura(c.env.DB, truckId, periodoAnterior(periodo)),
    getTruck(c.env.DB, truckId),
  ]);

  return ok(c, {
    periodo,
    truck_id: truckId,
    truck_plate: camion?.plate ?? null,
    lectura,
    falta: lectura == null,
    // Para avisarle en el momento si tipeó un número menor al del mes pasado, en vez de
    // dejarlo entrar y descuadrar dos meses.
    km_anterior: previa?.kilometraje ?? null,
    exige_foto: !!c.env.FOTOS,
  });
});

/** POST /api/lecturas — el chofer sube la foto del tacógrafo y el kilometraje del mes. */
lecturas.post("/", async (c) => {
  const user = c.get("user");
  const form = await c.req.formData().catch(() => null);
  if (!form) return fail(c, "Se esperaba multipart/form-data", 400);

  const truckId =
    user.role === ROLES.CHOFER
      ? await camionDelChofer(c.env.DB, user)
      : form.get("truck_id")
        ? Number(form.get("truck_id"))
        : null;
  if (!truckId) return fail(c, "Falta el camión", 400);

  const pedido = String(form.get("periodo") ?? "");
  const periodo = esPeriodo(pedido) ? pedido : periodoDeHoy();
  const kilometraje = Number(form.get("kilometraje"));
  if (!Number.isFinite(kilometraje) || kilometraje <= 0) {
    return fail(c, "Poné el kilometraje que marca el tacógrafo", 400);
  }

  // Una sola por mes. Si se pudiera pisar, la resta del mes pasaría a depender de cuál
  // lectura agarra la consulta — y la corrección de un número tipeado mal es de oficina.
  if (await repo.getLectura(c.env.DB, truckId, periodo)) {
    return fail(c, "La lectura de este mes ya está cargada. Si el número quedó mal, avisá a la oficina.", 409);
  }

  const previa = await repo.getLectura(c.env.DB, truckId, periodoAnterior(periodo));
  if (previa && kilometraje < previa.kilometraje) {
    const antes = Math.round(previa.kilometraje).toLocaleString("es-UY");
    return fail(c, `El tacógrafo no puede marcar menos que el mes pasado (${antes} km). Mirá bien el número.`, 400);
  }

  // La foto es la evidencia, pero sólo se puede exigir si hay dónde guardarla: R2 puede no
  // estar bindeado. Sin bucket se guarda el número igual — perder la lectura del mes entero
  // sería peor que quedarse sin la foto.
  const archivo = form.get("file");
  const foto = archivo && typeof archivo !== "string" ? (archivo as unknown as File) : null;
  if (c.env.FOTOS && !foto) {
    return fail(c, "Sacá la foto del tacógrafo: sin la foto el número no sirve para verificar nada", 400);
  }

  let r2Key: string | null = null;
  if (c.env.FOTOS && foto) {
    const ext = (foto.type.split("/")[1] || "jpg").replace("jpeg", "jpg");
    // Una por camión y por mes, igual que la fila: la clave lo dice sola.
    r2Key = `odometro/${truckId}/${periodo}.${ext}`;
    await c.env.FOTOS.put(r2Key, await foto.arrayBuffer(), {
      httpMetadata: { contentType: foto.type || "image/jpeg" },
    });
  }

  const id = await repo.createLectura(c.env.DB, {
    truck_id: truckId,
    periodo,
    kilometraje,
    r2_key: r2Key,
    driver_id: user.driver_id,
  });
  return ok(c, { id, periodo, r2_key: r2Key }, 201);
});

/**
 * GET /api/lecturas/auditoria?mes=YYYY-MM — la auditoría de kilómetros de todos los camiones.
 *
 * Es lo que el cliente mira para dejar de perseguir fotos por WhatsApp: cuánto recorrió el
 * camión según el tacógrafo, cuánto explican los viajes cargados, y qué queda sin justificar.
 *
 * OJO con `vacio`: sale de `trip_templates.viaje_vacio`, que hoy está en 0 en las 19
 * plantillas — incluidas las dos de Efe Roig que se LLAMAN "vacío" pero llevan envases, y
 * por eso no están marcadas (ver 0027_efe_roig.sql). Mientras siga así, `km_vacios` va a dar
 * 0 siempre. La marca vive en la plantilla y no acá justamente para que arreglarlo sea
 * prender un checkbox en la oficina y no tocar esta cuenta.
 */
lecturas.get("/auditoria", requireRole(ROLES.ENCARGADO, ROLES.ADMIN), async (c) => {
  const pedido = c.req.query("mes") ?? "";
  const mes = pedido ? pedido : periodoDeHoy();
  if (!esPeriodo(mes)) return fail(c, "El mes va como 2026-01", 400);
  const previo = periodoAnterior(mes);

  const [camiones, delMes, delPrevio, viajes, plantillas] = await Promise.all([
    listTrucks(c.env.DB),
    repo.listLecturas(c.env.DB, { periodo: mes }),
    repo.listLecturas(c.env.DB, { periodo: previo }),
    // `-31` como tope alcanza: la comparación es de texto y "2026-03-01" ya es mayor.
    listTrips(c.env.DB, { from: `${mes}-01`, to: `${mes}-31` }),
    listTemplates(c.env.DB),
  ]);

  // Un viaje cancelado no recorrió nada que haya que justificar.
  const delPeriodo = viajes.filter((t) => t.status !== TRIP_STATUS.CANCELADO);
  const plantillasVacias = new Set(plantillas.filter((p) => p.viaje_vacio).map((p) => p.id));

  return ok(c, {
    mes,
    periodo_previo: previo,
    camiones: camiones.map((camion) => {
      const lectura = delMes.find((l) => l.truck_id === camion.id) ?? null;
      const previa = delPrevio.find((l) => l.truck_id === camion.id) ?? null;
      const suyos: ViajeAuditado[] = delPeriodo
        .filter((t) => t.truck_id === camion.id)
        .map((t) => ({
          kilometros: t.kilometros,
          vacio: t.template_id != null && plantillasVacias.has(t.template_id),
        }));
      const auditoria = auditoriaKilometros(mes, lectura, previa, suyos);
      return {
        truck_id: camion.id,
        plate: camion.plate,
        lectura,
        lectura_previa: previa,
        auditoria,
        // "Si un camión se pasa de 100-200 km, que le avise a Rodrigo en Control." La
        // pantalla no vuelve a decidir cuándo algo amerita mirarse: se lo decimos acá, con
        // el mismo criterio para todos.
        senal: senalKilometros(auditoria),
      };
    }),
    umbral_km: KM_SIN_JUSTIFICAR_ALERTA,
  });
});

/**
 * PUT /api/lecturas/:id — la oficina corrige el kilometraje.
 *
 * "Al igual gas oil desde oficina, corregir litros y km", mismo caso: un dígito de más deja
 * el mes y el siguiente descuadrados, y el chofer no puede recargarla porque hay una sola por
 * mes. La foto no se toca: es la evidencia contra la que se compara el número corregido.
 */
lecturas.put("/:id", requireRole(ROLES.ENCARGADO, ROLES.ADMIN), async (c) => {
  const id = Number(c.req.param("id"));
  if (!(await repo.getLecturaPorId(c.env.DB, id))) return fail(c, "Lectura no encontrada", 404);

  const b = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
  const kilometraje = Number(b?.kilometraje);
  if (!Number.isFinite(kilometraje) || kilometraje <= 0) {
    return fail(c, "El kilometraje tiene que ser un número mayor que cero", 400);
  }

  await repo.updateKilometraje(c.env.DB, id, kilometraje, {
    userId: c.get("user").id,
    when: new Date().toISOString().replace("T", " ").slice(0, 19),
  });
  return ok(c, await repo.getLecturaPorId(c.env.DB, id));
});

export default lecturas;
