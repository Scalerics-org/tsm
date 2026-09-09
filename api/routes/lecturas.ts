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
import { kmEstimados } from "../../shared/distancias";
import { periodoDeHoy } from "../lib/periodo";
import { vaciosEntreViajes } from "../../shared/vacios";
import { claveMovida, esPeriodo, moverLectura } from "../lib/lectura-periodo";
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

  // El mes lo elige SÓLO la oficina, para cargar una lectura atrasada. Si el chofer pudiera
  // mandarlo, podría anotar la foto de hoy contra cualquier mes —incluido uno ya auditado— y
  // la resta de ese mes pasaría a depender de un campo del formulario.
  const pedido = String(form.get("periodo") ?? "");
  const puedeElegirMes = user.role === ROLES.ENCARGADO || user.role === ROLES.ADMIN;
  if (pedido && !puedeElegirMes) return fail(c, "No podés elegir el mes de la lectura", 403);
  const periodo = puedeElegirMes && esPeriodo(pedido) ? pedido : periodoDeHoy();
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
    return fail(
      c,
      `El tacógrafo no puede marcar menos que el mes pasado (${antes} km). Mirá bien el número, y si está bien avisá a la oficina: el del mes pasado puede estar mal cargado.`,
      400,
    );
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
 * GET /api/lecturas?truck=1 — las lecturas de un camión, para la ficha.
 *
 * Es lo que le faltaba a la oficina para poder corregir un kilometraje mal tipeado. Hasta
 * ahora `PUT /:id` existía y no lo llamaba ninguna pantalla: el chofer recibía "avisá a la
 * oficina" y la oficina no tenía dónde hacerlo.
 */
lecturas.get("/", requireRole(ROLES.ENCARGADO, ROLES.ADMIN), async (c) => {
  const truck = c.req.query("truck");
  return ok(c, await repo.listLecturas(c.env.DB, { truckId: truck ? Number(truck) : undefined }));
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
    // Se piden DOS meses de viajes, no uno. La ventana que se compara no es el mes
    // calendario sino la que va de una foto del tacógrafo a la otra, y esas fotos se sacan
    // cuando el camión para: la del mes pasado puede ser del 18 y la de éste del 4. Se
    // recorta por camión más abajo, que cada uno tiene su propia ventana.
    listTrips(c.env.DB, { from: `${previo}-01`, to: `${mes}-31` }),
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
      // LA VENTANA REAL: de una foto a la otra. Comparar los km entre dos fotos contra los
      // viajes del mes calendario era comparar cosas distintas — las fotos nunca se sacan el
      // 1° a las 00:00, así que siempre sobraban o faltaban días, y para un camión de ruta
      // eso son miles de kilómetros contra un umbral de 150. La alerta habría marcado a
      // todos los camiones todos los meses hasta que nadie la mirara.
      //
      // Sin las dos fotos no hay ventana que recortar y tampoco hay con qué comparar: la
      // auditoría va a devolver "falta la lectura", así que alcanza con el mes calendario
      // para mostrar cuántos viajes hubo.
      const desde = previa?.tomada_at ?? `${mes}-01`;
      const hasta = lectura?.tomada_at ?? `${mes}-31 23:59:59`;
      const crudos = delPeriodo.filter(
        (t) => t.truck_id === camion.id && t.started_at >= desde && t.started_at <= hasta,
      );

      // Los vacíos salen de la seguidilla de viajes, no de que alguien los registre: las
      // plantillas de viaje vacío existen hace un mes y NUNCA se usaron. Entre dónde descargó
      // y dónde volvió a cargar está el tramo, y ese dato ya está cargado.
      const tramos = vaciosEntreViajes(
        crudos.map((t) => ({
          id: t.id,
          started_at: t.started_at,
          origin: t.origin,
          destination: t.destination,
          kilometros: Number.isFinite(t.kilometros as number) ? (t.kilometros as number) : null,
        })),
      );

      const suyos: ViajeAuditado[] = crudos
        .map((t) => {
          // Los km que nadie cargó los estima la app con el origen y el destino, igual que al
          // cerrar el viaje. Contarlos como 0 hacía que cada viaje registrado empeorara el
          // número del camión: cuanto mejor se usaba la app, peor pintaba.
          const propios = Number.isFinite(t.kilometros as number) ? (t.kilometros as number) : null;
          const estimados = propios == null ? kmEstimados(t.origin, t.destination) : null;
          return {
            kilometros: propios ?? estimados,
            estimado: propios == null && estimados != null,
            vacio: t.template_id != null && plantillasVacias.has(t.template_id),
          };
        });
      const auditoria = auditoriaKilometros(mes, lectura, previa, suyos, tramos);
      return {
        truck_id: camion.id,
        plate: camion.plate,
        lectura,
        lectura_previa: previa,
        auditoria,
        // Los tramos en detalle, para poder mostrarlos y no sólo el total: "Bella Unión →
        // Artigas, 137 km" dice mucho más que "841 km vacíos".
        tramos,
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
 * PUT /api/lecturas/:id — la oficina corrige el kilometraje y/o el mes.
 *
 * "Al igual gas oil desde oficina, corregir litros y km", mismo caso: un dígito de más deja
 * el mes y el siguiente descuadrados, y el chofer no puede recargarla porque hay una sola por
 * mes. La foto no se toca: es la evidencia contra la que se compara el número corregido.
 *
 * "Tiene que poder corregir la fecha del tacógrafo del mes." El mes también se corrige, y es
 * lo más delicado de los dos: la foto que cierra agosto se saca casi siempre en los primeros
 * días de setiembre, y anotada contra setiembre corre la cuenta de los dos meses. Se valida
 * contra los vecinos en `moverLectura` antes de escribir, porque mover una lectura a un mes
 * donde el odómetro iría para atrás rompe la auditoría en silencio.
 */
lecturas.put("/:id", requireRole(ROLES.ENCARGADO, ROLES.ADMIN), async (c) => {
  const id = Number(c.req.param("id"));
  const actual = await repo.getLecturaPorId(c.env.DB, id);
  if (!actual) return fail(c, "Lectura no encontrada", 404);

  const b = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
  const kilometraje = Number(b?.kilometraje);
  if (!Number.isFinite(kilometraje) || kilometraje <= 0) {
    return fail(c, "El kilometraje tiene que ser un número mayor que cero", 400);
  }

  // El mes es opcional: sin él, esto sigue siendo la corrección de kilometraje de siempre.
  const pedido = b?.periodo == null ? null : String(b.periodo);
  let periodo: string | undefined;
  if (pedido != null && pedido !== actual.periodo) {
    const todas = await repo.listLecturas(c.env.DB, { truckId: actual.truck_id });
    // Se valida con el kilometraje NUEVO: si se corrigen los dos a la vez, lo que tiene que
    // encajar entre los vecinos es el número que va a quedar, no el que estaba.
    const mov = moverLectura(
      { id, periodo: actual.periodo, kilometraje },
      pedido,
      todas.map((l) => ({ id: l.id, periodo: l.periodo, kilometraje: l.kilometraje })),
    );
    if (!mov.ok) return fail(c, mov.motivo, mov.status);
    periodo = pedido;
  }

  // La foto se muda con la lectura. La clave de R2 lleva el mes adentro
  // (`odometro/{camion}/{periodo}.jpg`), así que dejarla en el mes viejo hace que la próxima
  // lectura de ESE mes escriba en la misma clave y la pise: la movida terminaría mostrando la
  // foto de otra, sin que nada avise. Y es la evidencia contra la que se contrasta el
  // kilometraje corregido.
  //
  // Se copia y se borra la vieja, que es lo más cerca de un rename que da R2. Si la copia
  // falla, la clave NO se actualiza: la fila sigue apuntando a la foto que existe, que es el
  // estado menos malo. Y el mes igual se corrige, porque es lo que se vino a hacer.
  let r2_key: string | undefined;
  if (periodo && c.env.FOTOS) {
    const nueva = claveMovida(actual.r2_key, periodo);
    if (nueva && nueva !== actual.r2_key) {
      try {
        const obj = await c.env.FOTOS.get(actual.r2_key as string);
        if (obj) {
          await c.env.FOTOS.put(nueva, obj.body, { httpMetadata: obj.httpMetadata });
          await c.env.FOTOS.delete(actual.r2_key as string);
          r2_key = nueva;
        }
      } catch {
        // Se sigue sin tocar la clave: mover el mes vale más que la mudanza de la foto.
      }
    }
  }

  await repo.updateLectura(c.env.DB, id, { kilometraje, periodo, r2_key }, {
    userId: c.get("user").id,
    when: new Date().toISOString().replace("T", " ").slice(0, 19),
  });
  return ok(c, await repo.getLecturaPorId(c.env.DB, id));
});

export default lecturas;
