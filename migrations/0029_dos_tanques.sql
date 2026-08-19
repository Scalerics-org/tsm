-- Los dos tanques de gasoil, y quién corrigió una surtida.
--
-- "En parte de litros de gas oil. Las 3 ventanas. (gas oil tanque 1 + gas oil tanque 2,
-- litros totales)." — los camiones cargan en dos tanques y el chofer los anota por separado.
--
-- `liters` SIGUE SIENDO EL TOTAL y no se toca: de ahí sale todo el cálculo de consumo, y las
-- surtidas ya cargadas (8 en producción) quedan válidas sin tener que rellenar nada. Los dos
-- campos nuevos son el desglose, y por eso admiten NULL: en las viejas no se sabe cómo se
-- repartió, y en las nuevas puede haberse cargado un solo tanque.
--
-- El total NO se tipea: se calcula sumando los dos. Un total escrito a mano que no coincida
-- con la suma deja el consumo mintiendo y no hay forma de saber cuál de los tres está bien.
ALTER TABLE fuel_logs ADD COLUMN liters_tanque1 REAL;
ALTER TABLE fuel_logs ADD COLUMN liters_tanque2 REAL;

-- Rastro de la corrección desde oficina. Corregir los km de una surtida vieja recalcula el
-- consumo de ese mes y de los siguientes, así que tiene que quedar quién lo hizo y cuándo.
ALTER TABLE fuel_logs ADD COLUMN edited_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE fuel_logs ADD COLUMN edited_at TEXT;
