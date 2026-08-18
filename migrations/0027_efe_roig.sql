-- Los cuatro viajes de Efe Roig. La leyenda de su planilla lo dice textual:
--   'FILTRO PARA ELEGIR EL DPTO' → 'ESCRIBE EL LUGAR DE CARGA'
--   'FILTRO PARA ELEGIR EL DPTO' → 'ESCRIBE EL LUGAR DE DESCARGA'
-- Es el mismo patron del viaje ocasional, mas kilometros.
--
-- OJO CON "VACIO": en nuestro modelo viaje_vacio significa 'no hay carga, no pide fotos
-- ni renglones'. El vacio de Efe Roig NO es eso — lleva pallets (25 y 20 en sus ejemplos)
-- porque vuelve con envases: 'lo manda para atras, vacio, con envase, y los envases los
-- carga en Salto, en Paysandu'. Aca 'vacio' es la TARIFA, no la ausencia de carga. Marcarlo
-- como viaje_vacio dejaba cerrar el viaje sin registrar nada.
--
-- Los cuatro son identicos en estructura: lo que cambia es el nombre, y con el el precio
-- del flete. 'No es lo mismo el precio.'
--
-- multi_renglon porque una descarga puede ser en varios lugares: en su ejemplo un viaje
-- sale de Mdeo/Roig y descarga en Paysandu/Conaprole y en Salto/Roig.

INSERT INTO providers (name) SELECT 'Efe Roig'
WHERE NOT EXISTS (SELECT 1 FROM providers WHERE name = 'Efe Roig');

INSERT INTO trip_templates (
  provider_id, name, origin, remite, cargo_type,
  dest_options, fields, arrival_photo_label, carga_photo_label, campos_ubicacion,
  multi_renglon, renglon_pide_ubicacion, renglones_fijos,
  pide_kilometros, viaje_vacio, foto_carga_requerida, active
) VALUES (
  (SELECT id FROM providers WHERE name = 'Efe Roig'),
  'Viaje cargado', '', NULL, 'Efe Roig',
  '[]', '[]', NULL, NULL, '{"origen":{"modo":"libreta","label":"Departamento de carga","libreta_tipo":"departamento","permite_alta":false},"destino":{"modo":"libreta","label":"Departamento de destino","libreta_tipo":"departamento","permite_alta":false}}',
  1, 1, NULL,
  1,  -- pide kilometros: es lo que le interesa facturar de este cliente
  0,  -- NO es viaje_vacio aunque se llame asi: lleva envases
  1, 1
);

INSERT INTO trip_templates (
  provider_id, name, origin, remite, cargo_type,
  dest_options, fields, arrival_photo_label, carga_photo_label, campos_ubicacion,
  multi_renglon, renglon_pide_ubicacion, renglones_fijos,
  pide_kilometros, viaje_vacio, foto_carga_requerida, active
) VALUES (
  (SELECT id FROM providers WHERE name = 'Efe Roig'),
  'Viaje vacío', '', NULL, 'Efe Roig',
  '[]', '[]', NULL, NULL, '{"origen":{"modo":"libreta","label":"Departamento de carga","libreta_tipo":"departamento","permite_alta":false},"destino":{"modo":"libreta","label":"Departamento de destino","libreta_tipo":"departamento","permite_alta":false}}',
  1, 1, NULL,
  1,  -- pide kilometros: es lo que le interesa facturar de este cliente
  0,  -- NO es viaje_vacio aunque se llame asi: lleva envases
  1, 1
);

INSERT INTO trip_templates (
  provider_id, name, origin, remite, cargo_type,
  dest_options, fields, arrival_photo_label, carga_photo_label, campos_ubicacion,
  multi_renglon, renglon_pide_ubicacion, renglones_fijos,
  pide_kilometros, viaje_vacio, foto_carga_requerida, active
) VALUES (
  (SELECT id FROM providers WHERE name = 'Efe Roig'),
  'Viaje frigorífico cargado', '', NULL, 'Efe Roig',
  '[]', '[]', NULL, NULL, '{"origen":{"modo":"libreta","label":"Departamento de carga","libreta_tipo":"departamento","permite_alta":false},"destino":{"modo":"libreta","label":"Departamento de destino","libreta_tipo":"departamento","permite_alta":false}}',
  1, 1, NULL,
  1,  -- pide kilometros: es lo que le interesa facturar de este cliente
  0,  -- NO es viaje_vacio aunque se llame asi: lleva envases
  1, 1
);

INSERT INTO trip_templates (
  provider_id, name, origin, remite, cargo_type,
  dest_options, fields, arrival_photo_label, carga_photo_label, campos_ubicacion,
  multi_renglon, renglon_pide_ubicacion, renglones_fijos,
  pide_kilometros, viaje_vacio, foto_carga_requerida, active
) VALUES (
  (SELECT id FROM providers WHERE name = 'Efe Roig'),
  'Viaje frigorífico vacío', '', NULL, 'Efe Roig',
  '[]', '[]', NULL, NULL, '{"origen":{"modo":"libreta","label":"Departamento de carga","libreta_tipo":"departamento","permite_alta":false},"destino":{"modo":"libreta","label":"Departamento de destino","libreta_tipo":"departamento","permite_alta":false}}',
  1, 1, NULL,
  1,  -- pide kilometros: es lo que le interesa facturar de este cliente
  0,  -- NO es viaje_vacio aunque se llame asi: lleva envases
  1, 1
);
