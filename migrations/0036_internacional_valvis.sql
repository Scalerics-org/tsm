-- Valvis, el tercer internacional.
--
-- "Está bien el internacional, tiene que haber otra ventana en caso de que haya otro
-- cliente." O sea: el cliente "Internacional" sigue siendo uno solo, y adentro va una ventana
-- por transportista. Hoy son Minabel, TYCSUR y Valvis; mañana pueden ser cuatro, y agregar el
-- cuarto es exactamente esto o el botón de plantillas de la oficina.
--
-- Se clona la forma de Minabel (0021) y no la de TYCSUR porque las dos son iguales salvo el
-- nombre: mismos campos (N° de MIC + toneladas), mismo remito de descarga, origen de la lista
-- de lugares con alta permitida, destino entre los 19 departamentos.
--
-- El lugar de carga queda OPCIONAL, igual que en Minabel: de un transportista nuevo todavía no
-- sabemos si el chofer va a tener ese dato a mano, y trabarle el viaje por un campo que quizás
-- no corresponde es peor que dejarlo vacío y completarlo desde oficina.
INSERT INTO trip_templates (
  provider_id, name, origin, remite, cargo_type,
  dest_options, fields, arrival_photo_label, campos_ubicacion,
  multi_renglon, renglon_pide_ubicacion, renglones_fijos,
  pide_kilometros, viaje_vacio, foto_carga_requerida, active
)
SELECT
  (SELECT id FROM providers WHERE name = 'Internacional'),
  'Internacional Valvis',
  '',
  NULL,
  'Internacional',
  '[]',
  '[{"key":"nro_mic","label":"N° de MIC","type":"texto","required":true,"stage":"carga"},{"key":"ton_carga","label":"Toneladas de carga","type":"numero","required":true,"stage":"carga","is_weight":true}]',
  'Remito de descarga',
  '{"origen":{"modo":"libreta","label":"Origen","libreta_tipo":"lugar","permite_alta":true},"remitente":{"modo":"texto","label":"Lugar de carga","requerido":false},"destino":{"modo":"libreta","label":"Destino","libreta_tipo":"departamento","permite_alta":false},"destinatario":{"modo":"texto","label":"Lugar de descarga"}}',
  0, 0, NULL, 0, 0, 1, 1
WHERE EXISTS (SELECT 1 FROM providers WHERE name = 'Internacional')
  AND NOT EXISTS (SELECT 1 FROM trip_templates WHERE name = 'Internacional Valvis');
