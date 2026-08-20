import { describe, it, expect } from "vitest";
import { kmInicialTacografo, textoKmInicial } from "@shared/domain";

/**
 * "Los kilómetros del odómetro no me los actualiza con lo que yo actualizo en la base del
 * camión... eso es lo que ayer quería ingresar, quería seguir, no pude porque no me
 * actualizaban los tacógrafos." — el cliente, cargando la línea de base de sus 4 camiones.
 *
 * Eran dos agujeros en el mismo número: la pantalla arrancaba del MÁXIMO de las surtidas (así
 * que una lectura mal tipeada quedaba pegada para siempre y corregirla no servía de nada), y
 * el odómetro que la oficina le carga al camión no se miraba nunca.
 *
 * Números reales: GTP 4325 tiene el odómetro del camión en 300.000 y surtidas que llegan a
 * 397.000.
 */
const surtida = (dia: string, km: number, id?: number) => ({
  odometer_km: km,
  logged_at: dia,
  id,
});

describe("de dónde arranca el tacógrafo en la pantalla de surtida", () => {
  it("sale de la última surtida por fecha, no de la más alta", () => {
    // La de 397.000 es un tipeo que la oficina ya corrigió: la lectura buena es la del 10.
    const logs = [
      surtida("2026-08-01", 396_000),
      surtida("2026-08-05", 397_000),
      surtida("2026-08-10", 300_500),
    ];
    const r = kmInicialTacografo(logs, 300_000);
    expect(r.km).toBe(300_500);
    expect(r.origen).toBe("surtida");
    expect(r.fecha).toBe("2026-08-10");
  });

  it("con el odómetro subiendo normal, la última por fecha ES la más alta", () => {
    const logs = [
      surtida("2026-08-01", 393_051),
      surtida("2026-08-03", 394_251),
      surtida("2026-08-08", 395_451),
    ];
    expect(kmInicialTacografo(logs, 300_000).km).toBe(395_451);
  });

  it("dos surtidas el mismo día: manda la última cargada", () => {
    const logs = [surtida("2026-08-10", 300_500, 7), surtida("2026-08-10", 300_800, 9)];
    expect(kmInicialTacografo(logs, 0).km).toBe(300_800);
    // Y no depende del orden en que vengan de la base.
    expect(kmInicialTacografo([logs[1], logs[0]], 0).km).toBe(300_800);
  });

  it("un chorro no mueve el arranque: guarda el mismo km con fecha posterior", () => {
    const logs = [surtida("2026-08-03", 394_251), surtida("2026-08-05", 394_251)];
    const r = kmInicialTacografo(logs, 0);
    expect(r.km).toBe(394_251);
    expect(r.origen).toBe("surtida");
  });

  it("sin surtidas, arranca del odómetro que cargó la oficina", () => {
    // Es lo que el cliente estaba haciendo: entra a Camiones, edita el odómetro y espera
    // que la pantalla de surtida arranque de ahí.
    const r = kmInicialTacografo([], 300_000);
    expect(r.km).toBe(300_000);
    expect(r.origen).toBe("oficina");
    expect(r.fecha).toBeNull();
  });

  it("sin surtidas y sin odómetro cargado, no se inventa nada: lo tipea el chofer", () => {
    const r = kmInicialTacografo([], 0);
    expect(r.km).toBe(0);
    expect(r.origen).toBe("sin-dato");
  });
});

describe("el chofer tiene que saber de dónde salió el número", () => {
  it("de una surtida, con la fecha para poder ubicarla", () => {
    expect(textoKmInicial({ km: 394_251, origen: "surtida", fecha: "2026-08-03" })).toBe(
      "De la surtida del 3/8",
    );
  });

  it("de la oficina, para saber a quién preguntarle", () => {
    expect(textoKmInicial({ km: 300_000, origen: "oficina", fecha: null })).toBe(
      "Cargado por la oficina",
    );
  });

  it("y cuando no hay nada, lo dice", () => {
    expect(textoKmInicial({ km: 0, origen: "sin-dato", fecha: null })).toBe("Sin dato previo");
  });
});
