-- Km fijos y orden de las plantillas (zafra de arroz, 19/10/2026). Aditiva: dos columnas nuevas que quedan en NULL.
--
-- km_fijos: los km que el cliente da por buenos para el viaje de esa plantilla. Al cerrar, si nadie cargó los km reales,
--           el viaje toma éstos en vez de la estimación entre ciudades (que no conoce B. Brum, Patitas ni Puesto).
-- orden:    el lugar de la plantilla dentro de su cliente. Las que lo tienen van primero, por orden; las demás,
--           alfabéticas como siempre.
--
-- NULL = como hasta hoy: ninguna plantilla existente cambia ni de km ni de lugar.

ALTER TABLE trip_templates ADD COLUMN km_fijos INTEGER;
ALTER TABLE trip_templates ADD COLUMN orden INTEGER;
