import { consumoDelPeriodo, monthlyConsumption, type FuelLog } from "../../shared/domain";

/**
 * El consumo de UN camión tal como lo muestran los reportes: el del período y el de cada mes.
 *
 * Lo comparten el Resumen (`/reports/summary`) y la pantalla de Consumo (`/reports/consumo`).
 * Es una sola función a propósito: el cliente ya vio dos números distintos para el mismo camión
 * cuando la cuenta estaba escrita dos veces (ver `consumoDelPeriodo`).
 *
 * Recibe TODAS las surtidas del camión y no las del período: la línea de base sale de ANTES
 * del rango, y recortando primero el arranque quedaba sin contra qué medirse.
 */

const MESES_A_MOSTRAR = 6;

function redondear(n: number, decimales: number): number {
  const f = 10 ** decimales;
  return Math.round(n * f) / f;
}

export interface ConsumoDelPeriodo {
  km: number;
  liters: number;
  consumption_kml: number | null;
}

export interface ConsumoDelMes {
  month: string;
  km: number;
  liters: number;
  kml: number | null;
  closed: boolean;
}

export function consumoDelCamion(surtidas: FuelLog[], desde?: string, hasta?: string): ConsumoDelPeriodo {
  const c = consumoDelPeriodo(surtidas, desde ?? "0000-01-01", hasta ?? "9999-12-31");
  return {
    km: Math.round(c.km),
    liters: Math.round(c.liters),
    consumption_kml: c.kml != null ? redondear(c.kml, 2) : null,
  };
}

export function consumoMensualDelCamion(surtidas: FuelLog[]): ConsumoDelMes[] {
  return monthlyConsumption(
    surtidas.map((f) => ({
      odometer_km: f.odometer_km,
      liters: f.liters,
      is_full: !!f.is_full,
      logged_at: f.logged_at,
    })),
  )
    .slice(0, MESES_A_MOSTRAR)
    .map((m) => ({
      month: m.month,
      km: Math.round(m.km),
      liters: Math.round(m.liters),
      kml: m.kml != null ? redondear(m.kml, 2) : null,
      closed: m.closed,
    }));
}
