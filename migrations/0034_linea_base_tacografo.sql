-- La línea de base del tacógrafo: la lectura de agosto de 2026, puesta por la oficina.
--
-- El bloqueo del 1 de cada mes mira SÓLO el mes en curso. Sin esta fila, el día que se
-- despliega (20 de agosto) los cinco camiones quedan sin lectura de agosto y ningún chofer
-- puede empezar un viaje hasta parar y sacar la foto — incluido el que está en ruta ahora.
-- Con ella, agosto queda cubierto y el bloqueo arranca limpio el 1 de setiembre, que es como
-- lo describió el cliente ("el día 1 o 31 exigirle una foto del tacógrafo").
--
-- EL NÚMERO ES EL DEL SISTEMA, NO UNA FOTO. Sale de `trucks.odometer_km`, que es el
-- kilometraje que el propio cliente cargó camión por camión. Por eso va sin `r2_key` (no hay
-- foto que mostrar) y sin `driver_id` (no la sacó ningún chofer): las dos columnas en NULL
-- son la marca de que esta lectura es una línea de base y no evidencia.
--
-- NO se usa la surtida más alta, que sería el otro candidato. GTP 4325 tiene una surtida de
-- prueba de 397.000 km contra un odómetro de 140.076: tomarla haría que el primer mes de
-- auditoría diera un disparate. Se prefiere el número que cargó él.
--
-- Efecto conocido y acotado: GTP 4384 tiene una surtida en 395.705 y el odómetro en 391.567,
-- así que su primer mes va a mostrar de más los ~4.000 km que ya había andado. Se corrige
-- solo en setiembre, cuando los dos extremos ya sean lecturas reales.
--
-- El camión de prueba (odómetro en 0) queda afuera: sembrarle un cero haría aparecer todo su
-- kilometraje real como "sin justificar" el primer mes que se use de verdad.
INSERT INTO lecturas_odometro (truck_id, periodo, kilometraje, r2_key, driver_id, tomada_at)
SELECT t.id, '2026-08', t.odometer_km, NULL, NULL, '2026-08-20 00:00:00'
FROM trucks t
WHERE t.odometer_km > 0
  AND NOT EXISTS (
    SELECT 1 FROM lecturas_odometro l WHERE l.truck_id = t.id AND l.periodo = '2026-08'
  );
