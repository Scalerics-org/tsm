import { describe, it, expect } from "vitest";
import { cabeceraCorregida } from "../api/lib/cabecera-viaje";
import type { Trip } from "@shared/domain";

/**
 * Corregir la cabecera de un viaje desde oficina.
 *
 * "Borrar viajes o agregar viajes desde oficina, para posibles correcciones." Faltaba el
 * caso del medio: el viaje que está bien cargado salvo un dato. Lo que se prueba acá es lo
 * que no se ve en la pantalla — que un pedido incompleto no borre lo que no menciona, y que
 * los kilos queden diciendo lo mismo en los dos lados donde están guardados.
 */

function viaje(p: Partial<Trip> = {}): Trip {
  return {
    id: 7,
    template_id: 1,
    provider_name: "Casarone",
    origin: "Artigas",
    remite: "Casarone",
    destination: "Montevideo",
    destinatario: "Tifecom",
    driver_id: 1,
    truck_id: 1,
    cargo_type: "Arroz",
    kilos_carga: 28070,
    field_values: { remito: "113430", kilos: "28070" },
    status: "COMPLETADO",
    started_at: "2026-08-18 07:30:00",
    finished_at: "2026-08-18 19:10:00",
    notes: "Sin novedad",
    created_at: "2026-08-18 07:30:00",
    segments: [],
    kilometros: 627,
    edited_by: null,
    edited_at: null,
    driver_name: "Carlos Méndez",
    truck_plate: "STZ 4821",
    ...p,
  } as Trip;
}

const patchDe = (r: ReturnType<typeof cabeceraCorregida>) => {
  if ("error" in r) throw new Error(`esperaba un patch y vino: ${r.error}`);
  return r.patch;
};

describe("cabeceraCorregida", () => {
  it("corrige sólo lo que viene y deja el resto como estaba", () => {
    const p = patchDe(cabeceraCorregida(viaje(), { destinatario: "TGM" }, null));
    expect(p.destinatario).toBe("TGM");
    expect(p.origin).toBe("Artigas");
    expect(p.notes).toBe("Sin novedad");
    expect(p.kilometros).toBe(627);
  });

  it("un campo de texto vacío borra ese dato, pero no vacía los demás", () => {
    const p = patchDe(cabeceraCorregida(viaje(), { notes: "  " }, null));
    expect(p.notes).toBeNull();
    expect(p.destinatario).toBe("Tifecom");
  });

  it("no deja el viaje sin origen, sin destino ni sin tipo de carga", () => {
    expect(cabeceraCorregida(viaje(), { origin: " " }, null)).toEqual({
      error: "El origen no puede quedar vacío.",
    });
    expect(cabeceraCorregida(viaje(), { destination: "" }, null)).toEqual({
      error: "El destino no puede quedar vacío.",
    });
    expect(cabeceraCorregida(viaje(), { cargo_type: "" }, null)).toEqual({
      error: "El tipo de carga no puede quedar vacío.",
    });
  });

  it("los kilómetros se pueden borrar, pero no pueden ser cualquier cosa", () => {
    expect(patchDe(cabeceraCorregida(viaje(), { kilometros: "" }, null)).kilometros).toBeNull();
    expect(patchDe(cabeceraCorregida(viaje(), { kilometros: "700" }, null)).kilometros).toBe(700);
    expect("error" in cabeceraCorregida(viaje(), { kilometros: "seiscientos" }, null)).toBe(true);
    // Un kilometraje negativo descuadraría la auditoría del mes sin que nadie lo vea.
    expect("error" in cabeceraCorregida(viaje(), { kilometros: -5 }, null)).toBe(true);
  });

  /**
   * Los kilos están en la columna `kilos` (la que suman los reportes) Y en el campo de peso
   * de la plantilla (el que sale en el Excel). Escribir uno solo deja el mismo viaje con dos
   * pesos distintos, uno al lado del otro en el mismo archivo.
   */
  it("corregir los kilos actualiza también el campo de peso de la plantilla", () => {
    const p = patchDe(cabeceraCorregida(viaje(), { kilos_carga: 31000 }, "kilos"));
    expect(p.kilos_carga).toBe(31000);
    expect(p.field_values.kilos).toBe("31000");
    // Y no se lleva puesto el resto de los campos de la plantilla.
    expect(p.field_values.remito).toBe("113430");
  });

  it("borrar los kilos borra el campo de peso, no lo deja con el valor viejo", () => {
    const p = patchDe(cabeceraCorregida(viaje(), { kilos_carga: null }, "kilos"));
    expect(p.kilos_carga).toBeNull();
    expect(p.field_values.kilos).toBeUndefined();
  });

  it("si la plantilla no tiene campo de peso, los campos no se tocan", () => {
    const p = patchDe(cabeceraCorregida(viaje(), { kilos_carga: 31000 }, null));
    expect(p.field_values).toEqual({ remito: "113430", kilos: "28070" });
  });

  it("un pedido que no habla de kilos no le toca el campo de peso", () => {
    const p = patchDe(cabeceraCorregida(viaje(), { destination: "Rivera" }, "kilos"));
    expect(p.field_values.kilos).toBe("28070");
  });

  it("el chofer y el camión tienen que ser un id, no un texto suelto", () => {
    expect("error" in cabeceraCorregida(viaje(), { driver_id: "" }, null)).toBe(true);
    expect("error" in cabeceraCorregida(viaje(), { truck_id: 0 }, null)).toBe(true);
    expect(patchDe(cabeceraCorregida(viaje(), { driver_id: "3" }, null)).driver_id).toBe(3);
  });

  it("un pedido vacío no cambia nada", () => {
    const t = viaje();
    const p = patchDe(cabeceraCorregida(t, {}, "kilos"));
    expect(p).toEqual({
      origin: t.origin,
      remite: t.remite,
      destination: t.destination,
      destinatario: t.destinatario,
      cargo_type: t.cargo_type,
      kilos_carga: t.kilos_carga,
      kilometros: t.kilometros,
      notes: t.notes,
      driver_id: t.driver_id,
      truck_id: t.truck_id,
      field_values: t.field_values,
    });
  });
});

/**
 * "Donde corrijo los viajes no tengo la opción de corregir el nro de remito." — Rodrigo,
 * 19/9/2026. Los campos propios de la plantilla (remito, remito empresa, N° de MIC…) viven en
 * `field_values` y la corrección de cabecera no los tocaba.
 */
describe("cabeceraCorregida — campos de la plantilla", () => {
  const campos = [
    { key: "remito", type: "texto" as const },
    { key: "nro_mic", type: "numero" as const },
  ];

  it("corrige el remito y deja el resto como estaba", () => {
    const p = patchDe(cabeceraCorregida(viaje(), { campos: { remito: "999" } }, "kilos", { campos }));
    expect(p.field_values).toEqual({ remito: "999", kilos: "28070" });
  });

  it("vaciar un campo lo saca", () => {
    const p = patchDe(cabeceraCorregida(viaje(), { campos: { remito: "  " } }, "kilos", { campos }));
    expect(p.field_values).toEqual({ kilos: "28070" });
  });

  it("un campo numérico con letras se rechaza", () => {
    expect("error" in cabeceraCorregida(viaje(), { campos: { nro_mic: "abc" } }, "kilos", { campos })).toBe(true);
  });

  it("una key que no es de la plantilla no entra, ni el peso por la puerta de atrás", () => {
    const p = patchDe(cabeceraCorregida(viaje(), { campos: { inventado: "x", kilos: "1" } }, "kilos", { campos }));
    expect(p.field_values).toEqual({ remito: "113430", kilos: "28070" });
  });
});

describe("cabeceraCorregida — campos de la plantilla, lo que encontró la revisión", () => {
  const campos = [
    { key: "remito", type: "texto", required: true, label: "Remito" },
    { key: "nota", type: "texto" },
    { key: "peso_extra", type: "numero" },
  ];

  it("un número con coma se guarda con punto: el resumen lo suma con Number()", () => {
    const p = patchDe(cabeceraCorregida(viaje(), { campos: { peso_extra: "31,21" } }, "kilos", { campos }));
    expect(p.field_values.peso_extra).toBe("31.21");
  });

  it("un campo obligatorio no se vacía", () => {
    expect(cabeceraCorregida(viaje(), { campos: { remito: "" } }, "kilos", { campos })).toEqual({
      error: "Remito no puede quedar vacío.",
    });
  });

  it("con el viaje en curso no se tocan: el chofer los está cargando", () => {
    const r = cabeceraCorregida(viaje({ status: "EN_CURSO" } as any), { campos: { nota: "x" } }, "kilos", { campos });
    expect("error" in r).toBe(true);
  });

  it("mandar lo mismo que ya tenía, con el viaje en curso, no molesta", () => {
    const r = cabeceraCorregida(viaje({ status: "EN_CURSO" } as any), { campos: { remito: "113430" } }, "kilos", { campos });
    expect("error" in r).toBe(false);
  });
});
