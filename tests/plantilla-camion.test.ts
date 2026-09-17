import { describe, it, expect } from "vitest";
import { plantillaHabilitada, plantillaParaCamion } from "@shared/domain";

/**
 * "Hay camiones que directamente no hacen algunas cosas. A esos me gustaría que les
 * aparezca solo lo que hacen." — el cliente, sobre el viaje del camión de la UAM.
 */
describe("plantillaHabilitada", () => {
  it("deja pasar al camión asignado", () => {
    expect(plantillaHabilitada({ truck_ids: [3] }, 3)).toBe(true);
  });

  it("frena al camión que no está asignado", () => {
    expect(plantillaHabilitada({ truck_ids: [3] }, 1)).toBe(false);
  });

  it("acepta cualquiera de los camiones de la lista", () => {
    expect(plantillaHabilitada({ truck_ids: [2, 3, 7] }, 7)).toBe(true);
  });

  it("sin asignación la ven todos", () => {
    expect(plantillaHabilitada({ truck_ids: [] }, 1)).toBe(true);
  });

  // El fallo seguro: si template_trucks se vacía por accidente, la flota sigue trabajando.
  // Si fuera al revés, un borrado dejaría a todos los camiones sin poder cargar un viaje.
  it("sin asignación la ve hasta un chofer sin camión", () => {
    expect(plantillaHabilitada({ truck_ids: [] }, null)).toBe(true);
  });

  // Y al revés: no adivinamos en qué camión anda. Ofrecerle un viaje que su camión no hace
  // es justo lo que el cliente quiere evitar.
  it("un chofer sin camión no ve las restringidas", () => {
    expect(plantillaHabilitada({ truck_ids: [3] }, null)).toBe(false);
    expect(plantillaHabilitada({ truck_ids: [3] }, undefined)).toBe(false);
  });

  // El id 0 no existe como camión, pero si existiera no debe confundirse con "sin camión".
  it("no confunde el camión 0 con la falta de camión", () => {
    expect(plantillaHabilitada({ truck_ids: [0] }, 0)).toBe(true);
    expect(plantillaHabilitada({ truck_ids: [1] }, 0)).toBe(false);
  });
});

/**
 * El camión que hace siempre lo mismo.
 *
 * "El 4383. Solo ese tendría que ver esas opciones. Esos 4 viajes tendría que ver el 4383,
 * porque ese camión hace solo eso." — Rodrigo, 16/9/2026. UAM, UAM - Retorno, Agencia y
 * Mdeo - BU: dos son de todos, así que no alcanza con asignarle camiones a la plantilla.
 */
describe("plantillaParaCamion — la lista de viajes del camión", () => {
  const libre = { id: 22, truck_ids: [] };
  const deOtro = { id: 18, truck_ids: [3] };
  const otra = { id: 10, truck_ids: [] };

  it("sin lista, el camión ve lo de siempre", () => {
    expect(plantillaParaCamion(libre, 2, [])).toBe(true);
    expect(plantillaParaCamion(deOtro, 2, [])).toBe(false);
  });

  it("con lista, ve sólo las de su lista aunque sean de todos", () => {
    expect(plantillaParaCamion(libre, 2, [22, 18])).toBe(true);
    expect(plantillaParaCamion(otra, 2, [22, 18])).toBe(false);
  });

  it("la lista del camión manda: la oficina la eligió para él", () => {
    expect(plantillaParaCamion(deOtro, 2, [22, 18])).toBe(true);
  });
});
