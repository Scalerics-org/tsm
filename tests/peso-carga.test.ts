import { describe, it, expect } from "vitest";
import { PESO_MINIMO_ESPERADO, fmtKilos, pesoSospechoso } from "@shared/domain";

/**
 * "En el tema kilos podemos dejar una unidad sola de medida? Que sean en kilo igual, en mil
 * kilos, 15.000 kilos, 29.000 kilos." — el cliente.
 *
 * En producción la misma columna tenía kilos y toneladas mezclados, con mil de diferencia:
 * 29200 y 30000 al lado de 29.539, 29.7 y 29. El total por cliente que veía la oficina no
 * significaba nada.
 *
 * La causa era la etiqueta: el campo pedía "Toneladas de carga" y el remito dice kilos —el de
 * Casarone marca Neto 29.710— así que unos convertían de cabeza y otros copiaban el papel.
 *
 * La app NO adivina. Si alguien escribe 29 no hay forma de saber si son 29 kilos o 29
 * toneladas, y ése es el número que se factura. Se fija la unidad y se avisa cuando el número
 * es demasiado chico para ser una carga.
 */
describe("pesoSospechoso", () => {
  it("una carga de camión no pesa 29 kilos", () => {
    expect(pesoSospechoso(29)).toBe(true);
    expect(pesoSospechoso(29.7)).toBe(true);
    expect(pesoSospechoso(15)).toBe(true);
  });

  it("los kilos de verdad pasan sin molestar", () => {
    expect(pesoSospechoso(29_200)).toBe(false);
    expect(pesoSospechoso(30_000)).toBe(false);
    expect(pesoSospechoso(1_500)).toBe(false);
  });

  it("el borde es el umbral, y está en una constante para poder moverlo", () => {
    expect(pesoSospechoso(PESO_MINIMO_ESPERADO)).toBe(false);
    expect(pesoSospechoso(PESO_MINIMO_ESPERADO - 1)).toBe(true);
  });

  it("sin peso no hay nada que sospechar: el aviso no puede aparecer con el campo vacío", () => {
    expect(pesoSospechoso(null)).toBe(false);
    expect(pesoSospechoso(0)).toBe(false);
  });
});

describe("fmtKilos", () => {
  it("con separador de miles, que es como lo lee el remito", () => {
    expect(fmtKilos(29_710)).toBe("29.710 kg");
    expect(fmtKilos(1_500)).toBe("1.500 kg");
  });

  it("redondea a kilo entero: los gramos no existen en una carga", () => {
    expect(fmtKilos(29_710.4)).toBe("29.710 kg");
  });

  it("sin dato, un guión y no un cero", () => {
    expect(fmtKilos(null)).toBe("—");
  });
});
