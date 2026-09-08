import { describe, it, expect } from "vitest";
import { cabeceraCorregida } from "../api/lib/cabecera-viaje";
import type { Trip } from "@shared/domain";

/**
 * Las cuatro guardas que faltaban antes de ponerle pantalla a la corrección de cabecera.
 *
 * El endpoint andaba, pero puesto detrás de un botón dejaba cuatro trampas. Ninguna se ve
 * probando a mano con un viaje sano: hay que tener el viaje raro, la plantilla rara o el
 * estado raro. Por eso van acá.
 */

function viaje(p: Partial<Trip> = {}): Trip {
  return {
    id: 7,
    template_id: 1,
    provider_name: "Casarone",
    origin: "Artigas",
    remite: "Casarone",
    destination: "Montevideo",
    destinatario: "Tifecom",
    driver_id: 1,
    truck_id: 1,
    cargo_type: "Arroz",
    kilos_carga: 28070,
    field_values: {},
    status: "COMPLETADO",
    started_at: "2026-08-18 07:30:00",
    finished_at: "2026-08-18 19:10:00",
    notes: null,
    created_at: "2026-08-18 07:30:00",
    segments: [],
    kilometros: 627,
    edited_by: null,
    edited_at: null,
    driver_name: "Carlos Méndez",
    truck_plate: "GTP 4382",
    ...p,
  } as Trip;
}

describe("1 · un viaje con un dato ya vacío se puede corregir igual", () => {
  /**
   * En producción hay 2 viajes con `cargo_type` vacío. La validación miraba el valor
   * RESULTANTE, que sin mandar el campo se hereda del viaje: esos dos rechazaban todo
   * PATCH, incluso uno que sólo tocaba el destino. Le ponés el botón y para esos dos no
   * funciona nunca, sin explicación entendible.
   *
   * La regla correcta de un PATCH: se valida lo que el pedido MANDA, no lo que ya estaba.
   */
  it("corrige el destino de un viaje que tiene el tipo de carga vacío", () => {
    const r = cabeceraCorregida(viaje({ cargo_type: "" }), { destination: "Salto" }, null);
    expect("error" in r).toBe(false);
    if ("error" in r) return;
    expect(r.patch.destination).toBe("Salto");
    expect(r.patch.cargo_type).toBe("");
  });

  it("corrige un viaje que quedó sin destino, que es justo el que hay que arreglar", () => {
    const r = cabeceraCorregida(viaje({ destination: "" }), { destination: "Bella Unión" }, null);
    expect("error" in r).toBe(false);
  });

  it("pero sigue sin dejar VACIAR un campo a propósito", () => {
    const r = cabeceraCorregida(viaje(), { destination: "   " }, null);
    expect("error" in r).toBe(true);
    if (!("error" in r)) return;
    expect(r.error).toMatch(/destino/i);
  });

  it("tampoco deja vaciar el tipo de carga a propósito", () => {
    const r = cabeceraCorregida(viaje(), { cargo_type: "" }, null);
    expect("error" in r).toBe(true);
  });
});

describe("2 · cambiar el recorrido avisa que los kilómetros quedaron como estaban", () => {
  /**
   * Los km son la lectura real del chofer, no una estimación: pisarlos automáticamente sería
   * inventar. Pero si se corrige el destino y nadie toca los km, el viaje queda diciendo
   * 627 km para un recorrido que ya no es ése — y ese número sigue contando como km real en
   * la auditoría del tacógrafo. Se avisa, que es lo honesto.
   */
  it("avisa cuando cambia el destino y no vienen kilómetros", () => {
    const r = cabeceraCorregida(viaje(), { destination: "Salto" }, null);
    if ("error" in r) throw new Error("tenía que poder corregirse");
    expect(r.avisos.join(" ")).toMatch(/kil[oó]metros/i);
    expect(r.patch.kilometros).toBe(627);
  });

  it("no avisa si los kilómetros vienen corregidos en el mismo pedido", () => {
    const r = cabeceraCorregida(viaje(), { destination: "Salto", kilometros: 480 }, null);
    if ("error" in r) throw new Error("tenía que poder corregirse");
    expect(r.avisos).toEqual([]);
    expect(r.patch.kilometros).toBe(480);
  });

  it("no avisa si el recorrido no se tocó", () => {
    const r = cabeceraCorregida(viaje(), { notes: "Llovió" }, null);
    if ("error" in r) throw new Error("tenía que poder corregirse");
    expect(r.avisos).toEqual([]);
  });
});

describe("3 · en las plantillas de recorrido por carga no se corrige la cabecera", () => {
  /**
   * `recalcularRecorrido` corre después de CADA escritura de renglones y pisa origen y
   * destino con lo que digan las cargas. Corregirlos en la cabecera se veía bien, guardaba
   * bien, y se revertía solo en el siguiente guardado de renglones. Un revert silencioso es
   * peor que un error: el cliente deja de confiar en la herramienta.
   */
  it("rechaza cambiar el destino, y dice dónde se corrige de verdad", () => {
    const r = cabeceraCorregida(viaje(), { destination: "Salto" }, null, {
      recorridoPorCargas: true,
    });
    expect("error" in r).toBe(true);
    if (!("error" in r)) return;
    expect(r.error).toMatch(/cargas/i);
  });

  it("rechaza cambiar el origen igual", () => {
    const r = cabeceraCorregida(viaje(), { origin: "Paysandú" }, null, {
      recorridoPorCargas: true,
    });
    expect("error" in r).toBe(true);
  });

  it("pero deja corregir todo lo demás: kilos, observaciones, chofer", () => {
    const r = cabeceraCorregida(viaje(), { kilos_carga: 31000, notes: "ok" }, null, {
      recorridoPorCargas: true,
    });
    expect("error" in r).toBe(false);
  });

  it("mandar el mismo origen que ya tenía no cuenta como cambiarlo", () => {
    const r = cabeceraCorregida(viaje(), { origin: "Artigas", notes: "ok" }, null, {
      recorridoPorCargas: true,
    });
    expect("error" in r).toBe(false);
  });
});

describe("4 · a un viaje EN CURSO no se le cambia el chofer ni el camión", () => {
  /**
   * Reasignar el chofer de un viaje que está andando se lo saca de la mano al que está en la
   * ruta: la app se le queda sin el viaje que tiene abierto, a mitad de camino.
   */
  it("rechaza cambiar el chofer de un viaje en curso", () => {
    const r = cabeceraCorregida(viaje({ status: "EN_CURSO" }), { driver_id: 3 }, null);
    expect("error" in r).toBe(true);
    if (!("error" in r)) return;
    expect(r.error).toMatch(/en curso/i);
  });

  it("rechaza cambiar el camión de un viaje en curso", () => {
    const r = cabeceraCorregida(viaje({ status: "EN_CURSO" }), { truck_id: 4 }, null);
    expect("error" in r).toBe(true);
  });

  it("deja corregir lo demás de un viaje en curso", () => {
    const r = cabeceraCorregida(viaje({ status: "EN_CURSO" }), { notes: "Demora en la balanza" }, null);
    expect("error" in r).toBe(false);
  });

  it("y en un viaje cerrado el chofer se cambia sin problema", () => {
    const r = cabeceraCorregida(viaje({ status: "COMPLETADO" }), { driver_id: 3 }, null);
    expect("error" in r).toBe(false);
    if ("error" in r) return;
    expect(r.patch.driver_id).toBe(3);
  });

  it("mandar el mismo chofer que ya tenía no cuenta como cambiarlo", () => {
    const r = cabeceraCorregida(viaje({ status: "EN_CURSO" }), { driver_id: 1, notes: "ok" }, null);
    expect("error" in r).toBe(false);
  });
});
