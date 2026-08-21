import { describe, it, expect } from "vitest";
import { fuelFeedback } from "@shared/domain";

/**
 * "Si cuando ellos no llenen, me gustaría que le muestre el acumulado del mes igual al
 * anterior, que no le haga cuenta. Solo que le muestre el mismo. Que muestre cuando llenen
 * nomás." — el cliente, tres veces en la misma charla.
 *
 * El motivo no es técnico: "si le toma en cuenta eso, no le da el consumo y le resta del
 * otro, les va a hacer la cabeza". Un chorro suma litros que todavía están en el tanque, así
 * que recalcular ahí haría parecer que el camión empeoró — y los choferes sacan conclusiones.
 *
 * Números de la charla: gira de 700 a 1200 km, llenado de 400 L para arriba, chorro de 100
 * o 200 L, los dos tanques juntos dan 550.
 */
const log = (dia: string, km: number, litros: number, lleno: boolean) => ({
  odometer_km: km,
  liters: litros,
  is_full: lleno,
  logged_at: dia,
});

describe("el acumulado del mes no se mueve con un chorro", () => {
  it("después de llenar, el acumulado sale de los dos llenados", () => {
    const logs = [
      log("2026-08-01", 393_051, 400, true), // línea de base
      log("2026-08-03", 394_251, 400, true), // una gira de 1200 km
    ];
    const r = fuelFeedback(logs, logs[1]);
    expect(r.month_km).toBe(1200);
    expect(r.month_liters).toBe(400);
    expect(r.month_kml).toBeCloseTo(3, 5);
  });

  it("y un chorro después NO lo cambia: los litros siguen en el tanque", () => {
    const base = [
      log("2026-08-01", 393_051, 400, true),
      log("2026-08-03", 394_251, 400, true),
    ];
    const antes = fuelFeedback(base, base[1]).month_kml;

    // Echa 200 litros sin llenar. No mueve el tacógrafo: mismo km.
    const chorro = log("2026-08-05", 394_251, 200, false);
    const despues = fuelFeedback([...base, chorro], chorro);

    expect(despues.month_kml).toBe(antes);
    expect(despues.month_liters).toBe(400); // los 200 del chorro NO entran todavía
    expect(despues.closed).toBe(false); // el tramo queda abierto
  });

  it("recién al volver a llenar, el chorro entra en la cuenta", () => {
    const logs = [
      log("2026-08-01", 393_051, 400, true),
      log("2026-08-03", 394_251, 400, true),
      log("2026-08-05", 394_251, 200, false), // chorro
      log("2026-08-08", 395_451, 400, true), // llena de nuevo, otros 1200 km
    ];
    const r = fuelFeedback(logs, logs[3]);
    expect(r.month_km).toBe(2400); // 393.051 → 395.451
    expect(r.month_liters).toBe(1000); // 400 + 200 + 400, sin contar la línea de base
    expect(r.month_kml).toBeCloseTo(2.4, 5);
    expect(r.closed).toBe(true);
  });

  it("el consumo del tramo no se calcula en un chorro: queda abierto", () => {
    const logs = [
      log("2026-08-01", 393_051, 400, true),
      log("2026-08-05", 393_051, 200, false),
    ];
    const r = fuelFeedback(logs, logs[1]);
    expect(r.closed).toBe(false);
    expect(r.segment_kml).toBeNull();
  });

  it("con un solo llenado en el mes todavía no hay acumulado que mostrar", () => {
    const logs = [log("2026-08-01", 393_051, 400, true)];
    expect(fuelFeedback(logs, logs[0]).month_kml).toBeNull();
  });
});

/**
 * Desde que la oficina puede corregir el odómetro para abajo, el km de una surtida ya no sube
 * siempre. Un chorro guarda el km de arranque tal cual, así que puede quedar POR DEBAJO de un
 * llenado anterior — y la cadena del tramo, si se ordena por odómetro, se saltea esos litros.
 *
 * El tiempo sí es monótono. Por eso el tramo se recorre por fecha, igual que el acumulado
 * del mes, que ya se hacía así.
 */
describe("un chorro por debajo de un llenado anterior no se pierde", () => {
  it("sus litros entran igual en el tramo", () => {
    const logs = [
      log("2026-08-01", 390_000, 400, true), // línea de base
      log("2026-08-10", 395_705, 400, true), // llenado: cierra un tramo
      // La oficina bajó el odómetro a 390.000 y el chorro guardó ese número.
      log("2026-08-12", 390_000, 100, false),
      log("2026-08-20", 396_500, 200, true),
    ];
    const r = fuelFeedback(logs, logs[3]);
    expect(r.segment_km).toBe(795); // 396.500 - 395.705
    // Los 100 del chorro + los 200 del llenado. Por odómetro daban 200 y el camión parecía
    // rendir 3,98 km/L en vez de 2,65.
    expect(r.segment_liters).toBe(300);
    expect(r.segment_kml).toBeCloseTo(2.65, 2);
  });

  it("y el tramo se mide contra el llenado anterior POR FECHA, no contra el de km más alto", () => {
    const logs = [
      log("2026-08-01", 396_000, 400, true), // un km tipeado de más, ya corregido en el camión
      log("2026-08-10", 390_000, 400, true),
      log("2026-08-20", 391_000, 250, true),
    ];
    const r = fuelFeedback(logs, logs[2]);
    expect(r.segment_km).toBe(1000); // 391.000 - 390.000, el llenado del 10
  });
});
