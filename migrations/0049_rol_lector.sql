-- El rol "solo mirar": Aníbal ve los viajes y recibe los avisos, y no toca nada.
--
-- "Ya hice el usuario, a mi hermano Aníbal. A él le hacemos que vea SOLAMENTE LOS VIAJES, y
-- para que le llegue la notificación y listo. (…) Y que él tenga opción solo de mirar, no
-- tocar ni corregir. Vaya que toque un dedazo y borre algo jajaja." — Rodrigo, 19/9/2026.
--
-- Esta migración NO le cambia el rol a nadie: eso lo hace Rodrigo desde la pantalla de
-- Usuarios, donde ya está acostumbrado. Lo único que hace es dejar que 'lector' sea un valor
-- válido, porque `users.role` nació con `CHECK (role IN ('chofer','encargado','admin'))`
-- (migración 0001) y ese UPDATE se estrellaba contra la base con un error que no dice nada.
--
-- SQLite no sabe cambiar un CHECK: hay que rehacer la tabla. Y rehacerla a lo bruto rompe
-- datos, que es el motivo de todo el enredo de abajo:
--
--   DROP TABLE hace un DELETE implícito de todas las filas, y ese DELETE dispara las acciones
--   de las siete claves foráneas que apuntan a users(id). O sea: se borran TODAS las
--   suscripciones a los avisos (ON DELETE CASCADE) y se vacían facturado_by, pago_by,
--   edited_by, verificado_by y updated_by de viajes, surtidas, lecturas y cámara de frío
--   (ON DELETE SET NULL) — el rastro de quién facturó y quién corrigió cada cosa.
--
--   En D1 no hay forma de evitarlo: "user queries cannot change this", dice la documentación
--   de Cloudflare sobre `PRAGMA foreign_keys`; lo único que se puede es DIFERIR la validación
--   con `defer_foreign_keys`, que no frena las acciones en cascada, sólo la queja del final.
--
-- Así que se guarda a mano lo que el DROP se va a llevar y se repone después: resguardar,
-- rehacer la tabla, reponer. Probado fila por fila contra una copia de la base local antes de
-- escribirlo acá.
PRAGMA defer_foreign_keys = true;

-- ── 1. Resguardo de lo que el DROP se lleva ──
CREATE TABLE _resguardo_push AS SELECT * FROM push_subscriptions;

-- Las seis columnas con `id` que quedarían en NULL, en una sola lista (tabla, columna, fila, valor).
-- Van en seis INSERT y no en un UNION ALL de seis ramas porque D1 corta ahí: "too many terms
-- in compound SELECT". Se descubrió corriéndola contra la base local, que es para lo que está.
CREATE TABLE _resguardo_users_ref (tabla TEXT, col TEXT, fila INTEGER, valor INTEGER);
INSERT INTO _resguardo_users_ref SELECT 'trips', 'facturado_by', id, facturado_by FROM trips WHERE facturado_by IS NOT NULL;
INSERT INTO _resguardo_users_ref SELECT 'trips', 'pago_by', id, pago_by FROM trips WHERE pago_by IS NOT NULL;
INSERT INTO _resguardo_users_ref SELECT 'fuel_logs', 'edited_by', id, edited_by FROM fuel_logs WHERE edited_by IS NOT NULL;
INSERT INTO _resguardo_users_ref SELECT 'fuel_logs', 'verificado_by', id, verificado_by FROM fuel_logs WHERE verificado_by IS NOT NULL;
INSERT INTO _resguardo_users_ref SELECT 'lecturas_odometro', 'edited_by', id, edited_by FROM lecturas_odometro WHERE edited_by IS NOT NULL;
INSERT INTO _resguardo_users_ref SELECT 'surtidas_frio', 'edited_by', id, edited_by FROM surtidas_frio WHERE edited_by IS NOT NULL;

-- `horas_frio` va aparte: no tiene `id`, su clave es (camión, mes).
CREATE TABLE _resguardo_horas_frio AS
  SELECT truck_id, mes, updated_by FROM horas_frio WHERE updated_by IS NOT NULL;

-- ── 2. La tabla de nuevo, igual pero con 'lector' entre los roles válidos ──
CREATE TABLE users_nueva (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL DEFAULT '',
  role          TEXT NOT NULL CHECK (role IN ('chofer','encargado','admin','lector')),
  driver_id     INTEGER REFERENCES drivers(id) ON DELETE SET NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO users_nueva (id, email, password_hash, name, role, driver_id, created_at)
SELECT id, email, password_hash, name, role, driver_id, created_at FROM users;

DROP TABLE users;
ALTER TABLE users_nueva RENAME TO users;

-- ── 3. Reponer ──
INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, created_at)
SELECT id, user_id, endpoint, p256dh, auth, created_at FROM _resguardo_push;

UPDATE trips SET facturado_by = (SELECT valor FROM _resguardo_users_ref r WHERE r.tabla = 'trips' AND r.col = 'facturado_by' AND r.fila = trips.id)
 WHERE id IN (SELECT fila FROM _resguardo_users_ref WHERE tabla = 'trips' AND col = 'facturado_by');

UPDATE trips SET pago_by = (SELECT valor FROM _resguardo_users_ref r WHERE r.tabla = 'trips' AND r.col = 'pago_by' AND r.fila = trips.id)
 WHERE id IN (SELECT fila FROM _resguardo_users_ref WHERE tabla = 'trips' AND col = 'pago_by');

UPDATE fuel_logs SET edited_by = (SELECT valor FROM _resguardo_users_ref r WHERE r.tabla = 'fuel_logs' AND r.col = 'edited_by' AND r.fila = fuel_logs.id)
 WHERE id IN (SELECT fila FROM _resguardo_users_ref WHERE tabla = 'fuel_logs' AND col = 'edited_by');

UPDATE fuel_logs SET verificado_by = (SELECT valor FROM _resguardo_users_ref r WHERE r.tabla = 'fuel_logs' AND r.col = 'verificado_by' AND r.fila = fuel_logs.id)
 WHERE id IN (SELECT fila FROM _resguardo_users_ref WHERE tabla = 'fuel_logs' AND col = 'verificado_by');

UPDATE lecturas_odometro SET edited_by = (SELECT valor FROM _resguardo_users_ref r WHERE r.tabla = 'lecturas_odometro' AND r.col = 'edited_by' AND r.fila = lecturas_odometro.id)
 WHERE id IN (SELECT fila FROM _resguardo_users_ref WHERE tabla = 'lecturas_odometro' AND col = 'edited_by');

UPDATE surtidas_frio SET edited_by = (SELECT valor FROM _resguardo_users_ref r WHERE r.tabla = 'surtidas_frio' AND r.col = 'edited_by' AND r.fila = surtidas_frio.id)
 WHERE id IN (SELECT fila FROM _resguardo_users_ref WHERE tabla = 'surtidas_frio' AND col = 'edited_by');

UPDATE horas_frio SET updated_by = (SELECT r.updated_by FROM _resguardo_horas_frio r WHERE r.truck_id = horas_frio.truck_id AND r.mes = horas_frio.mes)
 WHERE EXISTS (SELECT 1 FROM _resguardo_horas_frio r WHERE r.truck_id = horas_frio.truck_id AND r.mes = horas_frio.mes);

DROP TABLE _resguardo_push;
DROP TABLE _resguardo_users_ref;
DROP TABLE _resguardo_horas_frio;
