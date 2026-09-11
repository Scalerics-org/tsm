import { requiereFotoCarga } from "../../shared/domain";

/**
 * Qué foto le falta a un viaje cerrado — contando sólo las que se le tenían que pedir.
 *
 * La alerta de "Viajes sin foto" y la ficha del chofer marcaban TODO viaje completado sin foto
 * de carga. Ignoraban tres cosas que el resto de la app sí respeta:
 *   - la plantilla puede no pedir foto de carga, o ser un viaje vacío (`requiereFotoCarga`, la
 *     misma regla que exige la foto al cerrar);
 *   - el viaje cargado desde oficina pasó sin la app, así que nace sin fotos a propósito;
 *   - sin R2 no se guardan fotos, y la regla del proyecto es que la exigencia depende de que
 *     exista.
 * Al 11/9 la alerta marcaba 0 viajes, pero cada viaje cargado por "+ Cargar viaje" iba a
 * quedar marcado para siempre, y a contar como "sin foto" en la ficha del chofer.
 */

export interface EstadoFotosViaje {
  has_carga: number;
  has_descarga: number;
  arrival_photo_label: string | null;
  viaje_vacio: number | null;
  foto_carga_requerida: number | null;
  cargado_por_oficina: number | null;
}

/** Si al viaje le falta una foto de carga que SÍ se le tenía que pedir. */
export function leFaltaCarga(p: EstadoFotosViaje, conR2: boolean): boolean {
  if (!conR2 || p.cargado_por_oficina) return false;
  // Sin plantilla (viaje viejo) vale la regla general: se pide.
  const tpl =
    p.viaje_vacio == null && p.foto_carga_requerida == null
      ? null
      : { viaje_vacio: !!p.viaje_vacio, foto_carga_requerida: !!p.foto_carga_requerida };
  return requiereFotoCarga(tpl) && p.has_carga === 0;
}

/** El texto de la alerta: qué falta, o `null` si no le falta nada que se le tuviera que pedir. */
export function fotoQueFalta(p: EstadoFotosViaje, conR2: boolean): string | null {
  if (!conR2 || p.cargado_por_oficina) return null;
  const carga = leFaltaCarga(p, conR2);
  const descarga = p.arrival_photo_label != null && p.has_descarga === 0;
  if (carga && descarga) return "carga y descarga";
  if (carga) return "carga";
  if (descarga) return p.arrival_photo_label ?? "descarga";
  return null;
}
