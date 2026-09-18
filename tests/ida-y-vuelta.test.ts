import { describe, it, expect } from "vitest";
import { finDelViaje, kmEstimadosDelViaje, vaciosEntreViajes } from "../shared/vacios";
import { kmEstimados } from "../shared/distancias";

/**
 * Los viajes de ida y vuelta de Manassi.
 *
 * "El agua: hay dos que son ida y vuelta. Esos son siempre cargado con envase, pero es un viaje
 * solo. No lo considero retorno vacío, porque el precio del viaje es ida y vuelta. Por ende no
 * son kilómetros de retorno." — Rodrigo, 18/9/2026.
 *
 * El viaje dice Artigas → Minas, pero sus cargas son Artigas → Minas y Minas → Artigas: el
 * camión TERMINA en Artigas, cargado.
 */

const IDA_Y_VUELTA = {
  id: 1,
  started_at: "2026-09-14 10:00:00",
  origin: "Artigas",
  destination: "Minas",
  kilometros: 571,
  segments: [
    { origen: "Artigas", destino: "Minas" },
    { origen: "Minas", destino: "Artigas" },
  ],
};
const SIGUIENTE_DESDE_ARTIGAS = {
  id: 2,
  started_at: "2026-09-16 10:00:00",
  origin: "Artigas",
  destination: "Montevideo",
  kilometros: 600,
  segments: [],
};

describe("finDelViaje", () => {
  it("un viaje común termina en su destino", () => {
    expect(finDelViaje({ destination: "Minas", segments: [] })).toBe("Minas");
    expect(finDelViaje({ destination: "Minas" })).toBe("Minas");
  });

  it("una ida y vuelta termina donde va la última carga", () => {
    expect(finDelViaje(IDA_Y_VUELTA)).toBe("Artigas");
  });

  it("cargas sin destino no cambian nada", () => {
    expect(finDelViaje({ destination: "Minas", segments: [{ origen: null, destino: null }] })).toBe("Minas");
  });
});

describe("vacíos con una ida y vuelta", () => {
  it("volver a salir de donde empezó no es un retorno vacío", () => {
    expect(vaciosEntreViajes([IDA_Y_VUELTA, SIGUIENTE_DESDE_ARTIGAS])).toEqual([]);
  });

  it("si después sale de otro lado, el vacío arranca en Artigas y no en Minas", () => {
    const [tramo] = vaciosEntreViajes([IDA_Y_VUELTA, { ...SIGUIENTE_DESDE_ARTIGAS, origin: "Montevideo" }]);
    expect(tramo.desde).toBe("Artigas");
    expect(tramo.hasta).toBe("Montevideo");
  });
});

describe("kmEstimadosDelViaje", () => {
  it("un viaje común: de origen a destino", () => {
    expect(kmEstimadosDelViaje({ origin: "Artigas", destination: "Minas", segments: [] })).toBe(
      kmEstimados("Artigas", "Minas"),
    );
  });

  it("una ida y vuelta cuenta los dos tramos: la vuelta va cargada", () => {
    expect(kmEstimadosDelViaje(IDA_Y_VUELTA)).toBe(kmEstimados("Artigas", "Minas")! + kmEstimados("Minas", "Artigas")!);
  });

  it("si no conoce un lugar no inventa", () => {
    expect(kmEstimadosDelViaje({ origin: "Lugar Raro", destination: "Minas", segments: [] })).toBeNull();
  });
});

describe("viaje en curso sin destino todavía (internacional)", () => {
  it("no inventa un tramo vacío desde un destino que no existe", () => {
    const abierto = { ...SIGUIENTE_DESDE_ARTIGAS, id: 3, origin: "Salto", destination: "", started_at: "2026-09-17 10:00:00" };
    const despues = { ...SIGUIENTE_DESDE_ARTIGAS, id: 4, started_at: "2026-09-18 10:00:00" };
    expect(vaciosEntreViajes([abierto, despues])).toEqual([]);
  });
});
