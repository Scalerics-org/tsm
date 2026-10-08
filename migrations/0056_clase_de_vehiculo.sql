-- La clase de cada vehículo: camión, remolque o montacargas.
--
-- Rodrigo cargó en Camiones sus remolques y semirremolques junto con los camiones, y la tabla no
-- distingue: el "Tipo" es texto libre. Los remolques salían en la lista del chofer para elegir con
-- qué salir de viaje, y en Control con 0 km y 0,00 km/L.
--
-- Aditiva: una columna con valor por defecto, sin rehacer la tabla (en D1 rehacerla es delicado).
-- Todo lo que ya existe queda 'camion' y después se corrige por el Tipo; lo que se cargue de ahora
-- en más lo elige la oficina en el alta.
--
-- LIKE no distingue mayúsculas en SQLite, y `%REMOLQUE%` cubre los tipeos reales de producción:
-- REMOLQUE, SEMIREMOLQUE, SEMIRREMOLQUE y EMIREMOLQUE (sin la S).
ALTER TABLE trucks ADD COLUMN clase TEXT NOT NULL DEFAULT 'camion';

UPDATE trucks SET clase = 'remolque'
 WHERE type LIKE '%REMOLQUE%' OR type LIKE '%SORRA%' OR type LIKE '%ACOPLADO%';

UPDATE trucks SET clase = 'montacargas'
 WHERE clase = 'camion' AND type LIKE '%MONTACARGA%';
-- Va ANTES que el código en el deploy: los SELECT ya filtran por `clase`.
