-- Los lugares de carga y los clientes del Viaje Combinado Mdeo → Bella Unión,
-- de la planilla del cliente. "Eso es la gran mayoría de los viajes combinados."
--
-- CADA NOMBRE SE INSERTA SÓLO SI NO ESTÁ. No es paranoia: producción ya tiene TIMBER y
-- ONTIL agregados a mano desde la app, y el cliente puede sumar otros por su cuenta antes
-- de que esto se aplique. El UNIQUE de la tabla no sirve de red — provider_id es NULL y
-- SQLite trata los NULL como distintos, así que un INSERT repetido pasaría igual y crearía
-- el duplicado exacto que la libreta existe para evitar.
--
-- Va una sentencia por nombre en vez de un UNION largo: D1 corta los compound SELECT.
--
-- El "OTRO" del final de las dos listas no se carga: es el alta desde la ruta, que el
-- chofer ya tiene en el selector. Y ARMCO/SIKA se dejan como "Armco" y "Sika", que es
-- como ya están y como las referencian las reglas de cobro.

-- ── Lugares de carga ──

INSERT INTO libreta (tipo, nombre, provider_id, agrupador, estado)
SELECT 'remitente', 'TIMBER', NULL, 0, 'confirmado'
WHERE NOT EXISTS (SELECT 1 FROM libreta WHERE tipo='remitente' AND nombre='TIMBER');

INSERT INTO libreta (tipo, nombre, provider_id, agrupador, estado)
SELECT 'remitente', 'ONTIL', NULL, 0, 'confirmado'
WHERE NOT EXISTS (SELECT 1 FROM libreta WHERE tipo='remitente' AND nombre='ONTIL');

INSERT INTO libreta (tipo, nombre, provider_id, agrupador, estado)
SELECT 'remitente', 'AGROFEED', NULL, 0, 'confirmado'
WHERE NOT EXISTS (SELECT 1 FROM libreta WHERE tipo='remitente' AND nombre='AGROFEED');

INSERT INTO libreta (tipo, nombre, provider_id, agrupador, estado)
SELECT 'remitente', 'B.MANZINI', NULL, 0, 'confirmado'
WHERE NOT EXISTS (SELECT 1 FROM libreta WHERE tipo='remitente' AND nombre='B.MANZINI');

INSERT INTO libreta (tipo, nombre, provider_id, agrupador, estado)
SELECT 'remitente', 'B.PARANA', NULL, 0, 'confirmado'
WHERE NOT EXISTS (SELECT 1 FROM libreta WHERE tipo='remitente' AND nombre='B.PARANA');

INSERT INTO libreta (tipo, nombre, provider_id, agrupador, estado)
SELECT 'remitente', 'SUCREE', NULL, 0, 'confirmado'
WHERE NOT EXISTS (SELECT 1 FROM libreta WHERE tipo='remitente' AND nombre='SUCREE');

INSERT INTO libreta (tipo, nombre, provider_id, agrupador, estado)
SELECT 'remitente', 'ACHER', NULL, 0, 'confirmado'
WHERE NOT EXISTS (SELECT 1 FROM libreta WHERE tipo='remitente' AND nombre='ACHER');

INSERT INTO libreta (tipo, nombre, provider_id, agrupador, estado)
SELECT 'remitente', 'ROZEN', NULL, 0, 'confirmado'
WHERE NOT EXISTS (SELECT 1 FROM libreta WHERE tipo='remitente' AND nombre='ROZEN');

INSERT INTO libreta (tipo, nombre, provider_id, agrupador, estado)
SELECT 'remitente', 'REMIPLAT', NULL, 0, 'confirmado'
WHERE NOT EXISTS (SELECT 1 FROM libreta WHERE tipo='remitente' AND nombre='REMIPLAT');

INSERT INTO libreta (tipo, nombre, provider_id, agrupador, estado)
SELECT 'remitente', 'SUMMER', NULL, 0, 'confirmado'
WHERE NOT EXISTS (SELECT 1 FROM libreta WHERE tipo='remitente' AND nombre='SUMMER');

INSERT INTO libreta (tipo, nombre, provider_id, agrupador, estado)
SELECT 'remitente', 'BROMYROS', NULL, 0, 'confirmado'
WHERE NOT EXISTS (SELECT 1 FROM libreta WHERE tipo='remitente' AND nombre='BROMYROS');

INSERT INTO libreta (tipo, nombre, provider_id, agrupador, estado)
SELECT 'remitente', 'MONT FRIO', NULL, 0, 'confirmado'
WHERE NOT EXISTS (SELECT 1 FROM libreta WHERE tipo='remitente' AND nombre='MONT FRIO');

INSERT INTO libreta (tipo, nombre, provider_id, agrupador, estado)
SELECT 'remitente', 'NICOLL', NULL, 0, 'confirmado'
WHERE NOT EXISTS (SELECT 1 FROM libreta WHERE tipo='remitente' AND nombre='NICOLL');

INSERT INTO libreta (tipo, nombre, provider_id, agrupador, estado)
SELECT 'remitente', 'GIANNI', NULL, 0, 'confirmado'
WHERE NOT EXISTS (SELECT 1 FROM libreta WHERE tipo='remitente' AND nombre='GIANNI');

INSERT INTO libreta (tipo, nombre, provider_id, agrupador, estado)
SELECT 'remitente', 'HIERRO MAT', NULL, 0, 'confirmado'
WHERE NOT EXISTS (SELECT 1 FROM libreta WHERE tipo='remitente' AND nombre='HIERRO MAT');

INSERT INTO libreta (tipo, nombre, provider_id, agrupador, estado)
SELECT 'remitente', 'TUBO ACERO', NULL, 0, 'confirmado'
WHERE NOT EXISTS (SELECT 1 FROM libreta WHERE tipo='remitente' AND nombre='TUBO ACERO');

INSERT INTO libreta (tipo, nombre, provider_id, agrupador, estado)
SELECT 'remitente', 'CHARRUA', NULL, 0, 'confirmado'
WHERE NOT EXISTS (SELECT 1 FROM libreta WHERE tipo='remitente' AND nombre='CHARRUA');



-- ── Clientes ──

INSERT INTO libreta (tipo, nombre, provider_id, agrupador, estado)
SELECT 'destinatario', 'Jair', NULL, 0, 'confirmado'
WHERE NOT EXISTS (SELECT 1 FROM libreta WHERE tipo='destinatario' AND nombre='Jair');

INSERT INTO libreta (tipo, nombre, provider_id, agrupador, estado)
SELECT 'destinatario', 'F. Leonardi', NULL, 0, 'confirmado'
WHERE NOT EXISTS (SELECT 1 FROM libreta WHERE tipo='destinatario' AND nombre='F. Leonardi');

INSERT INTO libreta (tipo, nombre, provider_id, agrupador, estado)
SELECT 'destinatario', 'Met. Anfagu', NULL, 0, 'confirmado'
WHERE NOT EXISTS (SELECT 1 FROM libreta WHERE tipo='destinatario' AND nombre='Met. Anfagu');

INSERT INTO libreta (tipo, nombre, provider_id, agrupador, estado)
SELECT 'destinatario', 'BMR', NULL, 0, 'confirmado'
WHERE NOT EXISTS (SELECT 1 FROM libreta WHERE tipo='destinatario' AND nombre='BMR');

INSERT INTO libreta (tipo, nombre, provider_id, agrupador, estado)
SELECT 'destinatario', 'Argenzio', NULL, 0, 'confirmado'
WHERE NOT EXISTS (SELECT 1 FROM libreta WHERE tipo='destinatario' AND nombre='Argenzio');

INSERT INTO libreta (tipo, nombre, provider_id, agrupador, estado)
SELECT 'destinatario', 'N. Valdo Silva', NULL, 0, 'confirmado'
WHERE NOT EXISTS (SELECT 1 FROM libreta WHERE tipo='destinatario' AND nombre='N. Valdo Silva');

INSERT INTO libreta (tipo, nombre, provider_id, agrupador, estado)
SELECT 'destinatario', 'Luis Aplanalp', NULL, 0, 'confirmado'
WHERE NOT EXISTS (SELECT 1 FROM libreta WHERE tipo='destinatario' AND nombre='Luis Aplanalp');



-- B.PARANA queda en las DOS listas a propósito: acá es lugar de carga del combinado, y
-- como "Barraca Paraná" es el lugar de descarga habitual de Minabel. Es la misma barraca
-- cumpliendo dos roles, y el chofer las elige de listas distintas.