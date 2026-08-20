import { describe, it, expect } from "vitest";
import { auditoriaKilometros, periodoAnterior, type ViajeAuditado } from "@shared/domain";

/**
 * "El primero de enero tengo una foto, el 31 de enero tengo la otra, sé que en enero el
 * camión recorrió X kilómetros... hizo tantos viajes cargados... la diferencia son los
 * kilómetros vacíos."
 *
 * Es la pieza con la que el cliente verifica lo que le cargan los choferes. Si esta cuenta
 * miente, deja de confiar en la app y vuelve a controlar a mano.
 */

const lectura = (kilometraje: number, tomada_at = "2026-02-01 08:00:00") => ({
  kilometraje,
  tomada_at,
});

const cargado = (kilometros: number | null): ViajeAuditado => ({ kilometros, vacio: false });
const vacio = (kilometros: number | null): ViajeAuditado => ({ kilometros, vacio: true });

describe("auditoriaKilometros", () => {
  it("la diferencia entre las dos fotos son los km del mes", () => {
    const a = auditoriaKilometros("2026-01", lectura(112_400), lectura(100_000), []);
    expect(a.km_periodo).toBe(12_400);
  });

  it("separa los km cargados de los vacíos y deja la diferencia sin justificar", () => {
    const a = auditoriaKilometros("2026-01", lectura(112_400), lectura(100_000), [
      cargado(4_000),
      cargado(3_500),
      vacio(4_000),
    ]);
    expect(a.km_cargados).toBe(7_500);
    expect(a.km_vacios).toBe(4_000);
    expect(a.km_sin_justificar).toBe(900);
    expect(a.viajes_cargados).toBe(2);
    expect(a.viajes_vacios).toBe(1);
  });

  it("sin lectura previa no hay nada que comparar: no se inventa un cero", () => {
    // El primer mes del sistema. Con un cero de arranque, los 12.400 km del camión
    // aparecerían enteros como "sin justificar" el día que el cliente lo estrena.
    const a = auditoriaKilometros("2026-01", lectura(112_400), null, [cargado(4_000)]);
    expect(a.km_periodo).toBeNull();
    expect(a.km_sin_justificar).toBeNull();
    // Los viajes se siguen sumando: el mes que viene, con la otra foto, la cuenta cierra.
    expect(a.km_cargados).toBe(4_000);
  });

  it("sin la lectura de este mes tampoco: el chofer todavía no la trajo", () => {
    const a = auditoriaKilometros("2026-01", null, lectura(100_000), [cargado(4_000)]);
    expect(a.km_periodo).toBeNull();
    expect(a.km_sin_justificar).toBeNull();
  });

  it("un viaje sin kilómetros suma 0 y queda contado aparte", () => {
    // Es lo que va a pasar mientras casi ninguna plantilla pida kilómetros: los viajes
    // existen, no tienen km, y la auditoría tiene que poder decir POR QUÉ no cierra.
    const a = auditoriaKilometros("2026-01", lectura(112_400), lectura(100_000), [
      cargado(4_000),
      cargado(null),
      cargado(null),
    ]);
    expect(a.km_cargados).toBe(4_000);
    expect(a.viajes_cargados).toBe(3);
    expect(a.viajes_sin_km).toBe(2);
    expect(a.km_sin_justificar).toBe(8_400);
  });

  it("una diferencia negativa también es una señal y se muestra tal cual", () => {
    // Los viajes suman más km que los que marca el tacógrafo: o hay km inflados en un
    // viaje, o el kilometraje se tipeó mal. Recortarlo a cero taparía justo eso.
    const a = auditoriaKilometros("2026-01", lectura(102_000), lectura(100_000), [
      cargado(4_000),
    ]);
    expect(a.km_periodo).toBe(2_000);
    expect(a.km_sin_justificar).toBe(-2_000);
  });

  it("devuelve los días reales de las dos fotos, no el mes calendario", () => {
    // Al chofer se le pide el día 1 y la trae el 4: la oficina tiene que ver la ventana
    // que de verdad se comparó antes de salir a reclamarle a nadie.
    const a = auditoriaKilometros(
      "2026-01",
      lectura(112_400, "2026-02-04 19:20:00"),
      lectura(100_000, "2026-01-02 07:05:00"),
      [],
    );
    expect(a.desde).toBe("2026-01-02 07:05:00");
    expect(a.hasta).toBe("2026-02-04 19:20:00");
  });

  it("un mes sin viajes deja todo el recorrido sin justificar", () => {
    const a = auditoriaKilometros("2026-01", lectura(112_400), lectura(100_000), []);
    expect(a.km_cargados).toBe(0);
    expect(a.km_vacios).toBe(0);
    expect(a.km_sin_justificar).toBe(12_400);
  });

  it("no arrastra residuos de coma flotante", () => {
    const a = auditoriaKilometros("2026-01", lectura(100_310.3), lectura(100_000), [
      cargado(120.1),
      cargado(190.2),
    ]);
    expect(a.km_periodo).toBe(310.3);
    expect(a.km_cargados).toBe(310.3);
    expect(a.km_sin_justificar).toBe(0);
  });
});

describe("periodoAnterior", () => {
  it("resta un mes", () => {
    expect(periodoAnterior("2026-08")).toBe("2026-07");
  });

  it("enero va a diciembre del año pasado", () => {
    expect(periodoAnterior("2026-01")).toBe("2025-12");
  });

  it("mantiene los dos dígitos del mes", () => {
    expect(periodoAnterior("2026-10")).toBe("2026-09");
  });
});
