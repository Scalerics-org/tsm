-- Zafra de arroz (febrero 2027): el cliente nuevo y sus 7 viajes, con los km y el orden que pidió Rodrigo (19/10/2026).
--
-- NO ES UNA MIGRACIÓN. Vive en scripts/ y se corre A MANO contra la base que corresponda. Nunca va en migrations/: el
-- deploy aplica las migraciones pendientes a producción, y la zafra se prueba primero en el ambiente de prueba.
--
--   Prueba (por ahora, la única base donde se corre):
--     npx wrangler d1 execute logistica_db_prueba --env prueba --remote --file=scripts/zafra-de-arroz.sql
--   Producción: el mismo archivo contra logistica_db, SÓLO con el OK de Rodrigo.
--
-- Requiere la 0059 (km_fijos y orden) y la 0060 (visible_desde). La primera sentencia lo comprueba y, si faltan, corta
-- antes de insertar nada. Refrescar la prueba desde producción borra esto: después de cada refresco hay que volver a correrlo.
--
-- NACEN ACTIVAS PERO CON FECHA: `visible_desde = '2027-01-15'`. Hasta ese día (de Uruguay) ningún chofer las ve: la lista del
-- celular no se las ofrece y el alta de un viaje las rechaza ("Plantilla de viaje no disponible", api/routes/trips.ts),
-- aunque alguien mande el id a mano. El 15/1 le aparecen solas al camión que tienen asignado, sin tocar nada ni correr nada.
-- La oficina las ve siempre en Plantillas (con la marca "Choferes: desde 15/01/2027") y las puede revisar o editar.
--
-- Quedan asignadas al camión GTP 4371 (el de prueba de Rodrigo): el 15/1 las ve sólo ese camión y no toda la flota. Si el
-- camión no existe en la base, no se asigna nada (y entonces las vería toda la flota ese día: confirmar la patente).
--
-- PARA LA PRUEBA, que Rodrigo las vea YA: correr esto después del script (sacarle la fecha a las 7):
--
-- UPDATE trip_templates SET visible_desde = NULL
--  WHERE provider_id = (SELECT id FROM providers WHERE name = 'Zafra de arroz');
--
-- Se puede correr dos veces: cada fila se inserta sólo si todavía no está (no pisa lo que ya esté cargado).
--
-- Destinos: las tres plantas de Samán (T.G = Tomás Gomensoro, TBO = Tacuarembó). Los nombres de los viajes y los
-- lugares van como los escribió Rodrigo.

-- Primera sentencia: falla si la base no tiene la 0059 y la 0060. Así no queda el proveedor cargado sin sus plantillas.
SELECT km_fijos, orden, visible_desde FROM trip_templates LIMIT 0;

INSERT INTO providers (name)
SELECT 'Zafra de arroz'
 WHERE NOT EXISTS (SELECT 1 FROM providers WHERE name = 'Zafra de arroz');

WITH viajes (orden, nombre, origen, destino, km) AS (
  VALUES
    (1, 'B.Brum-SAMAN T.G',    'B. Brum', 'Saman T.G',    45),
    (2, 'Patitas-SAMAN T.G',   'Patitas', 'Saman T.G',    83),
    (3, 'Patitas-SAMAN SALTO', 'Patitas', 'Saman Salto', 110),
    (4, 'Puesto-SAMAN SALTO',  'Puesto',  'Saman Salto', 160),
    (5, 'Puesto-SAMAN T.G',    'Puesto',  'Saman T.G',   225),
    (6, 'Puesto-SAMAN TBO',    'Puesto',  'Saman TBO',   240),
    (7, 'B.Brum-SAMAN SALTO',  'B. Brum', 'Saman Salto',  72)
)
INSERT INTO trip_templates (
  provider_id, name, origin, destinations, cargo_type, requires_kilos, extra_type, extra_required,
  active, dest_options, fields, arrival_photo_label, remite, campos_ubicacion, multi_renglon,
  pide_kilometros, viaje_vacio, foto_carga_requerida, renglon_pide_ubicacion, carga_photo_label,
  renglon_pide_departamento, exige_carga_al_salir, km_fijos, orden, visible_desde
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
  1,
  '[]',
  -- Carga (al iniciar el viaje): número de remito + foto. Descarga (para cerrar): kilos, sobrepeso Sí/No,
  -- número de boleta de balanza (Samán siempre emite la boleta de la balanza) + foto.
  '[{"key":"remito_carga","label":"Número de remito","type":"numero","required":true,"stage":"carga"},'
  || '{"key":"kilos","label":"Kilos","type":"numero","required":true,"stage":"descarga","is_weight":true},'
  || '{"key":"sobrepeso","label":"Sobrepeso","type":"si_no","required":true,"stage":"descarga"},'
  || '{"key":"boleta_balanza","label":"Número de boleta de balanza","type":"texto","required":true,"stage":"descarga"}]',
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
  v.orden,
  '2027-01-15'
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
