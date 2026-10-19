-- Zafra de arroz (febrero 2027): el cliente nuevo y sus 7 viajes, con los km y el orden que pidió Rodrigo (19/10/2026).
--
-- NACEN APAGADAS Y SIN QUE LAS VEA NINGÚN CHOFER. `active = 0` las saca de la lista de los choferes y además el alta de un
-- viaje las rechaza ("Plantilla de viaje no disponible", api/routes/trips.ts): aunque alguien mande el id a mano, no sale
-- ningún viaje. La oficina sí las ve en Plantillas (con "inactiva") y las puede revisar o editar.
--
-- Quedan además asignadas al camión GTP 4371 (el de prueba de Rodrigo): el día que se prendan —tildar "Activa" en
-- Plantillas— las ve sólo ese camión y no toda la flota. Si el camión no existe en la base, no se asigna nada.
--
-- Se puede correr dos veces: cada fila se inserta sólo si todavía no está.
--
-- Los lugares van como los escribió Rodrigo, salvo Tacuarembó, que la base ya escribe con tilde en todos lados
-- (departamentos, viajes, plantillas). El NOMBRE del viaje queda como en su tabla: "Puesto-TACUAREMBO".

INSERT INTO providers (name)
SELECT 'Zafra de arroz'
 WHERE NOT EXISTS (SELECT 1 FROM providers WHERE name = 'Zafra de arroz');

WITH viajes (orden, nombre, origen, destino, km) AS (
  VALUES
    (1, 'B.Brum-SAMAN T.G',    'B. Brum', 'Saman T.G',   45),
    (2, 'Patitas-SAMAN T.G',   'Patitas', 'Saman T.G',   83),
    (3, 'Patitas-SALTO',       'Patitas', 'Salto',      110),
    (4, 'Puesto-SALTO',        'Puesto',  'Salto',      160),
    (5, 'Puesto-SAMAN T.G',    'Puesto',  'Saman T.G',  225),
    (6, 'Puesto-TACUAREMBO',   'Puesto',  'Tacuarembó', 240),
    (7, 'B.Brum-SALTO',        'B. Brum', 'Salto',       72)
)
INSERT INTO trip_templates (
  provider_id, name, origin, destinations, cargo_type, requires_kilos, extra_type, extra_required,
  active, dest_options, fields, arrival_photo_label, remite, campos_ubicacion, multi_renglon,
  pide_kilometros, viaje_vacio, foto_carga_requerida, renglon_pide_ubicacion, carga_photo_label,
  renglon_pide_departamento, exige_carga_al_salir, km_fijos, orden
)
SELECT
  p.id,
  v.nombre,
  v.origen,
  '[]',
  'Arroz',
  0,
  'none',
  0,
  0,
  '[]',
  -- Carga (al iniciar el viaje): número de remito + foto. Descarga (para cerrar): kilos, sobrepeso Sí/No,
  -- número de remito o boleta (texto: todavía no se sabe si es el de Samán o el de la balanza) + foto.
  '[{"key":"remito_carga","label":"Número de remito","type":"numero","required":true,"stage":"carga"},'
  || '{"key":"kilos","label":"Kilos","type":"numero","required":true,"stage":"descarga","is_weight":true},'
  || '{"key":"sobrepeso","label":"Sobrepeso","type":"si_no","required":true,"stage":"descarga"},'
  || '{"key":"remito_boleta","label":"Número de remito / boleta","type":"texto","required":true,"stage":"descarga"}]',
  'Foto del remito de descarga',
  NULL,
  '{"origen":{"modo":"fijo","valor":"' || v.origen || '","requerido":true},'
  || '"destino":{"modo":"fijo","valor":"' || v.destino || '","requerido":true}}',
  0,
  0,
  0,
  1,
  0,
  'Foto del remito de carga',
  0,
  0,
  v.km,
  v.orden
FROM viajes v
JOIN providers p ON p.name = 'Zafra de arroz'
WHERE NOT EXISTS (
  SELECT 1 FROM trip_templates t WHERE t.provider_id = p.id AND t.name = v.nombre
);

INSERT OR IGNORE INTO template_trucks (template_id, truck_id)
SELECT t.id, k.id
  FROM trip_templates t
  JOIN providers p ON p.id = t.provider_id AND p.name = 'Zafra de arroz'
  JOIN trucks k ON k.plate = 'GTP 4371';
