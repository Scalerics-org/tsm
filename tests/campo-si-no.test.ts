import { describe, expect, it } from "vitest";
import { cabeceraCorregida } from "../api/lib/cabecera-viaje";
import { FIELD_STAGE, FIELD_TYPE, SI_NO, campoSiNoInvalido, esValorSiNo, type TemplateField } from "@shared/domain";
import { valoresDeRuta } from "@shared/en-ruta";

/**
 * El campo Sí/No ("Sobrepeso" de la zafra de arroz). Se guarda como el texto que se lee, "Sí" o "No", así el Excel, el
 * resumen y la ficha no traducen nada. Vacío es "sin elegir": para un obligatorio, falta.
 */

const sobrepeso: TemplateField = {
  key: "sobrepeso",
  label: "Sobrepeso",
  type: FIELD_TYPE.SI_NO,
  required: true,
  stage: FIELD_STAGE.DESCARGA,
};

describe("los valores de un campo Sí/No", () => {
  it("sólo valen «Sí» y «No»", () => {
    expect(esValorSiNo(SI_NO.SI)).toBe(true);
    expect(esValorSiNo(SI_NO.NO)).toBe(true);
    for (const raro of ["si", "SI", "true", "false", "1", "", null, undefined, true]) expect(esValorSiNo(raro)).toBe(false);
  });

  it("el cierre detecta un valor que no salió de los dos botones", () => {
    expect(campoSiNoInvalido({ fields: [sobrepeso] }, FIELD_STAGE.DESCARGA, { sobrepeso: "true" })).toBe("Sobrepeso");
    expect(campoSiNoInvalido({ fields: [sobrepeso] }, FIELD_STAGE.DESCARGA, { sobrepeso: "Sí" })).toBeNull();
    // Sin elegir no es «inválido»: de eso se ocupa `missingField` si es obligatorio.
    expect(campoSiNoInvalido({ fields: [sobrepeso] }, FIELD_STAGE.DESCARGA, {})).toBeNull();
    // Otra etapa no se mira.
    expect(campoSiNoInvalido({ fields: [sobrepeso] }, FIELD_STAGE.CARGA, { sobrepeso: "true" })).toBeNull();
  });
});

describe("en el camino (el puente)", () => {
  const deRuta: TemplateField = { ...sobrepeso, stage: FIELD_STAGE.RUTA };

  it("acepta Sí / No y rechaza lo demás", () => {
    expect(valoresDeRuta([deRuta], { sobrepeso: "No" })).toEqual({ values: { sobrepeso: "No" } });
    expect(valoresDeRuta([deRuta], { sobrepeso: "true" })).toEqual({ error: "Sobrepeso: elegí Sí o No" });
  });
});

describe("la corrección de la oficina", () => {
  const viaje: any = {
    id: 1,
    status: "COMPLETADO",
    driver_id: 1,
    truck_id: 1,
    origin: "Puesto",
    destination: "Salto",
    destinatario: null,
    kilometros: 160,
    kilos_carga: 1000,
    notes: null,
    field_values: { sobrepeso: "No" },
    started_at: "2026-02-03 10:00:00",
    salida_desde: null,
  };
  const contexto = { campos: [{ key: "sobrepeso", type: "si_no", required: true, label: "Sobrepeso" }] };
  const corregir = (valor: string) =>
    cabeceraCorregida(viaje, { driver_id: 1, truck_id: 1, campos: { sobrepeso: valor } } as any, null, contexto);

  it("cambia de No a Sí", () => {
    const r = corregir("Sí") as any;
    expect(r.patch?.field_values).toMatchObject({ sobrepeso: "Sí" });
  });

  it("rechaza un valor que no es Sí ni No", () => {
    expect(corregir("true")).toEqual({ error: "Sobrepeso: elegí Sí o No." });
  });

  it("un obligatorio no se deja vacío", () => {
    expect(corregir("")).toEqual({ error: "Sobrepeso no puede quedar vacío." });
  });
});
