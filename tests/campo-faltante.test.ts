import { describe, it, expect } from "vitest";
import { missingField, FIELD_STAGE, type TripTemplate } from "@shared/domain";

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
