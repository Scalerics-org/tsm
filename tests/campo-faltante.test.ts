import { describe, it, expect } from "vitest";
import { missingField, grupoIncompleto, FIELD_STAGE, type TripTemplate } from "@shared/domain";

/**
 * El campo obligatorio que falta, con la misma regla en el servidor y en la oficina.
 *
 * El "Nuevo viaje" de oficina mandaba los campos de la plantilla vacíos, y el servidor exige
 * los obligatorios de la carga: todo viaje de Cañuelas (hoja de ruta y pallets) se rebotaba
 * con "Falta: …". El cliente terminaba cargando los viajes atrasados entrando como chofer,
 * donde no puede dar de alta clientes y la fecha queda la del día que lo carga.
 *
 * `missingField` pasó a `shared/` para que el formulario valide con la MISMA función que el
 * servidor: si la pantalla usara una regla propia, podría dejar pasar algo que después se
 * rechaza.
 */

const CANUELAS = {
  fields: [
    { key: "hoja_ruta", label: "N° hoja de ruta", type: "texto", stage: "carga", required: true },
    { key: "pallets", label: "Cantidad de pallets", type: "numero", stage: "carga", required: true },
    { key: "obs", label: "Observación de entrega", type: "texto", stage: "llegada", required: true },
    { key: "extra", label: "Dato opcional", type: "texto", stage: "carga", required: false },
  ],
} as unknown as Pick<TripTemplate, "fields">;

describe("qué campo obligatorio falta", () => {
  it("con los de carga completos no falta nada", () => {
    expect(missingField(CANUELAS, FIELD_STAGE.CARGA, { hoja_ruta: "59667", pallets: "23" })).toBeNull();
  });

  it("devuelve el primero que falta, con su nombre, para decírselo a la oficina", () => {
    expect(missingField(CANUELAS, FIELD_STAGE.CARGA, {})).toBe("N° hoja de ruta");
    expect(missingField(CANUELAS, FIELD_STAGE.CARGA, { hoja_ruta: "59667" })).toBe("Cantidad de pallets");
  });

  it("un campo con espacios cuenta como vacío", () => {
    expect(missingField(CANUELAS, FIELD_STAGE.CARGA, { hoja_ruta: "   ", pallets: "23" })).toBe("N° hoja de ruta");
  });

  it("sólo mira la etapa que se le pide: al crear no exige los de llegada", () => {
    // El viaje de oficina nace cerrado y el servidor sólo exige los de carga. Si exigiera
    // también los de llegada, un viaje viejo sin esos datos no se podría cargar nunca.
    expect(missingField(CANUELAS, FIELD_STAGE.CARGA, { hoja_ruta: "59667", pallets: "23" })).toBeNull();
    expect(missingField(CANUELAS, "llegada", {})).toBe("Observación de entrega");
  });

  it("los opcionales no se exigen nunca", () => {
    expect(missingField(CANUELAS, FIELD_STAGE.CARGA, { hoja_ruta: "1", pallets: "2" })).toBeNull();
  });
});

/**
 * "Alcanza con uno": dos campos de la misma etapa con el mismo `requiere_uno_de`. Ninguno se
 * exige solo (ver el guard en `missingField`); lo exige el grupo entero.
 */
const CON_GRUPO = {
  fields: [
    { key: "pallets", label: "Cantidad de pallets", type: "numero", stage: "carga", required: true, requiere_uno_de: "pallets" },
    { key: "pallets_logi", label: "Pallets de Logipark", type: "numero", stage: "carga", required: true, requiere_uno_de: "pallets" },
    { key: "hoja_ruta", label: "N° hoja de ruta", type: "texto", stage: "carga", required: true },
  ],
} as unknown as Pick<TripTemplate, "fields">;

describe("grupoIncompleto", () => {
  it("con los dos vacíos, falta el grupo: dice los dos nombres, no 'Falta: <uno>'", () => {
    expect(grupoIncompleto(CON_GRUPO, FIELD_STAGE.CARGA, { hoja_ruta: "1" })).toBe(
      "Completá uno de estos: Cantidad de pallets o Pallets de Logipark.",
    );
  });

  it("con cualquiera de los dos completo, el grupo está bien", () => {
    expect(grupoIncompleto(CON_GRUPO, FIELD_STAGE.CARGA, { pallets: "5" })).toBeNull();
    expect(grupoIncompleto(CON_GRUPO, FIELD_STAGE.CARGA, { pallets_logi: "5" })).toBeNull();
  });

  it("sin ningún campo agrupado en la plantilla, no hay nada que exigir", () => {
    expect(grupoIncompleto(CANUELAS, FIELD_STAGE.CARGA, {})).toBeNull();
  });

  it("un campo agrupado no cuenta como 'required' individual: missingField lo salta", () => {
    // Los dos required:true y vacíos — si missingField no supiera de requiere_uno_de, pediría
    // "Falta: Cantidad de pallets" antes de llegar a grupoIncompleto, y el 0 de relleno volvería.
    expect(missingField(CON_GRUPO, FIELD_STAGE.CARGA, {})).toBe("N° hoja de ruta");
    expect(missingField(CON_GRUPO, FIELD_STAGE.CARGA, { hoja_ruta: "1" })).toBeNull();
  });

  it("sólo mira la etapa que se le pide", () => {
    const otraEtapa = {
      fields: [
        { key: "a", label: "A", type: "texto", stage: "carga", required: true, requiere_uno_de: "g" },
        { key: "b", label: "B", type: "texto", stage: "descarga", required: true, requiere_uno_de: "g" },
      ],
    } as unknown as Pick<TripTemplate, "fields">;
    // Cada etapa mira sólo sus propios campos: un grupo repartido entre dos etapas no se
    // completa nunca desde ninguna de las dos por separado. Queda documentado, no resuelto acá.
    expect(grupoIncompleto(otraEtapa, FIELD_STAGE.CARGA, {})).toBe("Completá uno de estos: A.");
  });
});
