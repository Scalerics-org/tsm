-- Los cuatro viajes de la UAM, y los primeros que se restringen a un solo camion.
--
-- "Este viaje me gustaria que le aparezca solo a un camion. Xq hay camiones que directamente
-- no hacen algunas cosas. A esos me gustaria q le aparezca solo lo que hacen."
--
-- Su planilla:
--   Opcion 1   BU    PRODUCTORES  ->  Mdeo   UAM
--   Opcion 2   MDEO  PUESTOS      ->  BU     GALPON
--   Opcion 3   MDEO  AGENCIA      ->  BU     GALPON
--   Opcion 4   MDEO  VARIOS       ->  BU     GALPON
--
-- Las tres primeras tienen el lugar de carga fijo: el chofer solo pone cantidad y foto.
--
-- La CUARTA NO lleva "VARIOS" como lugar de carga, a proposito. "Varios" es un agrupador y
-- el lugar de carga es justo el dato que no se puede perder. Ademas, si "VARIOS" valiera
-- como lugar, las opciones 2 y 3 no tendrian sentido: para que separar PUESTOS de AGENCIA
-- si alcanza con poner VARIOS. Que las haya separado prueba que el lugar importa. Por eso
-- la opcion 4 es un combinado: el chofer elige de la libreta donde cargo, renglon por
-- renglon, y saca una foto de cada uno.
--
-- Se escriben con los nombres que YA estan en la libreta ("Mdeo", "Bella Union", "Galpon",
-- "Agencia") y no como los escribio el ("MDEO", "BU", "GALPON"). Es el mismo lugar: dejarlo
-- escrito de dos formas es la fragmentacion que la libreta existe para evitar. En su propia
-- planilla del combinado ya conviven "BU" y "Bella union" con dos filas de diferencia.

-- === Proveedor ===
INSERT INTO providers (name) SELECT 'UAM'
WHERE NOT EXISTS (SELECT 1 FROM providers WHERE name = 'UAM');

-- === Libreta: los nombres nuevos de esta planilla ===
-- "Agencia" y "Galpon" ya estaban, con reglas de cobro apuntando a ellos. No se tocan.
INSERT INTO libreta (tipo, nombre, provider_id, agrupador, estado)
SELECT 'remitente', 'Productores', NULL, 0, 'confirmado'
WHERE NOT EXISTS (SELECT 1 FROM libreta WHERE tipo='remitente' AND nombre='Productores');

INSERT INTO libreta (tipo, nombre, provider_id, agrupador, estado)
SELECT 'remitente', 'Puestos', NULL, 0, 'confirmado'
WHERE NOT EXISTS (SELECT 1 FROM libreta WHERE tipo='remitente' AND nombre='Puestos');

INSERT INTO libreta (tipo, nombre, provider_id, agrupador, estado)
SELECT 'destinatario', 'UAM', NULL, 0, 'confirmado'
WHERE NOT EXISTS (SELECT 1 FROM libreta WHERE tipo='destinatario' AND nombre='UAM');

-- === Opcion 1 · Bella Union -> Mdeo · Productores -> UAM ===
-- El renglon fijo va con los id de libreta y no solo con el nombre: las reglas de cobro
-- casan por id, asi que un renglon con el nombre suelto nunca podria facturarse.
INSERT INTO trip_templates (
  provider_id, name, origin, remite, cargo_type,
  dest_options, fields, arrival_photo_label, carga_photo_label, campos_ubicacion,
  multi_renglon, renglon_pide_ubicacion, renglones_fijos,
  pide_kilometros, viaje_vacio, foto_carga_requerida, active
) VALUES (
  (SELECT id FROM providers WHERE name='UAM'),
  'Opción 1 · Bella Unión → Mdeo (Productores)',
  'Bella Unión', NULL, 'Varios',
  '[]', '[]', NULL, 'Foto de la carga',
  '{"origen":{"modo":"fijo","valor":"Bella Unión"},"destino":{"modo":"fijo","valor":"Mdeo"}}',
  1, 0,
  '[{"origen":"Bella Unión","origen_id":null,"destino":"Mdeo","destino_id":null,"remitente":"Productores","remitente_id":'
    || (SELECT id FROM libreta WHERE tipo='remitente' AND nombre='Productores')
    || ',"clientes":["UAM"],"cliente_ids":['
    || (SELECT id FROM libreta WHERE tipo='destinatario' AND nombre='UAM')
    || '],"cantidad":null,"unidad":"pallets","remito":null}]',
  0, 0, 1, 1
);

-- === Opcion 2 · Mdeo -> Bella Union · Puestos -> Galpon ===
INSERT INTO trip_templates (
  provider_id, name, origin, remite, cargo_type,
  dest_options, fields, arrival_photo_label, carga_photo_label, campos_ubicacion,
  multi_renglon, renglon_pide_ubicacion, renglones_fijos,
  pide_kilometros, viaje_vacio, foto_carga_requerida, active
) VALUES (
  (SELECT id FROM providers WHERE name='UAM'),
  'Opción 2 · Mdeo → Bella Unión (Puestos)',
  'Mdeo', NULL, 'Varios',
  '[]', '[]', NULL, 'Foto de la carga',
  '{"origen":{"modo":"fijo","valor":"Mdeo"},"destino":{"modo":"fijo","valor":"Bella Unión"}}',
  1, 0,
  '[{"origen":"Mdeo","origen_id":null,"destino":"Bella Unión","destino_id":null,"remitente":"Puestos","remitente_id":'
    || (SELECT id FROM libreta WHERE tipo='remitente' AND nombre='Puestos')
    || ',"clientes":["Galpón"],"cliente_ids":['
    || (SELECT id FROM libreta WHERE tipo='destinatario' AND nombre='Galpón')
    || '],"cantidad":null,"unidad":"pallets","remito":null}]',
  0, 0, 1, 1
);

-- === Opcion 3 · Mdeo -> Bella Union · Agencia -> Galpon ===
-- Esta es la unica de las cuatro que ya factura sola: existe la regla "Agencia -> cualquier
-- destino, se cobra a Agencia". Las otras tres quedan pendientes en oficina hasta que el
-- cliente pase sus reglas, que es lo correcto: no inventamos un cobro.
INSERT INTO trip_templates (
  provider_id, name, origin, remite, cargo_type,
  dest_options, fields, arrival_photo_label, carga_photo_label, campos_ubicacion,
  multi_renglon, renglon_pide_ubicacion, renglones_fijos,
  pide_kilometros, viaje_vacio, foto_carga_requerida, active
) VALUES (
  (SELECT id FROM providers WHERE name='UAM'),
  'Opción 3 · Mdeo → Bella Unión (Agencia)',
  'Mdeo', NULL, 'Varios',
  '[]', '[]', NULL, 'Foto de la carga',
  '{"origen":{"modo":"fijo","valor":"Mdeo"},"destino":{"modo":"fijo","valor":"Bella Unión"}}',
  1, 0,
  '[{"origen":"Mdeo","origen_id":null,"destino":"Bella Unión","destino_id":null,"remitente":"Agencia","remitente_id":'
    || (SELECT id FROM libreta WHERE tipo='remitente' AND nombre='Agencia')
    || ',"clientes":["Galpón"],"cliente_ids":['
    || (SELECT id FROM libreta WHERE tipo='destinatario' AND nombre='Galpón')
    || '],"cantidad":null,"unidad":"pallets","remito":null}]',
  0, 0, 1, 1
);

-- === Opcion 4 · Mdeo -> Bella Union · varios lugares de carga -> Galpon ===
-- Sin renglones fijos: el chofer arma un renglon por cada lugar donde cargo, con su foto.
INSERT INTO trip_templates (
  provider_id, name, origin, remite, cargo_type,
  dest_options, fields, arrival_photo_label, carga_photo_label, campos_ubicacion,
  multi_renglon, renglon_pide_ubicacion, renglones_fijos,
  pide_kilometros, viaje_vacio, foto_carga_requerida, active
) VALUES (
  (SELECT id FROM providers WHERE name='UAM'),
  'Opción 4 · Mdeo → Bella Unión (varios lugares)',
  'Mdeo', NULL, 'Varios',
  '[]', '[]', NULL, 'Foto de la carga',
  '{"origen":{"modo":"fijo","valor":"Mdeo"},"destino":{"modo":"fijo","valor":"Bella Unión"}}',
  1, 0, NULL,
  0, 0, 1, 1
);

-- === El camion ===
-- Todavia no tenemos la flota real de Rodrigo: los camiones cargados son los de demo. Se
-- asignan a uno solo para que la restriccion quede armada y se pueda ver funcionando; cuando
-- pase las patentes de verdad se cambia desde la pantalla de oficina, sin tocar codigo.
--
-- Va guardado con WHERE NOT EXISTS y un JOIN por patente: si esa patente no esta, no se
-- asigna nada y las cuatro quedan visibles para todos. Es el fallo seguro — el otro lado
-- dejaria los viajes de la UAM sin ningun camion que pueda hacerlos.
INSERT INTO template_trucks (template_id, truck_id)
SELECT tt.id, t.id
FROM trip_templates tt
JOIN providers p ON p.id = tt.provider_id AND p.name = 'UAM'
JOIN trucks t ON REPLACE(t.plate,' ','') = 'MRC1177'
WHERE NOT EXISTS (
  SELECT 1 FROM template_trucks x WHERE x.template_id = tt.id AND x.truck_id = t.id
);
