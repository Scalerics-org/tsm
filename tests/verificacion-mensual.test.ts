import { describe, it, expect } from "vitest";
import { verificarMeses, LITROS_MINIMOS_A_MENCIONAR } from "@shared/verificacion-mensual";
import type { SurtidaParaRango } from "@shared/rango-surtidas";

/**
 * La verificación mensual del gasoil: si los litros del mes alcanzan para los km que hizo.
 *
 * "Puede pasar que ellos no registren nada de una surtida." — Rodrigo, 22/9/2026.
 *
 * Lo que tiene que ser cierto: que una surtida sin registrar salga en criollo y en litros; que un
 * mes normal NO salte (una alarma falsa enseña a no mirar más la pantalla); que los chorros
 * cuenten; y que el mes en curso, los camiones con pocas surtidas y los meses con los km
 * incompletos digan "todavía no" en vez de juzgar.
 */

/** Un camión que rinde 3 km/L: una surtida llena cada 15 días, 1.500 km y 500 L cada una. */
function camion(opciones: { desde?: string; meses?: number } = {}): SurtidaParaRango[] {
  const meses = opciones.meses ?? 7;
  const logs: SurtidaParaRango[] = [];
  let id = 1;
  let km = 100_000;
  for (let i = 0; i < meses; i++) {
    const mes = String(3 + i).padStart(2, "0");
    for (const dia of ["05", "20"]) {
      km += 1500;
      logs.push({ id: id++, odometer_km: km, liters: 500, is_full: true, logged_at: `2026-${mes}-${dia} 12:00:00` });
    }
  }
  return logs;
}

const mes = (v: ReturnType<typeof verificarMeses>, m: string) => v.meses.find((x) => x.month === m)!;

describe("un camión que anda como siempre", () => {
  it("no salta: sus meses cerrados dan 'dentro de lo habitual'", () => {
    const v = verificarMeses(camion());
    expect(v.mediana).toBeCloseTo(3, 5);
    for (const m of ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08"]) {
      expect(mes(v, m).estado).toBe("ok");
    }
  });

  it("el mes en curso no se juzga: le faltan surtidas por definición", () => {
    const v = verificarMeses(camion());
    expect(mes(v, "2026-09").estado).toBe("en_curso");
    expect(mes(v, "2026-09").diferencia).toBeNull();
  });
});

describe("una surtida que nadie registró", () => {
  // Sin la surtida del 20/06 el odómetro de esa surtida tampoco existe: junio queda corto de km y
  // julio arranca desde el 05/06, así que los 1.500 km sin litros aparecen en JULIO. Es lo que pasa
  // de verdad con el corte por calendario, y el mensaje tiene que caer ahí.
  it("aparece en litros, en el mes donde se nota", () => {
    const sin = camion().filter((l) => l.logged_at !== "2026-06-20 12:00:00");
    const v = verificarMeses(sin);
    const julio = mes(v, "2026-07");
    expect(julio.estado).toBe("faltan");
    expect(julio.diferencia).toBe(500);
    expect(julio.litros_esperados).toBe(1500);
    // En criollo y con la acción: cuántos litros y qué hacer.
    expect(julio.titulo).toBe("Le faltan unos 500 L sin registrar");
    expect(julio.mensaje).toContain("Buscá la boleta");
  });

  it("los litros de más también se dicen, con otra pista: surtida duplicada o mal tipeada", () => {
    // El caso del fuel_log 129: 1522,27 L donde seguro eran 152,27.
    const mal = camion().map((l) => (l.logged_at === "2026-06-20 12:00:00" ? { ...l, liters: 1522.27 } : l));
    const junio = mes(verificarMeses(mal), "2026-06");
    expect(junio.estado).toBe("sobran");
    expect(junio.diferencia!).toBeLessThan(0);
    expect(junio.titulo).toMatch(/^Figuran unos .* L de más$/);
    expect(junio.mensaje).toContain("mal tipeados");
  });

  it("un litraje disparatado no rompe la cuenta de los demás meses", () => {
    const mal = camion().map((l) => (l.logged_at === "2026-06-20 12:00:00" ? { ...l, liters: 1522.27 } : l));
    const v = verificarMeses(mal);
    expect(Number.isFinite(v.mediana!)).toBe(true);
    expect(mes(v, "2026-05").estado).toBe("ok");
    expect(mes(v, "2026-08").estado).toBe("ok");
  });
});

describe("los chorros cuentan", () => {
  // Ignorarlos inventa litros faltantes: un chorro carga sin mover el tacógrafo.
  it("un mes con un chorro no da una alarma falsa", () => {
    const logs = camion().flatMap((l) => {
      if (l.logged_at === "2026-06-20 12:00:00") {
        // 200 L de chorro el 10/06, y el llenado del 20/06 ya trae 200 L menos.
        return [
          { id: 900, odometer_km: l.odometer_km - 800, liters: 200, is_full: false, logged_at: "2026-06-10 12:00:00" },
          { ...l, liters: 300 },
        ];
      }
      return [l];
    });
    const junio = mes(verificarMeses(logs), "2026-06");
    expect(junio.estado).toBe("ok");
  });
});

describe("cuando todavía no se puede comparar, lo dice", () => {
  it("con pocos tramos no hay 'lo habitual'", () => {
    const v = verificarMeses(camion({ meses: 2 }));
    expect(v.mediana).toBeNull();
    const cerrado = v.meses.find((m) => m.estado === "sin_datos");
    expect(cerrado?.mensaje).toContain("Todavía no alcanza para comparar");
  });

  it("el primer mes de un camión no se juzga: le faltan los km de antes", () => {
    const v = verificarMeses(camion());
    expect(mes(v, "2026-03").estado).toBe("sin_datos");
  });

  it("sin surtidas no hay nada que decir", () => {
    expect(verificarMeses([])).toEqual({ mediana: null, tramos: 0, meses: [] });
  });
});

describe("una diferencia chica no se nombra", () => {
  it("pasa el umbral en porcentaje pero son pocos litros: dentro de lo habitual", () => {
    // Un mes de poca actividad: 100 km con 20 L donde pedían 33 → 40% de desvío, 13 L.
    const logs = camion();
    const ultimo = logs[logs.length - 1];
    const poco: SurtidaParaRango[] = [
      ...logs,
      { id: 500, odometer_km: ultimo.odometer_km + 100, liters: 20, is_full: true, logged_at: "2026-10-05 12:00:00" },
      { id: 501, odometer_km: ultimo.odometer_km + 200, liters: 20, is_full: true, logged_at: "2026-11-05 12:00:00" },
    ];
    const octubre = mes(verificarMeses(poco), "2026-10");
    expect(Math.abs(octubre.diferencia!)).toBeLessThan(LITROS_MINIMOS_A_MENCIONAR);
    expect(octubre.estado).toBe("ok");
  });
});
