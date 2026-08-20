import type { Env } from "../env";
import type { AvisoViaje } from "../../shared/domain";
import * as pushRepo from "../repos/push";
import { enviarPush } from "./webpush";

/**
 * Manda un aviso a los celulares de la oficina.
 *
 * Va a todos los que hayan activado las notificaciones, no a un número fijo: hoy es Rodrigo,
 * mañana puede sumarse Diego o Rosario sin tocar nada.
 *
 * No lanza excepciones ni le importa fallar: lo que se está avisando ya pasó y ya se guardó.
 * Un push que no sale no puede voltear un viaje cerrado ni una surtida registrada.
 *
 * Vive acá y no en cada ruta porque las dos cosas que se avisan —el viaje cerrado y la
 * surtida— necesitan exactamente lo mismo: las claves VAPID, la lista de suscripciones y la
 * limpieza de las que ya murieron.
 */
export async function notificarOficina(env: Env, aviso: AvisoViaje): Promise<void> {
  const { VAPID_PUBLIC: publica, VAPID_PRIVATE: privada, VAPID_SUBJECT: subject } = env;
  if (!publica || !privada) return;

  const suscripciones = await pushRepo.suscripcionesDeOficina(env.DB);
  if (!suscripciones.length) return;

  const vapid = { publica, privada, subject: subject || "mailto:contacto@scalerics.com" };
  const resultados = await Promise.all(suscripciones.map((s) => enviarPush(s, aviso, vapid)));

  // Las que el servidor de push da por muertas se sacan: si no, cada viaje que se cierre
  // vuelve a intentar contra un celular que ya no está.
  await Promise.all(
    resultados.map((r, i) =>
      r.vencida ? pushRepo.borrarSuscripcion(env.DB, suscripciones[i].endpoint) : null,
    ),
  );
}
