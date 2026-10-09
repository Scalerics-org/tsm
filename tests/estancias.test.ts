import { describe, expect, it } from "vitest";
import { kmEstimados } from "@shared/distancias";
import type { Descarga } from "@shared/domain";
import {
  VECES_QUE_SE_RECORRE_LA_ESTANCIA,
  conDesvioDeEstancias,
  desvioDeEstancia,
  kmDeDesvios,
  type EstanciaConKm,
} from "@shared/estancias";
import { kmEstimadosDelViaje } from "@shared/vacios";

/**
 * Las estancias donde se descarga fuera de la ruta suman su desvío a los km del viaje.
 *
 * "Descargamos en estancias, en el medio... quedan entre 40 y 100 km aprox de Artigas." (Rodrigo, 10/10).
 */

const descarga = (lugar: string, departamento = "Artigas", extra: Partial<Descarga> = {}): Descarga => ({
  sid: `sid-${lugar}`,
  departamento,
  lugar,
  kilos: null,
  pallets: null,
  ...extra,
});

const LA_PAZ: EstanciaConKm = { nombre: "Estancia La Paz", departamento: "Artigas", km_desde_ciudad: 60 };

describe("el desvío de una estancia", () => {
  it("es ida y vuelta: dos veces los km desde la ciudad (constante con nombre, a confirmar)", () => {
    expect(VECES_QUE_SE_RECORRE_LA_ESTANCIA).toBe(2);
    expect(desvioDeEstancia(60)).toBe(120);
    expect(desvioDeEstancia(40)).toBe(80);
    expect(desvioDeEstancia(100)).toBe(200);
  });
});

describe("conDesvioDeEstancias", () => {
  it("una descarga en una estancia conocida guarda su desvío", () => {
    const [d] = conDesvioDeEstancias([descarga("Estancia La Paz")], [LA_PAZ]);
    expect(d.km_desvio).toBe(120);
  });

  it("no distingue mayúsculas ni acentos ni espacios de más", () => {
    const [d] = conDesvioDeEstancias([descarga("  ESTANCIA  la paz ")], [LA_PAZ]);
    expect(d.km_desvio).toBe(120);
  });

  it("un lugar que no es una estancia cargada no suma nada", () => {
    const [d] = conDesvioDeEstancias([descarga("Un depósito cualquiera")], [LA_PAZ]);
    expect(d.km_desvio).toBeUndefined();
  });

  it("una estancia de otro departamento no cuenta", () => {
    const [d] = conDesvioDeEstancias([descarga("Estancia La Paz", "Salto")], [LA_PAZ]);
    expect(d.km_desvio).toBeUndefined();
  });

  it("una estancia sin departamento vale en cualquiera", () => {
    const [d] = conDesvioDeEstancias([descarga("Estancia La Paz", "Salto")], [{ ...LA_PAZ, departamento: null }]);
    expect(d.km_desvio).toBe(120);
  });

  it("reevalúa: si la estancia ya no está cargada, le saca el desvío que traía", () => {
    const [d] = conDesvioDeEstancias([descarga("Estancia La Paz", "Artigas", { km_desvio: 120 })], []);
    expect(d.km_desvio).toBeUndefined();
  });

  it("no toca el resto de la descarga ni la lista que recibe", () => {
    const original = [descarga("Estancia La Paz", "Artigas", { kilos: 500, sin_boleta: true })];
    const [d] = conDesvioDeEstancias(original, [LA_PAZ]);
    expect(d).toMatchObject({ sid: "sid-Estancia La Paz", kilos: 500, sin_boleta: true });
    expect(original[0].km_desvio).toBeUndefined();
  });
});

describe("kmDeDesvios", () => {
  it("suma los desvíos y ignora los que no tienen", () => {
    expect(kmDeDesvios([{ km_desvio: 120 }, {}, { km_desvio: 80 }])).toBe(200);
    expect(kmDeDesvios(null)).toBe(0);
    expect(kmDeDesvios([])).toBe(0);
  });
});

describe("los km del viaje suman el desvío", () => {
  const directo = kmEstimados("Artigas", "Montevideo") as number;
  const viaje = (descargas: Descarga[]) => ({ origin: "Artigas", destination: "Montevideo", segments: [], descargas });

  it("Artigas → Montevideo con una descarga en una estancia a 60 km: el directo + 120", () => {
    const conDesvio = conDesvioDeEstancias([descarga("Estancia La Paz"), descarga("Descarga final", "Montevideo")], [LA_PAZ]);
    expect(kmEstimadosDelViaje(viaje(conDesvio))).toBe(directo + 120);
  });

  it("sin la estancia cargada en la libreta, el viaje no suma nada (como hasta hoy)", () => {
    const sin = conDesvioDeEstancias([descarga("Estancia La Paz"), descarga("Descarga final", "Montevideo")], []);
    expect(kmEstimadosDelViaje(viaje(sin))).toBe(directo);
  });

  it("dos estancias suman las dos", () => {
    const otra: EstanciaConKm = { nombre: "Estancia El Ombú", departamento: "Artigas", km_desde_ciudad: 40 };
    const dos = conDesvioDeEstancias(
      [descarga("Estancia La Paz"), descarga("Estancia El Ombú"), descarga("Descarga final", "Montevideo")],
      [LA_PAZ, otra],
    );
    expect(kmEstimadosDelViaje(viaje(dos))).toBe(directo + 120 + 80);
  });

  it("un viaje sin estancias da lo mismo que antes del desvío", () => {
    expect(kmEstimadosDelViaje(viaje([descarga("Descarga final", "Montevideo")]))).toBe(directo);
  });

  it("un viaje cuyo recorrido no se conoce sigue sin km (no inventa uno con sólo el desvío)", () => {
    const km = kmEstimadosDelViaje({
      origin: "Lugar Raro",
      destination: "Otro Raro",
      descargas: [{ departamento: "Otro Raro", km_desvio: 120 }],
    });
    expect(km).toBeNull();
  });
});
