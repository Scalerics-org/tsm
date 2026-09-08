import { describe, it, expect } from "vitest";
import { motivoParaNoBorrar } from "../api/lib/proveedores";

/**
 * Los dos frenos que hay que tener ANTES de que exista la pantalla de proveedores.
 *
 * El backend de proveedores estaba entero desde el primer día —crear, renombrar, borrar—
 * pero nunca hubo pantalla, así que nadie lo usó y nadie descubrió que las dos operaciones
 * destructivas no tienen freno. Ponerles un botón sin taparlas es publicar el agujero.
 *
 * Borrar: `trip_templates.provider_id` y `libreta.provider_id` son ON DELETE CASCADE. Borrar
 * "Casarone" se lleva puesta su plantilla, y con ella la posibilidad de que el chofer salga a
 * hacer ese viaje. Sin aviso y sin vuelta atrás.
 */

describe("cuándo NO se puede borrar un proveedor", () => {
  it("deja borrar el que no tiene nada colgando", () => {
    expect(motivoParaNoBorrar({ viajes: 0, plantillas: 0, libreta: 0 })).toBeNull();
  });

  it("frena si tiene viajes, y dice cuántos", () => {
    const m = motivoParaNoBorrar({ viajes: 16, plantillas: 0, libreta: 0 });
    expect(m).toContain("16 viaje");
  });

  it("frena si tiene plantillas: borrarlo se las lleva puestas", () => {
    const m = motivoParaNoBorrar({ viajes: 0, plantillas: 4, libreta: 0 });
    expect(m).toContain("4 plantilla");
  });

  it("frena si tiene entradas de libreta atadas", () => {
    const m = motivoParaNoBorrar({ viajes: 0, plantillas: 0, libreta: 7 });
    expect(m).toContain("7 ");
  });

  it("cuando hay de todo, los nombra a todos: la oficina tiene que saber qué desarmar", () => {
    const m = motivoParaNoBorrar({ viajes: 16, plantillas: 4, libreta: 2 }) ?? "";
    expect(m).toContain("16 viaje");
    expect(m).toContain("4 plantilla");
    expect(m).toContain("2 ");
  });

  it("usa singular cuando es uno solo", () => {
    const m = motivoParaNoBorrar({ viajes: 1, plantillas: 0, libreta: 0 }) ?? "";
    expect(m).toContain("1 viaje");
    expect(m).not.toContain("1 viajes");
  });

  it("el mensaje dice qué hacer, no sólo que no se puede", () => {
    const m = motivoParaNoBorrar({ viajes: 3, plantillas: 0, libreta: 0 }) ?? "";
    // Un 'no se puede' sin salida es un callejón: la oficina queda sin saber cómo seguir.
    expect(m.length).toBeGreaterThan(40);
  });
});
