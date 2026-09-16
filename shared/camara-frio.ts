/**
 * La cámara de frío de los camiones que la llevan (GTP 4382 y GTP 4383).
 *
 * "Agregale surtida cámara frío, solo para la boleta del gas oil. Y yo desde la oficina le
 * agrego las horas inicio de mes, final de mes, y ahí me da litros por hora que gasta. Porque
 * el chofer no va a poder registrar las horas." — Rodrigo, 16/9/2026.
 *
 * VA APARTE DE `fuel_logs` A PROPÓSITO. Todo el km/L —el consumo del mes, el rango de
 * surtidas, Control, el acumulado del chofer— lee esa tabla. El gasoil de la cámara no mueve
 * kilómetros: si cayera ahí, el camión aparecería gastando de más sin que nadie supiera por qué.
 */

/** Una carga de gasoil de la cámara: el chofer anota los litros y saca la foto de la boleta. */
export interface SurtidaFrio {
  id: number;
  truck_id: number;
  driver_id: number | null;
  liters: number;
  r2_key_boleta: string | null;
  logged_at: string;
  edited_by?: number | null;
  edited_at?: string | null;
  driver_name?: string | null;
}

/** Las horas del equipo que anota la oficina, una fila por camión y mes ("YYYY-MM"). */
export interface HorasFrio {
  mes: string;
  horas_inicio: number | null;
  horas_fin: number | null;
}

export interface ConsumoFrioMes {
  mes: string;
  litros: number;
  surtidas: number;
  horas_inicio: number | null;
  horas_fin: number | null;
  /** `null` mientras falte una de las dos lecturas, o si no avanzaron. */
  horas: number | null;
  litros_por_hora: number | null;
}

/**
 * Litros por hora de cada mes: todo lo cargado dentro del mes sobre las horas del mes.
 *
 * Es la misma regla de calendario que el consumo del camión (`consumoDelPeriodo`): cada litro
 * cae en el mes en que se compró, que es lo que cierra contra la factura. El precio es el mismo
 * también: el tanque no está lleno justo el día 1, así que un mes suelto queda aproximado y se
 * compensa con el siguiente.
 *
 * Aparecen los meses que tienen surtidas o horas cargadas, el más nuevo primero: un mes con
 * horas y sin surtidas se muestra en 0 litros para que se vea que falta la boleta.
 */
export function consumoFrioPorMes(
  surtidas: Pick<SurtidaFrio, "logged_at" | "liters">[],
  horas: HorasFrio[],
): ConsumoFrioMes[] {
  const litros = new Map<string, { litros: number; surtidas: number }>();
  for (const s of surtidas) {
    const mes = s.logged_at.slice(0, 7);
    const acc = litros.get(mes) ?? { litros: 0, surtidas: 0 };
    litros.set(mes, { litros: acc.litros + s.liters, surtidas: acc.surtidas + 1 });
  }
  const horasPorMes = new Map(horas.map((h) => [h.mes, h]));
  const meses = [...new Set([...litros.keys(), ...horasPorMes.keys()])].sort().reverse();

  return meses.map((mes) => {
    const l = litros.get(mes) ?? { litros: 0, surtidas: 0 };
    const h = horasPorMes.get(mes);
    const inicio = h?.horas_inicio ?? null;
    const fin = h?.horas_fin ?? null;
    const trabajadas = inicio != null && fin != null && fin > inicio ? redondear(fin - inicio) : null;
    return {
      mes,
      litros: redondear(l.litros),
      surtidas: l.surtidas,
      horas_inicio: inicio,
      horas_fin: fin,
      horas: trabajadas,
      litros_por_hora: trabajadas != null && l.litros > 0 ? redondear(l.litros / trabajadas) : null,
    };
  });
}

/**
 * Por qué no se pueden guardar estas horas, o `null` si se puede.
 *
 * Se acepta una sola: la de inicio se anota el primer día y la de fin recién cuando termina
 * el mes.
 */
export function validarHorasFrio(inicio: number | null, fin: number | null): string | null {
  for (const h of [inicio, fin]) {
    if (h != null && (!Number.isFinite(h) || h < 0)) return "Las horas tienen que ser un número positivo";
  }
  if (inicio != null && fin != null && fin < inicio) {
    return "Las horas del final del mes no pueden ser menos que las del inicio";
  }
  return null;
}

function redondear(n: number): number {
  return Math.round(n * 100) / 100;
}
