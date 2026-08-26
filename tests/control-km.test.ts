import { describe, it, expect } from "vitest";
import {
  KM_SIN_JUSTIFICAR_ALERTA,
  auditoriaKilometros,
  avisoSurtida,
  bloqueaSalidaPorLectura,
  senalKilometros,
  type AuditoriaKm,
} from "@shared/domain";

/**
 * "Se puede hacer que en Control haya un seguimiento de esos km? Onda si un camión se pasa de
 * 100-200 km, que le avise a Rodrigo en Control." — el cliente, sobre los viajes vacíos.
 *
 * La cuenta ya existía (auditoriaKilometros). Lo que faltaba era decidir cuándo eso amerita
 * que alguien lo mire, que es otra cosa: un mes sin la foto del tacógrafo no es un mes con
 * kilómetros de más.
 */
const lectura = (km: number, dia: string) => ({ kilometraje: km, tomada_at: dia });
const viaje = (kilometros: number | null, vacio = false) => ({ kilometros, vacio });

const auditoria = (parcial: Partial<AuditoriaKm>): AuditoriaKm => ({
  periodo: "2026-08",
  km_periodo: 5000,
  km_cargados: 5000,
  km_vacios: 0,
  km_sin_justificar: 0,
  viajes_cargados: 10,
  viajes_vacios: 0,
  viajes_sin_km: 0,
  desde: "2026-07-01",
  hasta: "2026-08-01",
  ...parcial,
});

describe("senalKilometros", () => {
  it("no marca nada cuando el descuadre es chico", () => {
    const s = senalKilometros(auditoria({ km_sin_justificar: 40 }));
    expect(s.nivel).toBe("ok");
    expect(s.motivo).toBeNull();
  });

  it("marca para revisar cuando pasa el umbral", () => {
    const s = senalKilometros(auditoria({ km_sin_justificar: 320 }));
    expect(s.nivel).toBe("revisar");
    expect(s.motivo).toContain("320");
    expect(s.motivo).toContain("sin justificar");
  });

  it("justo en el umbral ya avisa", () => {
    expect(senalKilometros(auditoria({ km_sin_justificar: KM_SIN_JUSTIFICAR_ALERTA })).nivel).toBe("revisar");
    expect(senalKilometros(auditoria({ km_sin_justificar: KM_SIN_JUSTIFICAR_ALERTA - 1 })).nivel).toBe("ok");
  });

  it("un descuadre para el otro lado también se mira, y se dice distinto", () => {
    const s = senalKilometros(auditoria({ km_sin_justificar: -400 }));
    expect(s.nivel).toBe("revisar");
    expect(s.motivo).toContain("más de los que marca el tacógrafo");
    expect(s.motivo).not.toContain("-");
  });

  it("nombra los viajes sin km, que es la explicación más probable", () => {
    const s = senalKilometros(auditoria({ km_sin_justificar: 900, viajes_sin_km: 3 }));
    expect(s.motivo).toContain("3 viajes sin km");
  });

  it("falta de lectura no es descuadre: se distingue, y dice cuál falta", () => {
    const sinLaDelMes = senalKilometros(
      auditoriaKilometros("2026-08", null, lectura(100_000, "2026-07-01"), [viaje(500)]),
    );
    expect(sinLaDelMes.nivel).toBe("sin_datos");
    expect(sinLaDelMes.motivo).toContain("de este mes");

    const sinLaPrevia = senalKilometros(
      auditoriaKilometros("2026-08", lectura(105_000, "2026-08-01"), null, [viaje(500)]),
    );
    expect(sinLaPrevia.nivel).toBe("sin_datos");
    expect(sinLaPrevia.motivo).toContain("del mes pasado");
  });

  it("el umbral se puede mover sin tocar la cuenta", () => {
    expect(senalKilometros(auditoria({ km_sin_justificar: 200 }), 500).nivel).toBe("ok");
  });

  it("los kilómetros vacíos registrados dejan de aparecer como sin justificar", () => {
    const a = auditoriaKilometros(
      "2026-08",
      lectura(105_000, "2026-08-01"),
      lectura(100_000, "2026-07-01"),
      [viaje(4_500), viaje(480, true)],
    );
    expect(a.km_vacios).toBe(480);
    expect(senalKilometros(a).nivel).toBe("ok");
  });
});

describe("bloqueaSalidaPorLectura", () => {
  it("sin la foto del mes no sale", () => {
    expect(bloqueaSalidaPorLectura(3, false)).toBe(true);
  });

  it("con la foto cargada sale normal", () => {
    expect(bloqueaSalidaPorLectura(3, false)).toBe(true);
    expect(bloqueaSalidaPorLectura(3, true)).toBe(false);
  });

  it("un chofer sin camión no tiene tacógrafo que fotografiar: no se lo bloquea", () => {
    expect(bloqueaSalidaPorLectura(null, false)).toBe(false);
    expect(bloqueaSalidaPorLectura(undefined, false)).toBe(false);
  });
});

describe("avisoSurtida", () => {
  const base = { id: 7, truck_id: 2, odometer_km: 255_837, liters: 300, is_full: true };

  it("lo primero que se lee son los litros y el camión", () => {
    const a = avisoSurtida({ ...base, liters_tanque1: 180, liters_tanque2: 120 }, {
      driver_name: "Sergio Silva",
      truck_plate: "GTP 4382",
    });
    expect(a.title).toBe("Surtida · GTP 4382");
    expect(a.body.split("\n")[0]).toBe("300 L (T1 180 + T2 120)");
    expect(a.body).toContain("255.837 km");
    expect(a.body).toContain("Sergio Silva");
    expect(a.url).toBe("/panel/camion/2");
  });

  it("sin desglose por tanque no inventa ceros", () => {
    const a = avisoSurtida({ ...base, liters_tanque1: null, liters_tanque2: null }, { truck_plate: "GTP 4325" });
    expect(a.body).not.toContain("T1");
    expect(a.body.split("\n")[0]).toBe("300 L");
  });

  it("un chorro se distingue de un llenado", () => {
    const a = avisoSurtida({ ...base, is_full: false }, { truck_plate: "GTP 4325" });
    expect(a.body).toContain("chorro");
  });

  it("si el tramo cerró, el rendimiento va en el aviso", () => {
    const a = avisoSurtida(base, { truck_plate: "GTP 4325" }, { segment_kml: 2.8 });
    expect(a.body).toContain("2.8 km/L");
  });

  it("dos surtidas seguidas no se pisan en el celular", () => {
    const uno = avisoSurtida({ ...base, id: 7 }, {});
    const dos = avisoSurtida({ ...base, id: 8 }, {});
    expect(uno.tag).not.toBe(dos.tag);
  });
});

/**
 * La alerta iba a marcar TODOS los camiones el primer mes que corriera.
 *
 * La cuenta comparaba dos cosas que no son comparables: los kilómetros entre las dos fotos
 * del tacógrafo —sacadas cualquier día— contra los viajes del MES CALENDARIO. Como las fotos
 * nunca se sacan el 1° a las 00:00 (la línea base sembrada es del 20 de agosto), siempre
 * sobran o faltan días. Para un camión de ruta son miles de kilómetros contra un umbral de
 * 150: la pantalla que el cliente pidió para estar tranquilo iba a estar en rojo siempre.
 *
 * Y el otro lado del mismo problema: un viaje sin kilómetros cargados sumaba 0, así que
 * cuanto más viajes se registraban, peor pintaba el camión.
 */
describe("la ventana que se compara", () => {
  const viajeEn = (dia: string, km: number | null, estimado = false) => ({
    kilometros: km,
    vacio: false,
    estimado,
  });

  it("sólo cuenta los viajes que caen entre las dos fotos", () => {
    const a = auditoriaKilometros(
      "2026-08",
      lectura(105_000, "2026-08-20 10:00:00"),
      lectura(100_000, "2026-07-18 09:00:00"),
      // Quien llama ya filtró por la ventana: la cuenta sólo tiene que respetarla.
      [viajeEn("2026-07-20", 2_000), viajeEn("2026-08-15", 3_000)],
    );
    expect(a.km_periodo).toBe(5_000);
    expect(a.km_cargados).toBe(5_000);
    expect(a.km_sin_justificar).toBe(0);
    expect(a.desde).toBe("2026-07-18 09:00:00");
    expect(a.hasta).toBe("2026-08-20 10:00:00");
  });

  it("un viaje con kilómetros estimados cuenta igual, pero se dice", () => {
    const a = auditoriaKilometros(
      "2026-08",
      lectura(105_000, "2026-08-20"),
      lectura(100_000, "2026-07-18"),
      [viajeEn("2026-08-01", 2_000), viajeEn("2026-08-10", 3_000, true)],
    );
    expect(a.km_cargados).toBe(5_000);
    expect(a.viajes_estimados).toBe(1);
    expect(a.viajes_sin_km).toBe(0);
    expect(senalKilometros(a).nivel).toBe("ok");
  });

  it("el que no se pudo estimar sigue contándose aparte y no se inventa", () => {
    const a = auditoriaKilometros(
      "2026-08",
      lectura(105_000, "2026-08-20"),
      lectura(100_000, "2026-07-18"),
      [viajeEn("2026-08-01", 2_000), viajeEn("2026-08-10", null)],
    );
    expect(a.km_cargados).toBe(2_000);
    expect(a.viajes_sin_km).toBe(1);
    expect(a.viajes_estimados).toBe(0);
  });

  it("cuando hay estimados, la señal lo aclara para que nadie lea el número como exacto", () => {
    const a = auditoriaKilometros(
      "2026-08",
      lectura(110_000, "2026-08-20"),
      lectura(100_000, "2026-07-18"),
      [viajeEn("2026-08-01", 2_000, true)],
    );
    expect(senalKilometros(a).nivel).toBe("revisar");
    expect(senalKilometros(a).motivo).toContain("estimado");
  });
});
