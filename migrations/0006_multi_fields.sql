-- Plantillas con campos múltiples, destino+destinatario y foto de descarga etiquetada.
-- Viajes con destinatario, valores de campos y observaciones (notes ya existe).

ALTER TABLE trip_templates ADD COLUMN dest_options TEXT NOT NULL DEFAULT '[]';
ALTER TABLE trip_templates ADD COLUMN fields TEXT NOT NULL DEFAULT '[]';
ALTER TABLE trip_templates ADD COLUMN arrival_photo_label TEXT;

ALTER TABLE trips ADD COLUMN destinatario TEXT;
ALTER TABLE trips ADD COLUMN field_values TEXT NOT NULL DEFAULT '{}';
