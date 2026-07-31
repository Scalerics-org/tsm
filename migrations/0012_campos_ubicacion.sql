-- Modos de campo por plantilla: cada parte del viaje (origen, remitente, destino,
-- destinatario) puede ser 'fijo' (lo define la oficina) o 'libreta' (el chofer elige
-- de la lista curada, y puede dar de alta si permite_alta).
--
-- Va en una sola columna JSON y NULL = comportamiento actual, así las plantillas que
-- ya existen (Casarone, Nayna, Molino) siguen funcionando sin tocarlas.
ALTER TABLE trip_templates ADD COLUMN campos_ubicacion TEXT;
