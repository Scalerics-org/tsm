import { describe, it, expect } from "vitest";
import { senalKilometros, diasEntreFotos, VENTANA_MINIMA_DIAS, type AuditoriaKm } from "@shared/domain";

/**
 * Control no acusa a un camión por una fecha mal cargada.
 *
 * En setiembre, con las fechas de las fotos del tacógrafo mal (la de subida en vez de la de la
 * foto), Control marcaba descuadres imposibles: el GTP 4326 comparaba 49 MINUTOS contra un mes
 * de odómetro y decía "9.743 km sin justificar"; el 4413, 44 horas y 7.984 km. Con la ventana
 * real, el 4326 tenía 18 viajes que sumaban 9.916 km contra 9.743 del tacógrafo: estaba bien.
 */

const auditoria = (p: Partial<AuditoriaKm>) =>
  ({
    periodo: "2026-09",
    km_periodo: 9743,
    km_cargados: 0,
    km_vacios: 0,
    km_retorno: 0,
    km_reposicion: 0,
    tramos_vacios: 0,
    km_sin_justificar: 9743,
    viajes_cargados: 0,
    viajes_vacios: 0,
    viajes_sin_km: 0,
    viajes_estimados: 0,
    desde: "2026-08-01 08:00:00",
    hasta: "2026-09-01 08:00:00",
    ...p,
  }) as AuditoriaKm;

describe("la ventana entre las dos fotos", () => {
  it("49 minutos no es un mes: no se compara, se pide corregir la fecha", () => {
    const s = senalKilometros(auditoria({ desde: "2026-09-09 20:04:43", hasta: "2026-09-09 20:53:01" }));
    expect(s.nivel).toBe("sin_datos");
    expect(s.motivo).toContain("48 minutos");
    expect(s.motivo).toContain("corregí la fecha de las fotos");
  });

  it("44 horas tampoco", () => {
    const s = senalKilometros(auditoria({ desde: "2026-09-07 21:45:58", hasta: "2026-09-09 18:15:57" }));
    expect(s.nivel).toBe("sin_datos");
    expect(s.motivo).toContain("44 horas");
  });

  it("17 días tampoco: la foto del mes se saca una vez por mes", () => {
    // Del 20/08 00:00 al 05/09 14:45 son 16,6 días: se redondea a 17.
    const s = senalKilometros(auditoria({ desde: "2026-08-20 00:00:00", hasta: "2026-09-05 14:45:22" }));
    expect(s.nivel).toBe("sin_datos");
    expect(s.motivo).toContain("17 días");
  });

  it("con una ventana de un mes, un descuadre grande SÍ se marca", () => {
    expect(senalKilometros(auditoria({})).nivel).toBe("revisar");
  });

  it("el mínimo es de 20 días: justo en el borde ya se compara", () => {
    const s = senalKilometros(
      auditoria({ desde: "2026-08-01 08:00:00", hasta: `2026-08-${String(1 + VENTANA_MINIMA_DIAS).padStart(2, "0")} 08:00:00` }),
    );
    expect(s.nivel).toBe("revisar");
  });

  it("falta de lectura se sigue diciendo como falta de lectura", () => {
    const s = senalKilometros(auditoria({ km_sin_justificar: null, km_periodo: null, hasta: null }));
    expect(s.motivo).toContain("Falta la lectura");
  });
});

describe("días entre las fotos", () => {
  it("entiende las fechas de la base y las de solo día", () => {
    expect(diasEntreFotos("2026-07-01", "2026-08-01")).toBe(31);
    expect(diasEntreFotos("2026-09-09 20:00:00", "2026-09-10 08:00:00")).toBe(0.5);
  });

  it("sin alguna de las dos no hay ventana", () => {
    expect(diasEntreFotos(null, "2026-08-01")).toBeNull();
  });
});
