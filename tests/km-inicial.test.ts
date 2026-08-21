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
/**
 * El odómetro del camión tal como lo devuelve la base: el número y cuándo lo tocó la oficina.
 * `at: null` es "nadie lo editó nunca", que es el estado de casi todos los camiones y el que
 * dejan las pruebas de más abajo salvo donde la fecha es el punto.
 */
const oficina = (km: number, at: string | null = null) => ({ km, at });

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
    const r = kmInicialTacografo(logs, oficina(300_000));
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
    expect(kmInicialTacografo(logs, oficina(300_000)).km).toBe(395_451);
  });

  it("dos surtidas el mismo día: manda la última cargada", () => {
    const logs = [surtida("2026-08-10", 300_500, 7), surtida("2026-08-10", 300_800, 9)];
    expect(kmInicialTacografo(logs, oficina(0)).km).toBe(300_800);
    // Y no depende del orden en que vengan de la base.
    expect(kmInicialTacografo([logs[1], logs[0]], oficina(0)).km).toBe(300_800);
  });

  it("un chorro no mueve el arranque: guarda el mismo km con fecha posterior", () => {
    const logs = [surtida("2026-08-03", 394_251), surtida("2026-08-05", 394_251)];
    const r = kmInicialTacografo(logs, oficina(0));
    expect(r.km).toBe(394_251);
    expect(r.origen).toBe("surtida");
  });

  it("sin surtidas, arranca del odómetro que cargó la oficina", () => {
    // Es lo que el cliente estaba haciendo: entra a Camiones, edita el odómetro y espera
    // que la pantalla de surtida arranque de ahí.
    const r = kmInicialTacografo([], oficina(300_000));
    expect(r.km).toBe(300_000);
    expect(r.origen).toBe("oficina");
    expect(r.fecha).toBeNull();
  });

  it("sin surtidas y sin odómetro cargado, no se inventa nada: lo tipea el chofer", () => {
    const r = kmInicialTacografo([], oficina(0));
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

/**
 * "Edité el odómetro del camión 4384 y cuando fui a registrar una surtida no se actualizó el
 * tacógrafo." — el cliente, 21 de agosto de 2026.
 *
 * Los números son los de producción: la oficina puso 390.000 y la pantalla siguió mostrando
 * 395.705, que es la surtida del 18. El arreglo anterior sólo había cubierto el camión SIN
 * surtidas; el 4384 tiene dos, así que su edición no se miraba nunca.
 *
 * La regla es la recencia: gana lo último que alguien dijo del tacógrafo, sea una surtida o
 * la oficina. Y no al revés —no gana "el más alto"— porque corregir para abajo es justo lo
 * que la oficina necesita poder hacer.
 */
describe("la corrección de la oficina contra las surtidas", () => {
  it("el caso del 4384: la oficina lo editó hoy y gana sobre la surtida del 18", () => {
    const logs = [surtida("2026-08-18 20:20:05", 394_300), surtida("2026-08-18 20:23:18", 395_705)];
    const r = kmInicialTacografo(logs, oficina(390_000, "2026-08-21 10:00:00"));
    expect(r.km).toBe(390_000);
    expect(r.origen).toBe("oficina");
    expect(r.fecha).toBe("2026-08-21");
  });

  it("pero una surtida posterior a la edición vuelve a mandar", () => {
    const logs = [
      surtida("2026-08-18 20:23:18", 395_705),
      surtida("2026-08-22 09:00:00", 396_400),
    ];
    const r = kmInicialTacografo(logs, oficina(390_000, "2026-08-21 10:00:00"));
    expect(r.km).toBe(396_400);
    expect(r.origen).toBe("surtida");
  });

  it("un camión que la oficina nunca tocó sigue saliendo de la surtida", () => {
    const logs = [surtida("2026-08-18", 395_705)];
    expect(kmInicialTacografo(logs, oficina(390_000)).km).toBe(395_705);
  });

  it("la oficina puede CORREGIR PARA ABAJO, que es para lo que pidió poder editar", () => {
    // El 4325 real: una surtida de prueba de 397.000 contra un odómetro de 140.076.
    const logs = [surtida("2026-08-10", 397_000)];
    const r = kmInicialTacografo(logs, oficina(140_076, "2026-08-21 10:00:00"));
    expect(r.km).toBe(140_076);
  });

  it("empate exacto de fecha: manda la oficina, porque está corrigiendo lo que ya vio", () => {
    const logs = [surtida("2026-08-21 10:00:00", 395_705)];
    expect(kmInicialTacografo(logs, oficina(390_000, "2026-08-21 10:00:00")).origen).toBe("oficina");
  });

  it("un odómetro en cero no le gana a nada, por más fecha que tenga", () => {
    const logs = [surtida("2026-08-18", 395_705)];
    expect(kmInicialTacografo(logs, oficina(0, "2026-08-21 10:00:00")).km).toBe(395_705);
  });

  it("y el chofer ve de cuándo es el número que le puso la oficina", () => {
    expect(textoKmInicial({ km: 390_000, origen: "oficina", fecha: "2026-08-21" })).toBe(
      "Cargado por la oficina el 21/8",
    );
  });
});
