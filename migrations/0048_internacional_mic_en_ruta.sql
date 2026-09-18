-- Los internacionales: el MIC se pide en el puente y el destino al cerrar.
--
-- "Tipo que le pida iniciar viaje, y donde cargo. Después para continuar, que le pida el nro
-- del MIC y la foto. Y luego sí cerrarlo. Cuando lleguen: departamento, donde descargo, kilos y
-- foto." Y: "hoy sólo donde cargo y le dé iniciar viaje. Y después sí, cuando lleguen al
-- puente, o cuando lleguen para cerrar, que le pida todo lo otro." — Rodrigo, 18/9/2026.
--
-- La hoja del MIC se la dan en la frontera: pedírsela al salir era pedir un papel que el
-- chofer todavía no tiene. Y el depósito donde descarga lo sabe recién llegando.
--
-- Las tres plantillas del proveedor "Internacional": 8 (TYCSUR), 9 (Minabel) y 25 (Valvis).
-- Cada UPDATE mira la forma ACTUAL antes de tocar: si la plantilla ya cambió o es otra cosa,
-- no hace nada, y correrla dos veces da lo mismo que una. El índice de cada campo se busca con
-- json_each por su clave, no se supone: la oficina puede haber reordenado los campos.
--
-- Los viajes EN CURSO de estas plantillas no se tocan: ya salieron con su MIC y su destino, y
-- el cierre sólo pide lo que falta.

-- ── El N° de MIC pasa al puente (etapa "ruta"), en las tres ──
UPDATE trip_templates
   SET fields = json_set(
         fields,
         '$[' || (SELECT je.key FROM json_each(trip_templates.fields) je
                   WHERE json_extract(je.value, '$.key') = 'nro_mic') || '].stage',
         'ruta')
 WHERE id IN (8, 9, 25)
   AND provider_id = (SELECT id FROM providers WHERE name = 'Internacional')
   AND json_valid(fields)
   AND EXISTS (SELECT 1 FROM json_each(trip_templates.fields) je
                WHERE json_extract(je.value, '$.key') = 'nro_mic'
                  AND json_extract(je.value, '$.stage') = 'carga');

-- ── Valvis: los kilos se piden al llegar, como en TYCSUR y Minabel ──
-- "Cuando lleguen: …kilos y foto." En las otras dos ya estaba así ("Kilos de Descarga").
UPDATE trip_templates
   SET fields = json_set(
         fields,
         '$[' || (SELECT je.key FROM json_each(trip_templates.fields) je
                   WHERE json_extract(je.value, '$.key') = 'ton_carga') || '].stage',
         'descarga',
         '$[' || (SELECT je.key FROM json_each(trip_templates.fields) je
                   WHERE json_extract(je.value, '$.key') = 'ton_carga') || '].label',
         'Kilos de descarga')
 WHERE id = 25
   AND provider_id = (SELECT id FROM providers WHERE name = 'Internacional')
   AND json_valid(fields)
   AND EXISTS (SELECT 1 FROM json_each(trip_templates.fields) je
                WHERE json_extract(je.value, '$.key') = 'ton_carga'
                  AND json_extract(je.value, '$.stage') = 'carga');

-- ── El destino (departamento) y el lugar de descarga, al cerrar ──
-- Sólo si siguen configurados como se espera: destino de lista y lugar de descarga escrito.
UPDATE trip_templates
   SET campos_ubicacion = json_set(
         campos_ubicacion,
         '$.destino.al_cerrar', json('true'),
         '$.destinatario.al_cerrar', json('true'))
 WHERE id IN (8, 9, 25)
   AND provider_id = (SELECT id FROM providers WHERE name = 'Internacional')
   AND json_valid(campos_ubicacion)
   AND json_extract(campos_ubicacion, '$.destino.modo') = 'libreta'
   AND json_extract(campos_ubicacion, '$.destinatario.modo') = 'texto';
