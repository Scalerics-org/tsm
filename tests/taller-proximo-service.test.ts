import { describe, it, expect } from "vitest";
import { estadoDelProximo, proximoService, ultimoService, type Service, type Vehiculo } from "../shared/taller/tipos";
import { UMBRAL_AMBAR_SERVICE_KM, UMBRAL_ROJO_SERVICE_KM } from "../shared/taller/disposicion";

/**
 * El color de "faltan X km" para el próximo service: cortes fijos en km, iguales para los camiones
 * grandes (25.000) y los chicos (15.000). Lo pidió Rodrigo; antes era un tercio del intervalo.
 */
describe("estadoDelProximo por km", () => {
  it("los cortes son 3.000 y 10.000", () => {
    expect(UMBRAL_ROJO_SERVICE_KM).toBe(3_000);
    expect(UMBRAL_AMBAR_SERVICE_KM).toBe(10_000);
  });

  it.each([25_000, 15_000])("con intervalo de %i km, los mismos cortes", (intervalo) => {
    expect(estadoDelProximo(10_001, intervalo, "km")).toBe("verde");
    expect(estadoDelProximo(10_000, intervalo, "km")).toBe("ambar");
    expect(estadoDelProximo(3_000, intervalo, "km")).toBe("ambar");
    expect(estadoDelProximo(2_999, intervalo, "km")).toBe("rojo");
    expect(estadoDelProximo(0, intervalo, "km")).toBe("rojo");
  });

  it("ya pasado es rojo", () => {
    expect(estadoDelProximo(-1_200, 25_000, "km")).toBe("rojo");
  });

  it("un camión chico con 9.000 km de margen ya no es verde (con el tercio del intervalo lo era)", () => {
    expect(estadoDelProximo(9_000, 15_000, "km")).toBe("ambar");
  });
});

describe("estadoDelProximo en horas (montacargas)", () => {
  it("conserva su criterio: un tercio del intervalo y 25 horas", () => {
    expect(estadoDelProximo(201, 600, "h")).toBe("verde");
    expect(estadoDelProximo(200, 600, "h")).toBe("ambar");
    expect(estadoDelProximo(24, 600, "h")).toBe("rojo");
  });
});

/**
 * `proximoService`: cuándo toca el próximo service. Hoy lo cuenta por km, desde el service de MAYOR km, y no desde el más
 * reciente por fecha. Es como funciona ahora y estos tests lo fijan; cómo se decide el "último" cuando los services pasen
 * a la base (con la carga inicial y los services fuera de orden) se revisa en la fase 2 del Taller real.
 */
describe("proximoService", () => {
  const HOY = "2026-10-05";
  const service = (id: string, fecha: string, km: number): Service => ({ id, tipos: ["A"], fecha, km, chofer: "", mecanico: "", obs: "", items: [] });
  const vehiculo = (extra: Partial<Vehiculo> = {}): Vehiculo => ({
    patente: "GTP 0000",
    tipo: "camion",
    descripcion: "",
    disposicion: null,
    lectura: HOY,
    choferAsignado: "",
    unidad: "km",
    km: 120_000,
    cadaService: 25_000,
    kmPorDia: 400,
    cubiertas: [],
    services: [],
    componentes: [],
    ...extra,
  });

  it("con último service: toca al km de ese service más el intervalo, y falta lo que queda hasta el km de hoy", () => {
    const p = proximoService(vehiculo({ km: 120_000, services: [service("s1", "2026-08-01", 100_000)] }), HOY)!;
    expect(p.km).toBe(125_000);
    expect(p.faltan).toBe(5_000);
    expect(p.estado).toBe("ambar");
    expect(p.pasado).toBe(false);
  });

  it("sin services: cuenta desde 0, o sea que toca al km del intervalo", () => {
    const p = proximoService(vehiculo({ km: 20_000, services: [] }), HOY)!;
    expect(p.km).toBe(25_000);
    expect(p.faltan).toBe(5_000);
  });

  it("el último es el de mayor km y no el de fecha más nueva (se revisa en la fase 2)", () => {
    const services = [service("alto", "2026-06-01", 110_000), service("bajo", "2026-09-20", 95_000)];
    expect(ultimoService(vehiculo({ services }))!.id).toBe("alto");
    expect(proximoService(vehiculo({ km: 120_000, services }), HOY)!.km).toBe(135_000);
  });

  it("pasado el km: faltan es negativo, pasado es true y el estado es rojo", () => {
    const p = proximoService(vehiculo({ km: 130_000, services: [service("s1", "2026-01-01", 100_000)] }), HOY)!;
    expect(p.faltan).toBe(-5_000);
    expect(p.pasado).toBe(true);
    expect(p.estado).toBe("rojo");
    expect(p.dias).toBe(0);
    expect(p.fechaEstimada).toBe(HOY);
  });

  it("la fecha estimada sale del día que se le pasa, no del reloj", () => {
    const p = proximoService(vehiculo({ km: 120_000, kmPorDia: 500, services: [service("s1", "2026-08-01", 100_000)] }), HOY)!;
    expect(p.dias).toBe(10);
    expect(p.fechaEstimada).toBe("2026-10-15");
    expect(proximoService(vehiculo({ km: 120_000, kmPorDia: 500, services: [service("s1", "2026-08-01", 100_000)] }), "2030-01-01")!.fechaEstimada).toBe("2030-01-11");
  });

  it("sin km por día (un camión recién cargado de la base) no se inventa una fecha", () => {
    const p = proximoService(vehiculo({ kmPorDia: 0, services: [service("s1", "2026-08-01", 100_000)] }), HOY)!;
    expect(p.dias).toBeNull();
    expect(p.fechaEstimada).toBeNull();
    expect(p.faltan).toBe(5_000);
  });

  it("sin service por km (semirremolques y acoplados) no hay próximo", () => {
    expect(proximoService(vehiculo({ cadaService: null }), HOY)).toBeNull();
  });
});