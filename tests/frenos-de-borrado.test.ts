import { describe, it, expect } from "vitest";
import { motivoParaNoBorrarCamion, motivoParaNoBorrarChofer } from "../api/lib/frenos-de-borrado";

/**
 * Borrar un camión o un chofer desde Admin.
 *
 * En producción `trips.truck_id` y `trips.driver_id` no tienen ON DELETE, así que con viajes
 * la base rechazaba el borrado y la oficina recibía "Error interno del servidor" —o nada, porque
 * el botón no tenía `catch`—. Y lo contrario era peor: `fuel_logs.truck_id` y
 * `lecturas_odometro.truck_id` son ON DELETE CASCADE, así que un camión sin viajes pero con
 * surtidas se borraba llevándose su consumo entero, sin aviso.
 */

describe("cuándo NO se puede borrar un camión", () => {
  it("deja borrar el que no tiene nada: el que se dio de alta por error", () => {
    expect(motivoParaNoBorrarCamion({ viajes: 0, surtidas: 0, lecturas: 0, choferes: 0 })).toBeNull();
  });

  it("frena si tiene viajes, y dice cuántos", () => {
    expect(motivoParaNoBorrarCamion({ viajes: 42, surtidas: 0, lecturas: 0, choferes: 0 })).toContain("42 viajes");
  });

  it("frena si sólo tiene surtidas: la base se las llevaría puestas", () => {
    expect(motivoParaNoBorrarCamion({ viajes: 0, surtidas: 1, lecturas: 0, choferes: 0 })).toContain("1 surtida");
  });

  it("frena si sólo tiene lecturas del tacógrafo", () => {
    expect(motivoParaNoBorrarCamion({ viajes: 0, surtidas: 0, lecturas: 3, choferes: 0 })).toContain("3 lecturas");
  });

  it("frena si un chofer entra con esa patente, aunque el camión esté sin estrenar", () => {
    // El caso real: un camión recién dado de alta, sin viajes ni surtidas, con su chofer ya
    // asignado. Borrarlo lo dejaba sin camión y sin poder entrar a la mañana siguiente.
    const m = motivoParaNoBorrarCamion({ viajes: 0, surtidas: 0, lecturas: 0, choferes: 1 }) ?? "";
    expect(m).toContain("un chofer entra");
    expect(m).toContain("Choferes");
  });

  it("cuando hay de todo, nombra todo", () => {
    const m = motivoParaNoBorrarCamion({ viajes: 42, surtidas: 17, lecturas: 3, choferes: 0 }) ?? "";
    expect(m).toContain("42 viajes, 17 surtidas y 3 lecturas del tacógrafo");
  });
});

describe("cuándo NO se puede borrar un chofer", () => {
  it("deja borrar el que no tiene nada", () => {
    expect(motivoParaNoBorrarChofer({ viajes: 0, surtidas: 0, libreta: 0 })).toBeNull();
  });

  it("frena si tiene viajes, y dice por dónde seguir", () => {
    const m = motivoParaNoBorrarChofer({ viajes: 1, surtidas: 0, libreta: 0 }) ?? "";
    expect(m).toContain("1 viaje");
    expect(m).toContain("Inactivo");
  });

  it("frena si agregó lugares a la libreta: la base no deja borrarlo", () => {
    expect(motivoParaNoBorrarChofer({ viajes: 0, surtidas: 0, libreta: 2 })).toContain("2 lugares");
  });

  it("frena si tiene surtidas: se perdería quién las cargó", () => {
    expect(motivoParaNoBorrarChofer({ viajes: 0, surtidas: 5, libreta: 0 })).toContain("5 surtidas");
  });
});
