-- "Remite" (quién remite/carga) como dato de la plantilla y del viaje.
-- Ej: cliente Nayna, remite Saman.
ALTER TABLE trip_templates ADD COLUMN remite TEXT;
ALTER TABLE trips ADD COLUMN remite TEXT;
