-- ─────────────────────────────────────────────────────────────
-- PUESTA EN MARCHA · Limpieza de datos de ejemplo
-- ─────────────────────────────────────────────────────────────
-- Borra los viajes, fotos y surtidas de demostración para que el
-- piloto arranque con la base limpia.
--
-- NO toca: proveedores, plantillas de viaje, camiones, choferes ni
-- usuarios de oficina. Esos se reemplazan por los reales aparte.
--
--   npx wrangler d1 execute logistica_db --remote --file scripts/go-live-limpiar-demo.sql
--
-- Para volver a cargar los datos de ejemplo (por si hace falta mostrar
-- el sistema con movimiento antes del piloto):
--   npx wrangler d1 execute logistica_db --remote --file migrations/0007_seed_real.sql
-- ─────────────────────────────────────────────────────────────

DELETE FROM trip_photos;
DELETE FROM fuel_logs;
DELETE FROM trips;

-- Reinicia los numeradores para que el primer viaje real sea el #1
DELETE FROM sqlite_sequence WHERE name IN ('trips','trip_photos','fuel_logs');
