import { describe, expect, it } from "vitest";
import { bloqueoPorFacturacion, type Alcance } from "../shared/bloqueo-facturacion";

const facturado = { factura_numero: "A-1234" };
const sinFacturar = { factura_numero: null };

const ALCANCES: Alcance[] = [
  { tipo: "viaje", cambio: "cargas" },
  { tipo: "viaje", cambio: "descargas" },
  { tipo: "viaje", cambio: "cabecera" },
  { tipo: "viaje", cambio: "fecha" },
  { tipo: "viaje", cambio: "llegada" },
  { tipo: "viaje", cambio: "cancelar" },
  { tipo: "viaje", cambio: "borrar" },
  { tipo: "carga", sid: "s1" },
  { tipo: "foto" },
];

describe("bloqueoPorFacturacion", () => {
  it.each(ALCANCES)("deja tocar un viaje sin facturar (%o)", (alcance) => {
    expect(bloqueoPorFacturacion(sinFacturar, alcance)).toBeNull();
  });

  it.each(ALCANCES)("frena un viaje facturado y nombra la factura (%o)", (alcance) => {
    expect(bloqueoPorFacturacion(facturado, alcance)).toMatch(/^Ese viaje ya está en la factura A-1234\. /);
  });

  it("un número vacío cuenta como sin facturar", () => {
    expect(bloqueoPorFacturacion({ factura_numero: "" }, { tipo: "foto" })).toBeNull();
  });

  it("un viaje que no se pudo leer no bloquea (la ruta ya lo trata como 404)", () => {
    expect(bloqueoPorFacturacion(null, { tipo: "foto" })).toBeNull();
    expect(bloqueoPorFacturacion(undefined, { tipo: "viaje", cambio: "cancelar" })).toBeNull();
  });

  it("también frena cuando la factura es 'S/F' o un nombre (texto libre a propósito)", () => {
    expect(bloqueoPorFacturacion({ factura_numero: "SAMAN" }, { tipo: "viaje", cambio: "fecha" })).toContain("SAMAN");
  });

  it("cada alcance conserva su mensaje de siempre", () => {
    const f = (a: Alcance) => bloqueoPorFacturacion(facturado, a);
    expect(f({ tipo: "viaje", cambio: "cargas" })).toBe(
      "Ese viaje ya está en la factura A-1234. Desmarcalo desde Facturación y después corregí las cargas.",
    );
    expect(f({ tipo: "carga", sid: "s1" })).toBe(
      "Ese viaje ya está en la factura A-1234. Desmarcalo desde Facturación y después cambiá a quién se le cobra.",
    );
    expect(f({ tipo: "foto" })).toBe(
      "Ese viaje ya está en la factura A-1234. Esa foto es el respaldo: desmarcalo desde Facturación si de verdad hay que sacarla.",
    );
    expect(f({ tipo: "viaje", cambio: "borrar" })).toBe(
      "Ese viaje ya está en la factura A-1234. Si de verdad hay que sacarlo, desmarcalo desde Facturación primero.",
    );
  });
});
