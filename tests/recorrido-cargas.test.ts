import { describe, it, expect } from "vitest";
import { recorridoSegunCargas } from "@shared/domain";

/**
 * "Sacale esos pasos."
 *
 * En el combinado genérico cada carga es un tramo propio: el chofer elige el departamento
 * donde cargó y el de destino, carga por carga. Preguntarle ADEMÁS de dónde sale y adónde va
 * el viaje entero era pedirle dos veces lo mismo — con tres cargas eran 14 pasos y dos
 * repetidos — y encima ambiguo: si carga en Artigas y en Salto y descarga todo en Montevideo,
 * ¿cuál es "el origen del viaje"?
 *
 * El dato verdadero está en las cargas. El viaje sale de donde salió la primera y termina
 * donde terminó la última.
 */
const carga = (origen: string | null, destino: string | null) => ({ origen, destino });

describe("recorridoSegunCargas", () => {
  it("el viaje va de la primera carga a la última", () => {
    expect(
      recorridoSegunCargas([
        carga("Artigas", "Salto"),
        carga("Salto", "Montevideo"),
        carga("Montevideo", "Canelones"),
      ]),
    ).toEqual({ origin: "Artigas", destination: "Canelones" });
  });

  it("con una sola carga, el viaje es esa carga", () => {
    expect(recorridoSegunCargas([carga("Rivera", "Montevideo")])).toEqual({
      origin: "Rivera",
      destination: "Montevideo",
    });
  });

  it("saltea las cargas que no dicen de dónde salieron", () => {
    // Los renglones fijos de oficina vienen sin ubicación propia: no tienen que definir
    // el recorrido de un viaje que el chofer sí está ubicando.
    expect(
      recorridoSegunCargas([carga(null, null), carga("Salto", "Rivera"), carga(null, null)]),
    ).toEqual({ origin: "Salto", destination: "Rivera" });
  });

  it("sin ninguna carga ubicada no inventa un recorrido", () => {
    expect(recorridoSegunCargas([])).toBeNull();
    expect(recorridoSegunCargas([carga(null, null)])).toBeNull();
    expect(recorridoSegunCargas([carga("", "")])).toBeNull();
  });

  it("si sólo se sabe una punta, se devuelve esa y la otra queda vacía", () => {
    // Pasa mientras el chofer está cargando: puso de dónde salió y todavía no el destino.
    expect(recorridoSegunCargas([carga("Artigas", null)])).toEqual({
      origin: "Artigas",
      destination: "",
    });
  });

  it("el orden manda: la última carga define el destino aunque sea la de km más bajo", () => {
    expect(
      recorridoSegunCargas([carga("Montevideo", "Artigas"), carga("Artigas", "Montevideo")]),
    ).toEqual({ origin: "Montevideo", destination: "Montevideo" });
  });
});
