-- Etiqueta de la foto de carga, para poder decirle al chofer QUÉ foto sacar.
--
-- Hasta acá siempre decía "Foto de la carga". En el internacional la planilla pide la
-- HOJA MIC, en Manassi el remito firmado, y en el camión Azul los sobres de Belén. Que
-- la pantalla diga el nombre del papel evita la foto equivocada, que es la que después
-- no sirve para nada.
--
-- NULL = "Foto de la carga", como venía.
ALTER TABLE trip_templates ADD COLUMN carga_photo_label TEXT;

UPDATE trip_templates SET carga_photo_label = 'Hoja MIC' WHERE cargo_type = 'Internacional';
