import { describe, it, expect } from "vitest";
import { plantillaHabilitada } from "@shared/domain";

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
