-- Plantilla del viaje combinado Mdeo → Bella Unión, con los nombres reales del
-- cliente (los del Excel del 07/08: Princihogar, Armco y Sika).
--
-- Origen y destino van FIJOS en campos_ubicacion, no en dest_options: el viaje es
-- siempre el mismo y el chofer no tiene que elegir nada. Lo que varía es dónde cargó,
-- y eso va por renglón.
--
-- Ojo: si el destino quedara en dest_options vacío, el chofer no podría iniciar el
-- viaje ("Elegí el destino") — la pantalla exige una opción o un campo fijo.

INSERT INTO providers (name) VALUES ('Combinados');

INSERT INTO trip_templates (
  provider_id, name, origin, remite, cargo_type,
  dest_options, fields, arrival_photo_label, campos_ubicacion,
  multi_renglon, renglones_fijos, pide_kilometros, viaje_vacio,
  foto_carga_requerida, active
) VALUES (
  (SELECT id FROM providers WHERE name = 'Combinados'),
  'Viaje COMBINADO Mdeo - Bella Unión',
  'Mdeo',
  NULL,
  'Varios',
  '[]',
  '[]',
  NULL,
  '{"origen":{"modo":"fijo","valor":"Mdeo"},"destino":{"modo":"fijo","valor":"Bella Unión"}}',
  1,          -- multi_renglon: una línea por lugar de carga
  NULL,
  0,
  0,
  1,          -- foto_carga_requerida: una foto por cada lugar de carga
  1
);

-- Nombres del ejemplo real que faltaban en la libreta. Globales (provider_id NULL)
-- para que aparezcan en cualquier viaje.
--
-- Agronorte se agrega como DESTINATARIO aunque ya exista como remitente: son dos roles
-- distintos y el chofer lo elige de listas distintas. En el ejemplo del cliente,
-- Agronorte es quien recibe la carga que sale de Sika.
INSERT INTO libreta (tipo, nombre, provider_id, agrupador, estado) VALUES
  ('remitente',    'Princihogar', NULL, 0, 'confirmado'),
  ('remitente',    'Sika',        NULL, 0, 'confirmado'),
  ('destinatario', 'Alcalá',      NULL, 0, 'confirmado'),
  ('destinatario', 'Agronorte',   NULL, 0, 'confirmado');

-- Regla de Sika: lo que carga en Sika y va a Agronorte se le factura a Agronorte.
-- (Armco → Varios Clientes ya está cargada desde el seed original.)
--
-- `ORDER BY id DESC LIMIT 1` no es decorativo: si la libreta llegara a tener dos entradas
-- con el mismo nombre, un subquery suelto elegiría una al azar y la regla podría quedar
-- apuntando a la que el chofer no usa — la carga saldría "pendiente" sin motivo aparente.
-- Así queda atada a la fila que crea esta misma migración.
INSERT INTO cobro_reglas (remitente_id, destinatario_id, cobro_tipo, cobro_a)
VALUES (
  (SELECT id FROM libreta WHERE tipo = 'remitente'    AND nombre = 'Sika'      ORDER BY id DESC LIMIT 1),
  (SELECT id FROM libreta WHERE tipo = 'destinatario' AND nombre = 'Agronorte' ORDER BY id DESC LIMIT 1),
  'cliente',
  'Agronorte'
);

-- Princihogar → Alcalá queda A PROPÓSITO sin regla: es lo que permite mostrar en vivo
-- que el sistema no inventa un cobro, lo deja pendiente, y que al definirlo una vez
-- se resuelven todas las cargas que lo estaban esperando.
