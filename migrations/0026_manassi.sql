-- Los tres viajes de Manassi. "Él elige uno. Ya sabe cuál va a hacer cuando va a cargar
-- ese cliente." Y de datos: "solo foto y cantidad de pallet".
--
-- Dos de los tres son ida y vuelta, con las DOS líneas ya puestas por la oficina. El chofer
-- no las arma: sólo les pone los pallets y la foto. Eso es `renglones_fijos`, que estaba en
-- el modelo desde el principio y hasta ahora no lo instanciaba nadie.
--
-- Se reemplaza la plantilla "Salus Minas" que quedó armada a mano en la reunión: tenía dos
-- campos con la MISMA clave (`complicaciones` en carga y en descarga), y como los valores
-- se guardan por clave, el de la descarga pisaba al de la carga. Además ese campo ya no
-- hace falta: el comentario ahora está en todos los viajes.

-- El proveedor existe en produccion porque se creo a mano en la reunion, pero no en
-- ninguna migracion. Se crea si falta, para que la base se pueda reconstruir de cero.
INSERT INTO providers (name) SELECT 'Manassi'
WHERE NOT EXISTS (SELECT 1 FROM providers WHERE name = 'Manassi');

DELETE FROM trip_templates WHERE name = 'Salus Minas';

-- ── 1 · Minas → Artigas (un solo tramo) ──
INSERT INTO trip_templates (
  provider_id, name, origin, remite, cargo_type,
  dest_options, fields, arrival_photo_label, carga_photo_label, campos_ubicacion,
  multi_renglon, renglon_pide_ubicacion, renglones_fijos,
  pide_kilometros, viaje_vacio, foto_carga_requerida, active
) VALUES (
  (SELECT id FROM providers WHERE name = 'Manassi'),
  'Minas → Artigas',
  'Minas', 'Salus', 'Agua',
  '[{"destino":"Artigas","destinatario":"Manassi"}]',
  '[{"key":"pallets","label":"Cantidad de pallets","type":"numero","required":true,"stage":"carga"}]',
  NULL, 'Foto de la carga', NULL,
  0, 0, NULL, 0, 0, 1, 1
);

-- ── 2 · Ida y vuelta Artigas – Minas ──
-- Ida: carga en Manassi (Artigas) y entrega a Salus (Minas). Vuelta: al revés.
INSERT INTO trip_templates (
  provider_id, name, origin, remite, cargo_type,
  dest_options, fields, arrival_photo_label, carga_photo_label, campos_ubicacion,
  multi_renglon, renglon_pide_ubicacion, renglones_fijos,
  pide_kilometros, viaje_vacio, foto_carga_requerida, active
) VALUES (
  (SELECT id FROM providers WHERE name = 'Manassi'),
  'Ida y vuelta Artigas - Minas',
  'Artigas', NULL, 'Agua',
  '[{"destino":"Minas","destinatario":"Salus"}]',
  '[]',
  NULL, 'Foto de la carga', NULL,
  1, 0,
  '[{"origen":"Artigas","destino":"Minas","remitente":"Manassi","clientes":["Salus"],"cliente_ids":[],"cantidad":null,"unidad":"pallets","remito":null},{"origen":"Minas","destino":"Artigas","remitente":"Salus","clientes":["Manassi"],"cliente_ids":[],"cantidad":null,"unidad":"pallets","remito":null}]',
  0, 0, 1, 1
);

-- ── 3 · Ida y vuelta Bella Unión – Minas ──
-- Ida: carga en ALUR (Bella Unión) y entrega a Salus (Minas). Vuelta: al revés.
INSERT INTO trip_templates (
  provider_id, name, origin, remite, cargo_type,
  dest_options, fields, arrival_photo_label, carga_photo_label, campos_ubicacion,
  multi_renglon, renglon_pide_ubicacion, renglones_fijos,
  pide_kilometros, viaje_vacio, foto_carga_requerida, active
) VALUES (
  (SELECT id FROM providers WHERE name = 'Manassi'),
  'Ida y vuelta Bella Unión - Minas',
  'Bella Unión', NULL, 'Agua',
  '[{"destino":"Minas","destinatario":"Salus"}]',
  '[]',
  NULL, 'Foto de la carga', NULL,
  1, 0,
  '[{"origen":"Bella Unión","destino":"Minas","remitente":"ALUR","clientes":["Salus"],"cliente_ids":[],"cantidad":null,"unidad":"pallets","remito":null},{"origen":"Minas","destino":"Bella Unión","remitente":"Salus","clientes":["ALUR"],"cliente_ids":[],"cantidad":null,"unidad":"pallets","remito":null}]',
  0, 0, 1, 1
);
