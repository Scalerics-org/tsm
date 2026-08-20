-- Los dos viajes vacíos: el nacional y el internacional.
--
-- "Por ahora vamos a crear el viaje vacío y que lo vayan registrando. Tiene que ser viaje
-- vacío internacional y viaje vacío nacional. El nacional origen y destino los 19
-- departamentos. Y el internacional es origen 19 departamentos y destino San Salvador,
-- Argentina."
--
-- Es el tramo entre que descarga y va a cargar de nuevo: "mueren en Bella Unión, y a veces
-- de Bella Unión van a San Salvador". El internacional siempre va de acá para allá — "hasta
-- ahora no hicimos ninguno" al revés.
--
-- NO PIDEN KILÓMETROS NI FOTOS, a propósito. El cliente ya dijo que pedírselos "lo veo muy
-- llenador para ellos, los voy a cargar mucho", y los kilómetros los estima la app a partir
-- del origen y el destino ("y además la aplicación vos me lo estás dando"). Dos toques:
-- de dónde sale y adónde va.
--
-- viaje_vacio = 1 acá SÍ corresponde, a diferencia de Efe Roig: en aquel el "vacío" es la
-- tarifa y el camión igual lleva envases. Éste va de verdad sin nada.

-- ── El cliente ──
-- Se llama "Viaje vacío" y no "Viaje VACIO": es el nombre que se ve en la pantalla del
-- chofer, al lado de Casarone y Manassi.
INSERT INTO providers (name) SELECT 'Viaje vacío'
WHERE NOT EXISTS (SELECT 1 FROM providers WHERE name = 'Viaje vacío');

-- ── Nacional: departamento → departamento ──
INSERT INTO trip_templates (
  provider_id, name, origin, remite, cargo_type,
  dest_options, fields, arrival_photo_label, carga_photo_label, campos_ubicacion,
  multi_renglon, renglon_pide_ubicacion, renglones_fijos,
  pide_kilometros, viaje_vacio, foto_carga_requerida, active
)
SELECT
  (SELECT id FROM providers WHERE name = 'Viaje vacío'),
  'Vacío nacional', '', NULL, 'Sin carga',
  '[]', '[]', NULL, NULL,
  '{"origen":{"modo":"libreta","label":"¿De dónde salís?","libreta_tipo":"departamento","permite_alta":false,"requerido":true},"destino":{"modo":"libreta","label":"¿Adónde vas?","libreta_tipo":"departamento","permite_alta":false,"requerido":true}}',
  0, 0, NULL,
  0, 1, 0, 1
WHERE NOT EXISTS (SELECT 1 FROM trip_templates WHERE name = 'Vacío nacional');

-- ── Internacional: departamento → San Salvador ──
-- El destino va fijo porque hoy sólo van a ese punto. Si mañana suman otro, la oficina lo
-- cambia desde la pantalla de plantillas — que para eso se le agregaron los controles.
INSERT INTO trip_templates (
  provider_id, name, origin, remite, cargo_type,
  dest_options, fields, arrival_photo_label, carga_photo_label, campos_ubicacion,
  multi_renglon, renglon_pide_ubicacion, renglones_fijos,
  pide_kilometros, viaje_vacio, foto_carga_requerida, active
)
SELECT
  (SELECT id FROM providers WHERE name = 'Viaje vacío'),
  'Vacío internacional', '', NULL, 'Sin carga',
  '[]', '[]', NULL, NULL,
  '{"origen":{"modo":"libreta","label":"¿De dónde salís?","libreta_tipo":"departamento","permite_alta":false,"requerido":true},"destino":{"modo":"fijo","valor":"Arg. San Salvador"}}',
  0, 0, NULL,
  0, 1, 0, 1
WHERE NOT EXISTS (SELECT 1 FROM trip_templates WHERE name = 'Vacío internacional');

-- ── Las que armó el cliente a mano ──
-- Se DESACTIVAN, no se borran: hay viajes que las referencian y borrarlas les dejaría el
-- template_id en NULL (la FK es ON DELETE SET NULL), o sea un viaje sin plantilla que el
-- cierre no sabe validar. Desactivadas ya no le aparecen al chofer, que es lo que importa.
UPDATE trip_templates SET active = 0
WHERE name = 'RECORRIDO VACIO';
