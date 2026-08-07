-- Renglones: un viaje puede tener varias cargas, cada una con su lugar de carga,
-- sus clientes y su cantidad. Es la unidad facturable (una fila del Excel del cliente).
--
-- Va como JSON en trips.segments: el contenido de un renglón lo define la plantilla
-- (renglon_campos), así que una columna por campo no serviría.
ALTER TABLE trips ADD COLUMN segments TEXT;

-- Auditoría de correcciones desde oficina sobre viajes ya cerrados.
ALTER TABLE trips ADD COLUMN edited_by INTEGER;
ALTER TABLE trips ADD COLUMN edited_at TEXT;

-- Kilómetros del recorrido (Efe Roig los pide en todos sus viajes).
ALTER TABLE trips ADD COLUMN kilometros REAL;

-- Configuración por plantilla:
--   multi_renglon      1 = el chofer agrega cargas; 0 = viaje de un solo tramo
--   renglones_fijos    JSON con renglones precargados (ida y vuelta de Manassi)
--   pide_kilometros    1 = pedir kilómetros al cerrar
--   viaje_vacio        1 = viaje sin carga (retornos de Efe Roig)
ALTER TABLE trip_templates ADD COLUMN multi_renglon INTEGER NOT NULL DEFAULT 0;
ALTER TABLE trip_templates ADD COLUMN renglon_campos TEXT;
ALTER TABLE trip_templates ADD COLUMN renglones_fijos TEXT;
ALTER TABLE trip_templates ADD COLUMN pide_kilometros INTEGER NOT NULL DEFAULT 0;
ALTER TABLE trip_templates ADD COLUMN viaje_vacio INTEGER NOT NULL DEFAULT 0;

-- Visibilidad por camión: hay camiones que no hacen ciertos trabajos y no tiene
-- sentido ofrecerles esos viajes. Sin filas para una plantilla = la ven todos.
CREATE TABLE IF NOT EXISTS template_trucks (
  template_id INTEGER NOT NULL REFERENCES trip_templates(id) ON DELETE CASCADE,
  truck_id    INTEGER NOT NULL REFERENCES trucks(id) ON DELETE CASCADE,
  PRIMARY KEY (template_id, truck_id)
);
