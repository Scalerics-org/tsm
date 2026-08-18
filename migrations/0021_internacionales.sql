-- Los dos viajes internacionales, de la planilla que pasó el cliente.
--
-- Son dos, no uno: cambia el proveedor transportista (TYCSUR y Minabel) y con él los
-- orígenes que puede elegir el chofer.
--
-- OJO CON EL DESTINO: la planilla dice "Uy Mdeo" fijo en las siete opciones, pero en la
-- reunión quedó otra cosa. Él dijo "destino es Montevideo, ahí tendría los destinoS" —en
-- plural, corrigiéndose— y cuando se le propuso ofrecerle los 19 departamentos porque
-- "ellos van a San José, Durazno, Florida", contestó "Bien". La planilla está vieja ahí.
--
-- El internacional NO es combinado: "el internacional es fijo, él tiene que elegir nomás".
-- Un solo tramo por viaje, sin renglones.

INSERT INTO providers (name) VALUES ('Internacional');

-- ── TYCSUR ──
-- Origen: las 6 ciudades argentinas ya cargadas en la libreta (tipo 'lugar') + "Otro",
-- que se agrega desde la ruta si aparece una nueva.
INSERT INTO trip_templates (
  provider_id, name, origin, remite, cargo_type,
  dest_options, fields, arrival_photo_label, campos_ubicacion,
  multi_renglon, renglon_pide_ubicacion, renglones_fijos,
  pide_kilometros, viaje_vacio, foto_carga_requerida, active
) VALUES (
  (SELECT id FROM providers WHERE name = 'Internacional'),
  'Internacional TYCSUR',
  '',
  NULL,
  'Internacional',
  '[]',
  -- Nro. MIC y toneladas, los dos que pide la planilla en la carga.
  '[{"key":"nro_mic","label":"N° de MIC","type":"texto","required":true,"stage":"carga"},{"key":"ton_carga","label":"Toneladas de carga","type":"numero","required":true,"stage":"carga","is_weight":true}]',
  'Remito de descarga',
  -- Origen de lista, lugar de carga escrito, destino de los 19, lugar de descarga escrito.
  '{"origen":{"modo":"libreta","label":"Origen","libreta_tipo":"lugar","permite_alta":true},"remitente":{"modo":"texto","label":"Lugar de carga"},"destino":{"modo":"libreta","label":"Destino","libreta_tipo":"departamento","permite_alta":false},"destinatario":{"modo":"texto","label":"Lugar de descarga"}}',
  0, 0, NULL, 0, 0, 1, 1
);

-- ── Minabel ──
-- Su único origen habitual es Concordia, que ya está en la libreta junto a las argentinas.
INSERT INTO trip_templates (
  provider_id, name, origin, remite, cargo_type,
  dest_options, fields, arrival_photo_label, campos_ubicacion,
  multi_renglon, renglon_pide_ubicacion, renglones_fijos,
  pide_kilometros, viaje_vacio, foto_carga_requerida, active
) VALUES (
  (SELECT id FROM providers WHERE name = 'Internacional'),
  'Internacional Minabel',
  '',
  NULL,
  'Internacional',
  '[]',
  '[{"key":"nro_mic","label":"N° de MIC","type":"texto","required":true,"stage":"carga"},{"key":"ton_carga","label":"Toneladas de carga","type":"numero","required":true,"stage":"carga","is_weight":true}]',
  'Remito de descarga',
  '{"origen":{"modo":"libreta","label":"Origen","libreta_tipo":"lugar","permite_alta":true},"remitente":{"modo":"texto","label":"Lugar de carga","requerido":false},"destino":{"modo":"libreta","label":"Destino","libreta_tipo":"departamento","permite_alta":false},"destinatario":{"modo":"texto","label":"Lugar de descarga"}}',
  0, 0, NULL, 0, 0, 1, 1
);

-- Barraca Paraná ya está cargada como destinatario, que es lo que la planilla confirma:
-- es el lugar de descarga habitual de Minabel, no un lugar de carga.
