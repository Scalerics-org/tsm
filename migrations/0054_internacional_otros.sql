-- "Internacional Otros": el internacional para el transportista que no es ninguno de los cargados.
--
-- "Tenés que agregarle un viaje internacional que diga 'otros', porque si llega a surgir algún otro
-- que no sea de lo que está cargado ahí, van a quedar colgados." — Rodrigo, 26/9/2026.
--
-- Es el cuarto internacional, con la misma forma que Valvis (0036 + 0048) y el mismo cliente
-- "Internacional". Sin código: una plantilla más.
--
--   Al salir:    origen (lista de lugares, con alta) y lugar de carga en texto, OPCIONAL.
--   En el puente: N° de MIC (obligatorio; si no se cargó ahí, lo pide el cierre). La foto de la
--                 hoja del MIC es opcional: no hay `foto_carga_requerida`.
--   Al cerrar:   departamento de destino, lugar de descarga, kilos de descarga (obligatorios, para
--                 que el viaje tenga con qué facturarse) y foto "Remito de descarga".
--
-- La forma queda escrita acá y no copiada de la fila de Valvis: la oficina puede haber editado esa
-- plantilla, y una "Otros" que hereda cambios ajenos a escondidas no es la que se pidió. El cliente
-- se busca por nombre, no por id. Si ya existe una "Internacional Otros" no hace nada, así que
-- correrla dos veces da lo mismo que una.
INSERT INTO trip_templates (
  provider_id, name, origin, remite, cargo_type,
  dest_options, fields, arrival_photo_label, campos_ubicacion,
  multi_renglon, renglon_pide_ubicacion, renglones_fijos,
  pide_kilometros, viaje_vacio, foto_carga_requerida, carga_photo_label, active
)
SELECT
  (SELECT id FROM providers WHERE name = 'Internacional'),
  'Internacional Otros',
  '',
  NULL,
  'Internacional',
  '[]',
  '[{"key":"nro_mic","label":"N° de MIC","type":"texto","required":true,"stage":"ruta"},{"key":"ton_carga","label":"Kilos de descarga","type":"numero","required":true,"stage":"descarga","is_weight":true}]',
  'Remito de descarga',
  '{"origen":{"modo":"libreta","label":"Origen","libreta_tipo":"lugar","permite_alta":true},"remitente":{"modo":"texto","label":"Lugar de carga","requerido":false},"destino":{"modo":"libreta","label":"Destino","libreta_tipo":"departamento","permite_alta":false,"al_cerrar":true},"destinatario":{"modo":"texto","label":"Lugar de descarga","al_cerrar":true}}',
  0, 0, NULL, 0, 0, 0, 'Hoja MIC', 1
WHERE EXISTS (SELECT 1 FROM providers WHERE name = 'Internacional')
  AND NOT EXISTS (SELECT 1 FROM trip_templates WHERE name = 'Internacional Otros');
