-- Cuándo la oficina tocó el odómetro del camión.
--
-- "Edité el odómetro del camión 4384 y cuando fui a registrar una surtida no se actualizó el
-- tacógrafo." La oficina había puesto 390.000 y la pantalla del chofer seguía mostrando los
-- 395.705 de la surtida del 18, porque el odómetro del camión sólo se miraba cuando el camión
-- no tenía NINGUNA surtida.
--
-- La regla pasa a ser la recencia: gana lo último que alguien dijo del tacógrafo, sea una
-- surtida o la oficina. Para eso hace falta saber cuándo lo dijo la oficina, y en `trucks` no
-- había ninguna fecha.
ALTER TABLE trucks ADD COLUMN odometer_at TEXT;

-- Sembrado de los camiones que ya existen.
--
-- NULL significa "nadie lo editó": con eso el camión se comporta como hasta hoy y manda la
-- surtida. Así que se le pone fecha SÓLO a los camiones donde se puede demostrar que el
-- número lo puso la oficina, y eso se sabe mirando la propia base: al registrar una surtida,
-- `createFuelLog` hace `odometer_km = MAX(odometer_km, nueva)`. O sea que el odómetro del
-- camión nunca queda por debajo de su surtida más alta... salvo que la oficina lo haya bajado
-- a mano después. Y si quedó por encima, tampoco lo puso una surtida.
--
-- En criollo: si el odómetro del camión NO coincide con su surtida más alta, es porque lo
-- escribió una persona. Esos son los que arrancan con fecha.
--
-- En producción son tres, y en los tres la oficina tiene razón:
--   GTP 4325  odómetro 140.076  vs surtida de prueba 397.000
--   GTP 4382  odómetro 354.537  vs surtida del sembrado de demo 98.700
--   GTP 4384  odómetro 390.000  vs surtida del 18/08 395.705   <- el caso que reportó
UPDATE trucks
   SET odometer_at = datetime('now')
 WHERE odometer_km > 0
   AND odometer_km <> COALESCE((SELECT MAX(f.odometer_km) FROM fuel_logs f WHERE f.truck_id = trucks.id), -1);
