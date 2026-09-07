import { describe, it, expect } from "vitest";
import { SQL_FOTOS_DEL_VIAJE } from "../api/repos/photos";

/**
 * Las fotos de un viaje salen SIEMPRE en el mismo orden.
 *
 * `taken_at` se guarda con precisión de segundo (`new Date().toISOString().slice(0,19)`), así
 * que dos fotos disparadas seguidas caen en el mismo valor. Ordenar sólo por ahí deja el
 * empate librado a lo que decida SQLite, y el orden puede cambiar entre dos consultas de la
 * misma foto. Con una foto por viaje no se notaba; con las cuatro hojas de una hoja de ruta
 * —que es justo lo que el cliente pidió poder sacar— la oficina no puede saber cuál es la
 * página 1.
 *
 * El desempate tiene que ser por una columna única y creciente, y `id` es la única que hay.
 */
describe("el orden de las fotos del viaje", () => {
  const orden = SQL_FOTOS_DEL_VIAJE.slice(SQL_FOTOS_DEL_VIAJE.toUpperCase().lastIndexOf("ORDER BY") + 8)
    .split(",")
    .map((c) => c.trim().toLowerCase());

  it("va por cuándo se sacó la foto, no por cuándo se subió", () => {
    expect(orden[0]).toMatch(/^taken_at\b/);
  });

  it("y desempata, porque el segundo no alcanza para separar dos fotos seguidas", () => {
    expect(orden.length).toBeGreaterThan(1);
    expect(orden[orden.length - 1]).toMatch(/^id\b/);
  });
});
