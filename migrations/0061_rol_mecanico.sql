-- El rol "mecánico": Raúl ve sólo el Taller, y no toca nada más.
--
-- Plan del Taller real (instrucciones/PLAN-taller-real.md, fase 1), con la opción A que eligió Gonzalo: 'mecanico' entra
-- al CHECK de `users.role`, que se sigue validando en la base. Esta migración NO le cambia el rol a nadie: eso lo hace el
-- administrador desde la pantalla de Usuarios, como con el lector.
--
-- 'cliente' queda RESERVADO en la base: es el usuario de un cliente o proveedor que vea solo sus cargas (pedido de Rodrigo,
-- 24/11/2026). Se agrega acá para no tener que rehacer `users` otra vez, pero todavía NO tiene permisos ni pantallas: no está
-- en ROLES de shared/domain.ts, así que el servidor lo rechaza por defecto (403 en cualquier ruta) si alguien lo pusiera a
-- mano en la base. Tampoco hay una columna para saber de qué cliente es: eso es un ADD COLUMN aditivo y se decide cuando se
-- programe la funcionalidad.
--
-- SQLite no sabe cambiar un CHECK: hay que rehacer la tabla, y rehacerla a lo bruto rompe datos. Es el mismo problema de
-- la 0049 (el rol 'lector'), con una diferencia que importa: DESDE ENTONCES APARECIERON MÁS COLUMNAS QUE APUNTAN A users, y
-- copiar la 0049 tal cual se llevaría puesto el rastro de quién facturó y quién cobró por cliente.
--
--   DROP TABLE hace un DELETE implícito de todas las filas, y ese DELETE dispara las acciones de las claves foráneas que
--   apuntan a users(id): se borran TODAS las suscripciones a los avisos (ON DELETE CASCADE) y se vacían las columnas *_by
--   (ON DELETE SET NULL). En D1 no hay forma de evitarlo ("user queries cannot change this", dice la documentación de
--   Cloudflare sobre `PRAGMA foreign_keys`); lo único que se puede es DIFERIR la validación con `defer_foreign_keys`, que no
--   frena las acciones en cascada, sólo la queja del final. Así que se guarda a mano lo que el DROP se va a llevar y se
--   repone después: resguardar, rehacer la tabla, reponer.
--
-- LAS COLUMNAS QUE APUNTAN A users(id) (verificado con `git grep "REFERENCES users" -- migrations` y contra el esquema de un
-- respaldo real del 23/10/2026): DIEZ.
--
--   push_subscriptions.user_id               ON DELETE CASCADE   (0003)  → se resguarda la tabla entera
--   trips.facturado_by                       ON DELETE SET NULL  (0032)
--   trips.pago_by                            ON DELETE SET NULL  (0032)
--   fuel_logs.edited_by                      ON DELETE SET NULL  (0029)
--   fuel_logs.verificado_by                  ON DELETE SET NULL  (0040)
--   lecturas_odometro.edited_by              ON DELETE SET NULL  (0031)
--   surtidas_frio.edited_by                  ON DELETE SET NULL  (0045)
--   horas_frio.updated_by                    ON DELETE SET NULL  (0045)  → sin id: su clave es (camión, mes)
--   viaje_cliente_facturacion.facturado_by   ON DELETE SET NULL  (0055)  ← POSTERIOR a la 0049, que no la conoce
--   viaje_cliente_facturacion.pago_by        ON DELETE SET NULL  (0055)  ← POSTERIOR a la 0049, que no la conoce
--
-- Ojo: el `grep` da UNA MÁS, `trips.created_by` (0001, NOT NULL REFERENCES users). Ya no existe: la 0004 (modelo v2) rehízo
-- `trips` sin esa columna, y en el esquema real no está. Un test de la migración (tests/rol-mecanico-migracion.test.ts) compara
-- esta lista contra `pragma_foreign_key_list` de TODAS las tablas: si mañana alguien suma una columna hacia users sin
-- agregarla acá, falla.
PRAGMA defer_foreign_keys = true;

-- ── 1. Resguardo de lo que el DROP se lleva ──
CREATE TABLE _resguardo_push AS SELECT * FROM push_subscriptions;

-- Las columnas con `id` que quedarían en NULL, en una sola lista (tabla, columna, fila, valor). Van en INSERT separados y no
-- en un UNION ALL largo porque D1 corta ahí: "too many terms in compound SELECT" (se descubrió con la 0049).
CREATE TABLE _resguardo_users_ref (tabla TEXT, col TEXT, fila INTEGER, valor INTEGER);
INSERT INTO _resguardo_users_ref SELECT 'trips', 'facturado_by', id, facturado_by FROM trips WHERE facturado_by IS NOT NULL;
INSERT INTO _resguardo_users_ref SELECT 'trips', 'pago_by', id, pago_by FROM trips WHERE pago_by IS NOT NULL;
INSERT INTO _resguardo_users_ref SELECT 'fuel_logs', 'edited_by', id, edited_by FROM fuel_logs WHERE edited_by IS NOT NULL;
INSERT INTO _resguardo_users_ref SELECT 'fuel_logs', 'verificado_by', id, verificado_by FROM fuel_logs WHERE verificado_by IS NOT NULL;
INSERT INTO _resguardo_users_ref SELECT 'lecturas_odometro', 'edited_by', id, edited_by FROM lecturas_odometro WHERE edited_by IS NOT NULL;
INSERT INTO _resguardo_users_ref SELECT 'surtidas_frio', 'edited_by', id, edited_by FROM surtidas_frio WHERE edited_by IS NOT NULL;
INSERT INTO _resguardo_users_ref SELECT 'viaje_cliente_facturacion', 'facturado_by', id, facturado_by FROM viaje_cliente_facturacion WHERE facturado_by IS NOT NULL;
INSERT INTO _resguardo_users_ref SELECT 'viaje_cliente_facturacion', 'pago_by', id, pago_by FROM viaje_cliente_facturacion WHERE pago_by IS NOT NULL;

-- `horas_frio` va aparte: no tiene `id`, su clave es (camión, mes).
CREATE TABLE _resguardo_horas_frio AS
  SELECT truck_id, mes, updated_by FROM horas_frio WHERE updated_by IS NOT NULL;

-- ── 2. La tabla de nuevo, igual pero con 'mecanico' y 'cliente' entre los roles válidos ──
CREATE TABLE users_nueva (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL DEFAULT '',
  role          TEXT NOT NULL CHECK (role IN ('chofer','encargado','admin','lector','mecanico','cliente')),
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

UPDATE viaje_cliente_facturacion SET facturado_by = (SELECT valor FROM _resguardo_users_ref r WHERE r.tabla = 'viaje_cliente_facturacion' AND r.col = 'facturado_by' AND r.fila = viaje_cliente_facturacion.id)
 WHERE id IN (SELECT fila FROM _resguardo_users_ref WHERE tabla = 'viaje_cliente_facturacion' AND col = 'facturado_by');

UPDATE viaje_cliente_facturacion SET pago_by = (SELECT valor FROM _resguardo_users_ref r WHERE r.tabla = 'viaje_cliente_facturacion' AND r.col = 'pago_by' AND r.fila = viaje_cliente_facturacion.id)
 WHERE id IN (SELECT fila FROM _resguardo_users_ref WHERE tabla = 'viaje_cliente_facturacion' AND col = 'pago_by');

UPDATE horas_frio SET updated_by = (SELECT r.updated_by FROM _resguardo_horas_frio r WHERE r.truck_id = horas_frio.truck_id AND r.mes = horas_frio.mes)
 WHERE EXISTS (SELECT 1 FROM _resguardo_horas_frio r WHERE r.truck_id = horas_frio.truck_id AND r.mes = horas_frio.mes);

DROP TABLE _resguardo_push;
DROP TABLE _resguardo_users_ref;
DROP TABLE _resguardo_horas_frio;
