import { TRIP_STATUS } from "./domain";
import { kmDirectoDelViaje, kmEstimadosDelViaje } from "./vacios";

/**
 * Recalcular los km de los viajes que la app ESTIMÓ con la regla vieja (de punta a punta), ahora que
 * `kmEstimadosDelViaje` suma todas las paradas.
 *
 * Los km se estiman UNA vez, al cerrar el viaje, y se guardan: desplegar la regla nueva no mueve ninguno
 * de los ya cerrados. Rodrigo pidió recalcular setiembre ("me gustaría recalcular septiembre"), y esto es
 * la cuenta de ese recálculo. No escribe nada: arma el plan (antes/después por viaje, y quién queda sin
 * tocar y por qué); quien lo corre revisa el CSV y aplica el .sql con respaldo.
 *
 * NO HAY UNA MARCA "ESTE KM FUE ESTIMADO" EN LA BASE: `trips.kilometros` es una sola columna, la llena el
 * chofer, la oficina o la app. Se reconoce un km estimado porque coincide con lo que la regla VIEJA habría
 * estimado con el mismo origen, destino y cargas. Un número tipeado a mano casi nunca coincide, y si lo hace
 * da igual: es el mismo número. Se deja afuera, además, lo que alguien puso a propósito: las plantillas que piden
 * los km. Los viajes que la oficina tocó SÍ entran si el km coincide con la estimación (en la copia local, 7 de 26
 * viajes de setiembre estaban en ese caso con un 627 de libro): el CSV los marca para que se vean.
 */

export interface ViajeParaRecalcular {
  id: number;
  started_at: string;
  patente: string | null;
  status: string;
  origin: string;
  destination: string;
  kilometros: number | null;
  segments: { origen?: string | null; destino?: string | null }[];
  descargas: { departamento?: string | null }[] | null;
  /** La plantilla pide los km al chofer: el número es suyo, no de la app. */
  pide_kilometros: boolean;
  /** La oficina corrigió el viaje: pudo haber tocado los km. */
  edited_by: number | null;
}

export type MotivoNoTocado =
  | "no_completado"
  | "pide_kilometros"
  | "sin_km"
  | "km_cargado_a_mano"
  | "sin_cambio";

export interface CambioDeKm {
  id: number;
  fecha: string;
  patente: string | null;
  recorrido: string;
  antes: number;
  despues: number;
  diferencia: number;
  /** La oficina corrigió este viaje alguna vez: el CSV lo marca para que se mire antes de aplicar. */
  editado_por_oficina: boolean;
}

export interface NoTocado {
  id: number;
  fecha: string;
  patente: string | null;
  kilometros: number | null;
  motivo: MotivoNoTocado;
}

export interface PlanDeRecalculo {
  cambios: CambioDeKm[];
  noTocados: NoTocado[];
}

export function planDeRecalculo(viajes: ViajeParaRecalcular[]): PlanDeRecalculo {
  const cambios: CambioDeKm[] = [];
  const noTocados: NoTocado[] = [];

  for (const v of viajes) {
    const base = { id: v.id, fecha: v.started_at.slice(0, 10), patente: v.patente, kilometros: v.kilometros };
    const dejar = (motivo: MotivoNoTocado) => noTocados.push({ ...base, motivo });

    if (v.status !== TRIP_STATUS.COMPLETADO) { dejar("no_completado"); continue; }
    if (v.pide_kilometros) { dejar("pide_kilometros"); continue; }
    // Sin km no hay nada que corregir: la auditoría de Control lo estima al vuelo con la regla nueva.
    if (v.kilometros == null) { dejar("sin_km"); continue; }

    // ¿Es lo que habría estimado la regla vieja? Si no, lo cargó una persona.
    if (kmDirectoDelViaje(v) !== v.kilometros) { dejar("km_cargado_a_mano"); continue; }

    const despues = kmEstimadosDelViaje(v);
    if (despues == null || despues === v.kilometros) { dejar("sin_cambio"); continue; }

    cambios.push({
      id: v.id,
      fecha: base.fecha,
      patente: v.patente,
      recorrido: recorridoPlano(v),
      antes: v.kilometros,
      despues,
      diferencia: despues - v.kilometros,
      editado_por_oficina: v.edited_by != null,
    });
  }
  return { cambios, noTocados };
}

function recorridoPlano(v: ViajeParaRecalcular): string {
  const paradas = [v.origin, ...(v.segments ?? []).map((s) => s.origen), ...(v.descargas ?? []).map((d) => d.departamento)];
  return paradas.filter((p): p is string => !!p?.trim()).join(" > ");
}

const celda = (x: string | number | null) => {
  const t = x == null ? "" : String(x);
  return /[",;\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};

/** El antes/después por viaje, para mirarlo en una planilla. Los que no se tocan van abajo, con el motivo. */
export function csvDelPlan(plan: PlanDeRecalculo): string {
  const lineas = [
    ["id", "fecha", "camion", "recorrido", "km_antes", "km_despues", "diferencia", "motivo", "editado_por_oficina"].join(","),
    ...plan.cambios.map((c) =>
      [c.id, c.fecha, c.patente, c.recorrido, c.antes, c.despues, c.diferencia, "recalculado", c.editado_por_oficina ? "si" : "no"].map(celda).join(","),
    ),
    ...plan.noTocados.map((n) => [n.id, n.fecha, n.patente, "", n.kilometros, "", "", n.motivo, ""].map(celda).join(",")),
  ];
  return lineas.join("\n") + "\n";
}

/**
 * Los UPDATE, uno por viaje. Cada uno exige que el km siga siendo el de antes: si alguien lo cambió entre que se
 * armó el plan y se aplicó, no lo pisa. NO se ejecutan acá: los aplica quien corre el script, con respaldo.
 */
export function sqlDelPlan(plan: PlanDeRecalculo): string {
  const num = (n: number) => String(Number(n));
  return (
    [
      "-- Recálculo de km estimados. Revisar el CSV y hacer respaldo ANTES de aplicar.",
      "-- Cada sentencia sólo pisa el km si sigue valiendo lo que valía al armar el plan.",
      ...plan.cambios.map(
        (c) => `UPDATE trips SET kilometros = ${num(c.despues)} WHERE id = ${num(c.id)} AND kilometros = ${num(c.antes)};`,
      ),
    ].join("\n") + "\n"
  );
}
