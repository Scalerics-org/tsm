import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { aplicar, baseReal } from "./helpers/d1-real";

/**
 * La migración 0056 le pone clase a lo que Rodrigo ya cargó en producción, mirando el "Tipo" de
 * texto libre. Los textos de abajo son los REALES (con sus errores de tipeo): si la migración los
 * clasifica mal, un remolque sigue saliéndole al chofer en la lista de camiones.
 */

const REALES: [tipo: string, clase: string][] = [
  ["099-REMOLQUE", "remolque"],
  ["03-SEMIREMOLQUE", "remolque"],
  ["099-SEMIREMOLQUE", "remolque"],
  ["099- EMIREMOLQUE-S48 FURGON", "remolque"],
  ["03-SEMIRREMOLQUE 2 EJES", "remolque"],
  ["Sorra doble", "remolque"],
  ["ACOPLADO 3 EJES", "remolque"],
  ["acoplado", "remolque"],
  ["Montacargas Hyster", "montacargas"],
  ["MONTACARGA", "montacargas"],
  ["N2-CAMION", "camion"],
  ["N99-CAMION", "camion"],
  ["TRACTOR DOBLE EJE", "camion"],
  ["Tractor DOBLE EJE", "camion"],
  ["CAMION DOBLE EJE", "camion"],
  ["", "camion"],
  ["Tolva", "camion"],
];

let base: Awaited<ReturnType<typeof baseReal>>;

beforeAll(async () => {
  // Hasta la anterior: las filas se cargan como estaban en producción, ANTES de la columna.
  base = await baseReal("0055_facturacion_por_cliente.sql");
  for (const [i, [tipo]] of REALES.entries()) {
    await base.db
      .prepare("INSERT INTO trucks (plate, brand, model, year, type, capacity_kg, odometer_km, avg_km_litro, status) VALUES (?, '', '', 0, ?, 0, 0, 0, 'disponible')")
      .bind(`T${i}`, tipo)
      .run();
  }
  await aplicar(base.db, "0056_clase_de_vehiculo.sql");
}, 120_000);

afterAll(async () => {
  await base?.cerrar();
});

describe("migración 0056: la clase sale del Tipo", () => {
  it.each(REALES)("«%s» queda como %s", async (tipo, clase) => {
    const fila = await base.db
      .prepare("SELECT clase FROM trucks WHERE type = ? LIMIT 1")
      .bind(tipo)
      .first<{ clase: string }>();
    expect(fila?.clase).toBe(clase);
  });

  it("un camión nuevo sin clase queda como camión (el valor por defecto)", async () => {
    await base.db
      .prepare("INSERT INTO trucks (plate, brand, model, year, type, capacity_kg, odometer_km, avg_km_litro, status) VALUES ('NUEVO', '', '', 0, 'Tolva', 0, 0, 0, 'disponible')")
      .run();
    const fila = await base.db.prepare("SELECT clase FROM trucks WHERE plate = 'NUEVO'").first<{ clase: string }>();
    expect(fila?.clase).toBe("camion");
  });
});
