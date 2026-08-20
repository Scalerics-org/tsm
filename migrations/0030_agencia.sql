-- El cliente Agencia, que faltaba. Textual:
--   "ahi a nosotros nos falto agregar el Agencia como cliente. El viaje Agencia es solo
--    Montevideo Bella Union... inicia en Montevideo, Agencia, destino Bella Union, Galpon,
--    listo. Viaje agencia, ese es uno."
--
-- Un solo tramo y siempre el mismo: carga en Agencia (Mdeo) y descarga en el Galpon
-- (Bella Union). Del recorrido el chofer no elige nada — solo pone cantidad y foto.
--
-- Es la misma ruta que la Opcion 3 de la UAM (0028), y no es un duplicado: alla la carga la
-- paga la UAM y aca la paga Agencia. El cliente es justo lo que las separa, y en la app el
-- chofer entra por cliente, asi que este viaje tiene que colgar de su propio cliente para
-- que aparezca.
--
-- LOS NOMBRES SE ESCRIBEN COMO YA ESTAN, no como los dicto el cliente: "Mdeo" y no
-- "Montevideo", "Bella Union" y no "BU", "Galpon" con tilde. Son los mismos lugares que ya
-- usan las plantillas de esta ruta (0016, 0023, 0028) y las entradas de libreta del seed.
-- Escribir el mismo lugar de dos formas es la fragmentacion que la libreta existe para evitar.
--
-- LA LIBRETA NO SE TOCA. Verificado por SELECT antes de escribir esta migracion: "Agencia"
-- ya esta como remitente (id 2) y "Galpon" como destinatario (id 20), los dos desde el seed
-- 0011 y los dos vivos despues de las limpiezas 0024 y 0025. Crear otra fila con la misma
-- grafia partiria en dos el historial del lugar.
--
-- Y ADEMAS ESTE VIAJE YA FACTURA SOLO: de "Agencia" cuelga la regla "Agencia -> cualquier
-- destino, se cobra a Agencia". No hace falta inventarle ninguna.

-- === El cliente ===
-- Guardado con WHERE NOT EXISTS: los clientes se crean a mano desde la pantalla de oficina,
-- y el que pidio esto puede haberlo dado de alta el mismo antes de que esto se aplique. Dos
-- "Agencia" en la lista dejan al chofer eligiendo a cara o cruz cual de las dos tiene el viaje.
INSERT INTO providers (name) SELECT 'Agencia'
WHERE NOT EXISTS (SELECT 1 FROM providers WHERE name = 'Agencia');

-- === El viaje ===
-- El renglon fijo va con los ID de libreta y no solo con el nombre: las reglas de cobro casan
-- por id, asi que un renglon con el nombre suelto no se puede facturar nunca. Los ids salen
-- por subconsulta y no hardcodeados porque la libreta se sigue editando desde la app y los
-- numeros de produccion no tienen por que ser los de aca.
--
-- multi_renglon=1 aunque el viaje sea uno solo, por dos motivos: es lo que hace que la foto se
-- exija POR carga y no una sola del viaje entero, y si un dia sale con un bulto de mas el
-- chofer lo puede anotar en vez de perderlo. Cada renglon es plata del cliente.
--
-- La plantilla tambien va guardada: si el viaje ya estuviera armado a mano, dos entradas
-- identicas en la pantalla del chofer son dos formas de hacer lo mismo y la mitad de los
-- viajes en cada una.
INSERT INTO trip_templates (
  provider_id, name, origin, remite, cargo_type,
  dest_options, fields, arrival_photo_label, carga_photo_label, campos_ubicacion,
  multi_renglon, renglon_pide_ubicacion, renglones_fijos,
  pide_kilometros, viaje_vacio, foto_carga_requerida, active
)
SELECT
  (SELECT id FROM providers WHERE name='Agencia'),
  'Mdeo → Bella Unión (Agencia → Galpón)',
  'Mdeo', NULL, 'Varios',
  '[]', '[]', NULL, 'Foto de la carga',
  '{"origen":{"modo":"fijo","valor":"Mdeo"},"destino":{"modo":"fijo","valor":"Bella Unión"}}',
  1, 0,
  '[{"origen":"Mdeo","origen_id":null,"destino":"Bella Unión","destino_id":null,"remitente":"Agencia","remitente_id":'
    || (SELECT id FROM libreta WHERE tipo='remitente' AND nombre='Agencia' ORDER BY id LIMIT 1)
    || ',"clientes":["Galpón"],"cliente_ids":['
    || (SELECT id FROM libreta WHERE tipo='destinatario' AND nombre='Galpón' ORDER BY id LIMIT 1)
    || '],"cantidad":null,"unidad":"pallets","remito":null}]',
  0, 0, 1, 1
WHERE NOT EXISTS (
  SELECT 1 FROM trip_templates t
  JOIN providers p ON p.id = t.provider_id AND p.name = 'Agencia'
  WHERE t.name = 'Mdeo → Bella Unión (Agencia → Galpón)'
);
