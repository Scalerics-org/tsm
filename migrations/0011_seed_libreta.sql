-- Precarga de la libreta con las entidades reales del Excel del cliente.
-- Globales (provider_id NULL) hasta que se creen los clientes Internacional / Varios.

DELETE FROM cobro_reglas;
DELETE FROM libreta;
DELETE FROM sqlite_sequence WHERE name IN ('libreta','cobro_reglas');

-- Remitentes / lugares de carga
INSERT INTO libreta (id,tipo,nombre,provider_id,agrupador,estado) VALUES
  (1,'remitente','Armco',NULL,0,'confirmado'),
  (2,'remitente','Agencia',NULL,0,'confirmado'),
  (3,'remitente','Agronorte',NULL,0,'confirmado'),
  (4,'remitente','Proveedores',NULL,0,'confirmado'),
  (5,'remitente','Saman',NULL,0,'confirmado'),
  (6,'remitente','Casarone',NULL,0,'confirmado'),
  -- Agrupador: se puede usar como nombre de viaje, pero no es seleccionable en un renglón.
  (7,'remitente','Varios',NULL,1,'confirmado');

-- Destinatarios / lugares de descarga
INSERT INTO libreta (id,tipo,nombre,provider_id,agrupador,estado) VALUES
  (20,'destinatario','Galpón',NULL,0,'confirmado'),
  (21,'destinatario','Ancap',NULL,0,'confirmado'),
  (22,'destinatario','C.A.',NULL,0,'confirmado'),
  (23,'destinatario','Tifecom',NULL,0,'confirmado'),
  (24,'destinatario','TGM',NULL,0,'confirmado'),
  (25,'destinatario','Barraca Paraná',NULL,0,'confirmado'),
  -- "Varios Clientes" SÍ es válido como destino: en Bella Unión reparte a muchos clientes
  -- chicos que no tiene sentido enumerar. El cobro se define por quién CARGÓ, no por cada
  -- entrega, así que el dato que no puede perderse está del lado del remitente.
  (26,'destinatario','Varios Clientes',NULL,0,'confirmado');

-- Lugares (orígenes variables de los internacionales)
INSERT INTO libreta (id,tipo,nombre,provider_id,agrupador,estado) VALUES
  (40,'lugar','Arg. Mercedes Ctes.',NULL,0,'confirmado'),
  (41,'lugar','Arg. Rosario',NULL,0,'confirmado'),
  (42,'lugar','Arg. Gualeguaychú',NULL,0,'confirmado'),
  (43,'lugar','Arg. Chacabuco',NULL,0,'confirmado'),
  (44,'lugar','Arg. San Salvador',NULL,0,'confirmado'),
  (45,'lugar','Concordia',NULL,0,'confirmado');

-- Reglas de facturación. Incluye a propósito el caso que obliga a que la clave sea el par:
-- Armco se cobra distinto según el destino.
INSERT INTO cobro_reglas (remitente_id,destinatario_id,cobro_tipo,cobro_a) VALUES
  (1, 26,  'cliente',   'Armco'),       -- Armco -> Varios Clientes
  (1, 20,  'proveedor', 'Armco'),       -- Armco -> Galpón  (mismo remitente, otro cobro)
  (2, NULL,'proveedor', 'Agencia'),     -- Agencia -> cualquier destino
  (3, NULL,'cliente',   'Agronorte'),
  (4, NULL,'proveedor', 'Proveedores');
