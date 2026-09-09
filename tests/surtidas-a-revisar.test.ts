import { describe, it, expect } from "vitest";
import type { FuelLog } from "@shared/domain";
import { surtidasARevisar } from "../api/lib/surtidas-a-revisar";

/**
 * El cruce entre las dos cosas que pidió Rodrigo: el aviso dice cuál boleta abrir, el tilde
 * dice que ya la abrió. Sin este cruce, la surtida del GTP 4413 del 31/08 le aparecería en
 * Control todos los días para siempre, y un aviso que no se puede apagar deja de mirarse.
 */

function log(id: number, odometer_km: number, liters: number, dia: string, extra: Partial<FuelLog> = {}) {
  return {
    id, truck_id: 1, driver_id: 1, trip_id: null, odometer_km, liters,
    liters_tanque1: null, liters_tanque2: null, is_full: 1,
    r2_key: null, r2_key_boleta: null, logged_at: `${dia} 08:00:00`,
    verificado_by: null, verificado_at: null,
    ...extra,
  } as unknown as FuelLog;
}

/** Seis tramos parejos a 2,80 km/L y uno con 60 litros de menos declarados. */
function flota(): FuelLog[] {
  const logs = [log(1, 100_000, 250, "2026-08-01")];
  for (let i = 1; i <= 6; i++) logs.push(log(i + 1, 100_000 + 700 * i, 250, `2026-08-0${i + 1}`));
  logs[logs.length - 1] = log(7, 100_000 + 700 * 6, 190, "2026-08-07");
  return logs;
}

describe("qué le queda por revisar a la oficina", () => {
  it("marca la surtida que no cierra mientras nadie la haya mirado", () => {
    const r = surtidasARevisar(flota());
    expect(r.nivel).toBe("revisar");
    expect(r.sospechosas.map((s) => s.id)).toEqual([7]);
  });

  it("una vez tildada, sale de la lista y el camión vuelve a ok", () => {
    const logs = flota();
    logs[logs.length - 1] = log(7, 100_000 + 700 * 6, 190, "2026-08-07", {
      verificado_by: 2,
      verificado_at: "2026-09-09 18:00:00",
    });
    const r = surtidasARevisar(logs);
    expect(r.sospechosas).toEqual([]);
    expect(r.nivel).toBe("ok");
  });

  it("pero la verificada SIGUE contando para la línea de base", () => {
    /**
     * Si tildar una surtida la sacara también del cálculo, la mediana se correría con cada
     * tilde y el aviso se iría moviendo solo: verificar dejaría de ser "ya la miré" y pasaría
     * a cambiar el criterio con el que se miran las demás.
     */
    const logs = flota();
    const sinTildar = surtidasARevisar(logs).mediana;
    logs[3] = log(4, logs[3].odometer_km, logs[3].liters, "2026-08-04", {
      verificado_by: 2,
      verificado_at: "2026-09-09 18:00:00",
    });
    expect(surtidasARevisar(logs).mediana).toBe(sinTildar);
    expect(surtidasARevisar(logs).tramos).toBe(6);
  });

  it("un camión sin surtidas no rompe ni inventa avisos", () => {
    const r = surtidasARevisar([]);
    expect(r.nivel).toBe("sin_datos");
    expect(r.sospechosas).toEqual([]);
  });
});
