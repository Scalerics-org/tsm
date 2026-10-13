import { describe, it, expect } from "vitest";
import { avisoDeCambioDeTipo, tipoDeVehiculo } from "../src/features/taller/disposicion";

/**
 * Las cubiertas se guardan por matrícula con el número de su posición. Si el tipo del vehículo cambió desde que se
 * cargaron, esas posiciones pueden significar otra cosa: el aviso lo dice, y no se borra ninguna cubierta.
 */
describe("avisoDeCambioDeTipo", () => {
  it("no avisa si el tipo es el mismo, si no hay tipo guardado o si no hay cubiertas", () => {
    const chico = tipoDeVehiculo("camion-chico");
    expect(avisoDeCambioDeTipo(chico, "camion-chico", [{ numero: 1 }])).toBeUndefined();
    expect(avisoDeCambioDeTipo(chico, undefined, [{ numero: 1 }])).toBeUndefined();
    expect(avisoDeCambioDeTipo(chico, "doble-eje", [])).toBeUndefined();
  });

  it("avisa del cambio y cuenta las cubiertas que no tienen lugar en el dibujo nuevo", () => {
    // camion-chico tiene 6 posiciones; doble-eje tenía 10: las 7 y 10 ya no tienen lugar.
    const aviso = avisoDeCambioDeTipo(tipoDeVehiculo("camion-chico"), "doble-eje", [{ numero: 1 }, { numero: 7 }, { numero: 10 }]);
    expect(aviso).toMatch(/Camión doble eje/);
    expect(aviso).toMatch(/Camión chico/);
    expect(aviso).toMatch(/2 cubiertas no tienen lugar/);
  });

  it("con el mismo número de posiciones avisa igual: una cubierta puede haber quedado en otro eje", () => {
    // sorra-sencilla tiene 4 posiciones, como un camión con un eje dual: ninguna queda afuera, pero el eje cambió.
    const aviso = avisoDeCambioDeTipo(tipoDeVehiculo("sorra-sencilla"), "remolque-3", [{ numero: 2 }]);
    expect(aviso).toMatch(/Remolque tres ejes/);
    expect(aviso).not.toMatch(/no tienen lugar/);
  });
});
