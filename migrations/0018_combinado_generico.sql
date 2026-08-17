-- Combinado genérico: el viaje que no está precargado.
--
-- "Todo viaje que se cargue de cualquier localidad a cualquier destino y no esté fijo
-- precargado lo van a tener que llenar acá. En uno, 2 o 3 renglones si es necesario."
--
-- Se diferencia del combinado de Bella Unión en que NADA viene fijo: cada carga lleva
-- su propia ciudad de carga y su destino, además del lugar y los clientes.

ALTER TABLE trip_templates ADD COLUMN renglon_pide_ubicacion INTEGER NOT NULL DEFAULT 0;

-- La plantilla. Sin origen ni destino fijos: los pone el chofer, una vez al empezar,
-- y cada renglón los hereda pudiendo cambiarlos sólo donde sea distinto.
INSERT INTO trip_templates (
  provider_id, name, origin, remite, cargo_type,
  dest_options, fields, arrival_photo_label, campos_ubicacion,
  multi_renglon, renglon_pide_ubicacion, renglones_fijos,
  pide_kilometros, viaje_vacio, foto_carga_requerida, active
) VALUES (
  (SELECT id FROM providers WHERE name = 'Combinados'),
  'OTRO VIAJE COMBINADO',
  '',
  NULL,
  'Varios',
  '[]',
  '[]',
  NULL,
  -- Origen y destino salen de la libreta al empezar el viaje: son el valor por defecto
  -- que después heredan los renglones.
  '{"origen":{"modo":"libreta","label":"Ciudad de carga","libreta_tipo":"lugar","permite_alta":true},"destino":{"modo":"libreta","label":"Destino","libreta_tipo":"lugar","permite_alta":true}}',
  1,   -- multi_renglon
  1,   -- renglon_pide_ubicacion: cada carga lleva su ciudad y su destino
  NULL,
  0,
  0,
  1,   -- foto por lugar de carga, igual que el otro combinado
  1
);
