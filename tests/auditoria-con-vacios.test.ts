import { describe, it, expect } from "vitest";
import { auditoriaKilometros, type ViajeAuditado } from "@shared/domain";
import type { TramoVacio } from "@shared/vacios";

/**
 * Los vacíos deducidos entran en la auditoría, y salen de "sin justificar".
 *
 * "Tendríamos 3 resumen: 1 cargados, 2 vacíos (retornos), 3 vacíos para llegar a cargas en un
 * mismo lugar o surtir." Las tres categorías que pidió el cliente, más lo que sobra.
 *
 * Hasta ahora todo lo que no era un viaje cargado caía en "sin justificar", y por eso el
 * número asustaba: para la GTP 4382 marcaba 6.606 km de un mes. Los kilómetros vacíos no son
 * un misterio — son ir a buscar la carga siguiente— y ahora se nombran.
 */

const lect = (kilometraje: number, tomada_at: string) => ({ kilometraje, tomada_at });
const viaje = (kilometros: number | null, vacio = false): ViajeAuditado =>
  ({ kilometros, estimado: false, vacio }) as ViajeAuditado;

const tramo = (km: number | null, tipo: TramoVacio["tipo"]): TramoVacio => ({
  desde: "Bella Unión",
  hasta: "Artigas",
  km,
  tipo,
  despues_de: 1,
  antes_de: 2,
});

describe("los vacíos deducidos descuentan de sin justificar", () => {
  it("sin tramos deducidos, la cuenta es la de siempre", () => {
    const a = auditoriaKilometros("2026-09", lect(2000, "2026-09-05"), lect(0, "2026-08-20"), [
      viaje(627),
      viaje(627),
    ]);
    expect(a.km_cargados).toBe(1254);
    expect(a.km_retorno).toBe(0);
    expect(a.km_reposicion).toBe(0);
    expect(a.km_sin_justificar).toBe(746);
  });

  /**
   * El ejemplo que mandó el cliente, con sus propios números: dos viajes de 627 km, un
   * retorno de 627 en el medio, 2.000 km de tacógrafo.
   *
   * "SERIA 627 + 627 + 627 - 2000 RECORRIDOS. 119 KM SIN JUSTIFICAR Y GAS OIL."
   */
  it("reproduce la cuenta que hizo el cliente a mano", () => {
    const a = auditoriaKilometros(
      "2026-09",
      lect(2000, "2026-09-05"),
      lect(0, "2026-08-20"),
      [viaje(627), viaje(627)],
      [tramo(627, "retorno")],
    );
    expect(a.km_cargados).toBe(1254);
    expect(a.km_retorno).toBe(627);
    expect(a.km_sin_justificar).toBe(119);
  });

  it("separa retorno de reposición: son dos categorías distintas", () => {
    const a = auditoriaKilometros(
      "2026-09",
      lect(3000, "2026-09-05"),
      lect(0, "2026-08-20"),
      [viaje(1000)],
      [tramo(627, "retorno"), tramo(137, "reposicion"), tramo(130, "reposicion")],
    );
    expect(a.km_retorno).toBe(627);
    expect(a.km_reposicion).toBe(267);
    expect(a.tramos_vacios).toBe(3);
    expect(a.km_sin_justificar).toBe(3000 - 1000 - 627 - 267);
  });

  it("un tramo sin estimación no suma, pero se cuenta", () => {
    // "Bella Unión -> BUENOS AIRES": la app no conoce ciudades argentinas. No se inventa.
    const a = auditoriaKilometros(
      "2026-09",
      lect(2000, "2026-09-05"),
      lect(0, "2026-08-20"),
      [viaje(1000)],
      [tramo(null, "reposicion")],
    );
    expect(a.km_reposicion).toBe(0);
    expect(a.tramos_vacios).toBe(1);
    expect(a.km_sin_justificar).toBe(1000);
  });

  it("sin las dos lecturas no hay contra qué comparar, pero los vacíos se informan igual", () => {
    const a = auditoriaKilometros("2026-09", null, null, [viaje(627)], [tramo(137, "reposicion")]);
    expect(a.km_periodo).toBeNull();
    expect(a.km_sin_justificar).toBeNull();
    expect(a.km_reposicion).toBe(137);
  });

  it("los viajes vacíos REGISTRADOS siguen contando aparte de los deducidos", () => {
    // Las plantillas de viaje vacío existen y nadie las usó nunca, pero si algún día se usan
    // no se pueden contar dos veces ni pisarse con la deducción.
    const a = auditoriaKilometros(
      "2026-09",
      lect(2000, "2026-09-05"),
      lect(0, "2026-08-20"),
      [viaje(1000), viaje(200, true)],
      [tramo(137, "reposicion")],
    );
    expect(a.km_cargados).toBe(1000);
    expect(a.km_vacios).toBe(200);
    expect(a.km_reposicion).toBe(137);
    expect(a.km_sin_justificar).toBe(2000 - 1000 - 200 - 137);
  });
});
