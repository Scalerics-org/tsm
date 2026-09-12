import { describe, it, expect } from "vitest";
import { quienEntra, type CandidatoChofer } from "../api/lib/ingreso-chofer";

/**
 * Quién entra cuando se teclea una patente y un PIN.
 *
 * Antes la consulta traía UNA sola fila —`findDriverByPlate` con `.first()` y filtro
 * `status='activo'`— y de ahí salían dos problemas:
 *
 *   - Dos choferes activos en el mismo camión: la fila que volvía era una cualquiera (no hay
 *     ORDER BY), así que uno de los dos no podía entrar y leía "Patente o PIN incorrectos".
 *   - Un chofer dado de baja leía lo mismo, y cada intento suyo contaba para el bloqueo de la
 *     patente (5 fallos, 15 minutos), que también deja afuera al chofer activo del camión.
 */

const activo = (id: number, pin: string): CandidatoChofer => ({ id, status: "activo", pin_hash: `hash:${pin}` });
const inactivo = (id: number, pin: string): CandidatoChofer => ({ id, status: "inactivo", pin_hash: `hash:${pin}` });

/** Verificador de mentira: el hash es "hash:" + el PIN. */
const verificarCon = (pin: string) => async (hash: string) => hash === `hash:${pin}`;

describe("quién entra con esta patente y este PIN", () => {
  it("el chofer activo cuyo PIN coincide", async () => {
    const r = await quienEntra([activo(6, "1234")], verificarCon("1234"));
    expect(r).toEqual({ tipo: "entra", id: 6 });
  });

  it("con el PIN equivocado no entra nadie", async () => {
    expect(await quienEntra([activo(6, "1234")], verificarCon("9999"))).toEqual({ tipo: "no" });
  });

  it("si el camión tiene dos choferes activos, entra el del PIN, no el primero de la lista", async () => {
    const r = await quienEntra([activo(6, "1111"), activo(7, "2222")], verificarCon("2222"));
    expect(r).toEqual({ tipo: "entra", id: 7 });
  });

  it("el dado de baja no entra, pero se lo dice: no es un PIN equivocado", async () => {
    const r = await quienEntra([inactivo(2, "1234")], verificarCon("1234"));
    expect(r).toEqual({ tipo: "inactivo", id: 2 });
  });

  it("el activo manda aunque comparta el PIN con uno dado de baja", async () => {
    const r = await quienEntra([activo(6, "1234"), inactivo(2, "1234")], verificarCon("1234"));
    expect(r).toEqual({ tipo: "entra", id: 6 });
  });

  it("una patente sin ningún chofer es 'no', igual que un PIN equivocado: no se cuenta de más", async () => {
    expect(await quienEntra([], verificarCon("1234"))).toEqual({ tipo: "no" });
  });

  it("un chofer sin PIN puesto nunca entra, aunque el hash esté vacío", async () => {
    const sinPin: CandidatoChofer = { id: 9, status: "activo", pin_hash: null };
    expect(await quienEntra([sinPin], async () => true)).toEqual({ tipo: "no" });
  });
});
