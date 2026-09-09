import { describe, it, expect } from "vitest";
import {
  DESVIO_SURTIDA,
  TRAMOS_MINIMOS,
  rangoDeSurtidas,
  tramosDeConsumo,
  type SurtidaParaRango,
} from "@shared/rango-surtidas";

/**
 * El aviso de surtida fuera de rango.
 *
 * Rodrigo dijo que va a chequear "todos los litros, sí o sí, con la factura". Hoy son 70
 * surtidas; con los choferes cargando van a ser cientos por mes, y un control que exige
 * revisar el 100% se abandona solo. Esto le dice CUÁLES mirar.
 *
 * Cada camión se compara contra sí mismo: el rango natural de un camión no es el de otro
 * —en producción el GTP 4382 anda en 3,22 km/L y el GTP 4325 en 2,74— así que un umbral
 * único marcaría siempre al mismo camión y nunca al que declara mal.
 */

/** Una cadena pareja: 700 km con 250 L, siete veces. Sirve de fondo para meterle una rara. */
function paraja(n: number, desde = 100_000): SurtidaParaRango[] {
  const logs: SurtidaParaRango[] = [
    { id: 1, odometer_km: desde, liters: 250, is_full: true, logged_at: "2026-08-01 08:00:00" },
  ];
  for (let i = 1; i <= n; i++) {
    logs.push({
      id: i + 1,
      odometer_km: desde + 700 * i,
      liters: 250,
      is_full: true,
      logged_at: `2026-08-${String(i + 1).padStart(2, "0")} 08:00:00`,
    });
  }
  return logs;
}

describe("los tramos", () => {
  it("van de llenado a llenado, igual que el consumo que ve el chofer", () => {
    const t = tramosDeConsumo(paraja(3));
    expect(t.map((x) => x.km)).toEqual([700, 700, 700]);
    expect(t.map((x) => x.kml)).toEqual([2.8, 2.8, 2.8]);
    // El primer llenado es la línea de base y no abre tramo: son 4 surtidas y 3 tramos.
    expect(t).toHaveLength(3);
  });

  it("un chorro no abre tramo propio: sus litros van al tramo que se cierra después", () => {
    const logs = paraja(1);
    logs.splice(1, 0, {
      id: 99, odometer_km: 100_300, liters: 100, is_full: false, logged_at: "2026-08-01 15:00:00",
    });
    const t = tramosDeConsumo(logs);
    expect(t).toHaveLength(1);
    expect(t[0].km).toBe(700);
    // 100 del chorro + 250 del llenado. Contar sólo el llenado daría 2,8 y el camión
    // aparecería rindiendo mejor de lo que rinde.
    expect(t[0].litros).toBe(350);
  });

  it("un cambio de escala del odómetro no inventa un tramo gigante", () => {
    // El caso real del GTP 4325: seis surtidas de prueba en 393.000 conviviendo con las
    // reales en 140.000. Restar entre las dos escalas da un tramo absurdo.
    const logs: SurtidaParaRango[] = [
      { id: 1, odometer_km: 393_051, liters: 250, is_full: true, logged_at: "2026-08-01 08:00:00" },
      { id: 2, odometer_km: 393_800, liters: 250, is_full: true, logged_at: "2026-08-02 08:00:00" },
      { id: 3, odometer_km: 140_076, liters: 250, is_full: true, logged_at: "2026-08-03 08:00:00" },
      { id: 4, odometer_km: 140_800, liters: 250, is_full: true, logged_at: "2026-08-04 08:00:00" },
    ];
    const t = tramosDeConsumo(logs);
    expect(t.every((x) => x.km > 0 && x.km < 5_000)).toBe(true);
  });
});

describe("qué se marca", () => {
  it("una surtida con los litros declarados de menos, con cuántos faltan", () => {
    const logs = paraja(6);
    // La última: los mismos 700 km pero declarando 190 L en vez de 250. 3,68 km/L contra
    // una mediana de 2,80 — el camión "mejora" un 30% de un día para el otro.
    logs[logs.length - 1].liters = 190;

    const r = rangoDeSurtidas(logs);
    expect(r.nivel).toBe("revisar");
    expect(r.mediana).toBeCloseTo(2.8, 2);
    expect(r.sospechosas).toHaveLength(1);

    const s = r.sospechosas[0];
    expect(s.id).toBe(logs[logs.length - 1].id);
    expect(s.litros_esperados).toBe(250);
    expect(s.diferencia).toBe(60); // positivo = faltan litros declarados
    expect(s.motivo).toContain("60");
  });

  it("y también la que declara de más, que es otra cosa y se dice distinto", () => {
    const logs = paraja(6);
    logs[logs.length - 1].liters = 330;
    const r = rangoDeSurtidas(logs);
    expect(r.sospechosas).toHaveLength(1);
    expect(r.sospechosas[0].diferencia).toBe(-80);
    // Se dice distinto que el otro lado: acá lo que se revisa es el odómetro, no la boleta.
    expect(r.sospechosas[0].motivo).toMatch(/80/);
    expect(r.sospechosas[0].motivo).toMatch(/od[óo]metro/i);
    expect(r.sospechosas[0].motivo).not.toMatch(/Faltan/);
  });

  it("no marca nada cuando el camión viene parejo", () => {
    const r = rangoDeSurtidas(paraja(6));
    expect(r.nivel).toBe("ok");
    expect(r.sospechosas).toEqual([]);
  });

  it("una diferencia adentro del umbral no se marca: los camiones varían solos", () => {
    const logs = paraja(6);
    // El umbral corre sobre el km/L, no sobre los litros: se despeja al revés. Éste queda
    // 17% arriba en rendimiento, que es declarar ~14,5% de litros de menos.
    logs[logs.length - 1].liters = 700 / (2.8 * (1 + DESVIO_SURTIDA - 0.03));
    expect(rangoDeSurtidas(logs).sospechosas).toEqual([]);
  });

  it("el umbral es de rendimiento, así que declarar 17% de litros de menos YA cae", () => {
    // 250 → 207,5 es 17% menos de litros, pero 3,37 km/L: 20,5% más de rendimiento. El
    // aviso queda un poco más sensible de lo que sugiere el 20%, y para este lado conviene.
    const logs = paraja(6);
    logs[logs.length - 1].liters = 250 * 0.83;
    expect(rangoDeSurtidas(logs).sospechosas).toHaveLength(1);
  });
});

describe("cuándo NO habla", () => {
  it("con pocos tramos se calla: la línea de base todavía no dice nada", () => {
    const logs = paraja(TRAMOS_MINIMOS - 1);
    logs[logs.length - 1].liters = 100; // rarísima, y aun así no se marca
    const r = rangoDeSurtidas(logs);
    expect(r.nivel).toBe("sin_datos");
    expect(r.sospechosas).toEqual([]);
    expect(r.tramos).toBe(TRAMOS_MINIMOS - 1);
  });

  it("sin surtidas no se rompe", () => {
    const r = rangoDeSurtidas([]);
    expect(r.nivel).toBe("sin_datos");
    expect(r.mediana).toBeNull();
  });
});

describe("por qué mediana y no promedio", () => {
  /**
   * Lo importante de todo el módulo, y no es lo que parece a primera vista.
   *
   * Contra UN outlier grande y aislado, el promedio anda igual de bien: el GTP 4413 real lo
   * marcan los dos. Donde el promedio falla es cuando hay VARIOS desvíos parejos — cada uno
   * tira la media hacia sí y entre todos corren la referencia lo suficiente como para que
   * ninguno quede fuera de rango. O sea que falla justo con el que lo hace seguido.
   */
  it("varios desvíos parejos corren el promedio y se tapan entre ellos; la mediana no", () => {
    // Diez tramos: siete normales a 2,80 y tres declarando 200 L en vez de 250 (3,50 km/L).
    const logs = paraja(10);
    for (const i of [3, 6, 9]) logs[i].liters = 200;

    const kmls = tramosDeConsumo(logs).map((t) => t.kml);
    const promedio = kmls.reduce((s, k) => s + k, 0) / kmls.length;

    // Contra el promedio (3,01) los tres quedan a 16% y no se marcaría ninguno.
    expect(kmls.filter((k) => Math.abs(k - promedio) / promedio > DESVIO_SURTIDA)).toEqual([]);

    // Contra la mediana (2,80) saltan los tres.
    const r = rangoDeSurtidas(logs);
    expect(r.mediana).toBeCloseTo(2.8, 2);
    expect(r.sospechosas.map((s) => s.id).sort((a, b) => a - b)).toEqual([4, 7, 10]);
  });

  it("y con un solo caso aislado los dos criterios coinciden, como en el GTP 4413", () => {
    const logs = paraja(10);
    logs[10].liters = 155;
    const kmls = tramosDeConsumo(logs).map((t) => t.kml);
    const promedio = kmls.reduce((s, k) => s + k, 0) / kmls.length;
    expect(Math.abs(kmls[9] - promedio) / promedio).toBeGreaterThan(DESVIO_SURTIDA);
    expect(rangoDeSurtidas(logs).sospechosas).toHaveLength(1);
  });
});

describe("el caso real del GTP 4413, que es una trampa", () => {
  /**
   * ESTE TEST EXISTE PORQUE ME EQUIVOQUÉ, Y EL ERROR ERA CONVINCENTE.
   *
   * Los datos reales: el 28/08 llena en 317.402, el 30/08 mete un CHORRO de 200 L sin mover
   * el tacógrafo, y el 31/08 llena en 318.717 declarando 332,3 L. Mirando sólo los llenados
   * son 1.315 km con 332 L = 3,96 km/L contra una mediana de 2,60: parece un camión que de
   * golpe rinde 50% mejor, y "faltan 154 litros".
   *
   * No falta nada. Los 154 litros son el chorro, que también se quemó en esos 1.315 km. Bien
   * contado da 532,3 L y 2,47 km/L, que es exactamente lo que rinde ese camión.
   *
   * Es el falso positivo más caro que puede tener esto: manda a la oficina a apretar a un
   * chofer que no hizo nada. Y no es raro —cualquier camión que eche un chorro entre dos
   * llenados lo produce—, así que si esto se rompe, se rompe seguido.
   */
  it("no marca nada: el chorro del 30/08 explica los 154 litros que parecían faltar", () => {
    const logs: SurtidaParaRango[] = [
      { id: 60, odometer_km: 314_507, liters: 253.92, is_full: true, logged_at: "2026-08-15 22:10:17" },
      { id: 61, odometer_km: 315_268, liters: 342.74, is_full: true, logged_at: "2026-08-19 22:11:11" },
      { id: 62, odometer_km: 316_198, liters: 403.67, is_full: true, logged_at: "2026-08-26 22:12:15" },
      { id: 63, odometer_km: 316_723, liters: 162.85, is_full: true, logged_at: "2026-08-27 22:15:00" },
      { id: 64, odometer_km: 317_402, liters: 273.69, is_full: true, logged_at: "2026-08-28 22:16:03" },
      { id: 66, odometer_km: 317_402, liters: 200, is_full: false, logged_at: "2026-08-30 22:19:57" },
      { id: 67, odometer_km: 318_717, liters: 332.3, is_full: true, logged_at: "2026-08-31 22:21:00" },
      { id: 68, odometer_km: 319_416, liters: 260.03, is_full: true, logged_at: "2026-09-01 22:22:44" },
      { id: 69, odometer_km: 320_193, liters: 313.79, is_full: true, logged_at: "2026-09-04 22:24:01" },
      { id: 70, odometer_km: 320_926, liters: 265.03, is_full: true, logged_at: "2026-09-05 22:24:58" },
      { id: 71, odometer_km: 321_660, liters: 303.69, is_full: true, logged_at: "2026-09-07 22:25:48" },
    ];

    const tramo = tramosDeConsumo(logs).find((t) => t.id === 67)!;
    expect(tramo.km).toBe(1315);
    expect(tramo.litros).toBeCloseTo(532.3, 1); // 200 del chorro + 332,3 del llenado
    expect(tramo.kml).toBeCloseTo(2.47, 2);

    expect(rangoDeSurtidas(logs).sospechosas.map((s) => s.id)).not.toContain(67);
  });
});
