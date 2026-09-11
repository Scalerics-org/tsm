-- Marca los viajes que carga la oficina a mano ("+ Cargar viaje").
--
-- Son viajes que pasaron sin la app, así que nacen sin fotos A PROPÓSITO. La alerta de "Viajes
-- sin foto" no tenía cómo distinguirlos y los iba a marcar todos para siempre — ahora que la
-- oficina carga el atraso por ahí. Hasta hoy sólo se los reconocía por un detalle implícito
-- (nacen con la salida igual a la llegada), que deja de valer en cuanto la oficina les corrige
-- la llegada.
ALTER TABLE trips ADD COLUMN cargado_por_oficina INTEGER NOT NULL DEFAULT 0;

-- Los que ya existen se reconocen por ese detalle, que todavía vale porque recién ahora se
-- puede corregir la llegada. Al 11/9 no hay ninguno: los 99 completados entraron por la
-- pantalla del chofer.
UPDATE trips SET cargado_por_oficina = 1 WHERE edited_by IS NOT NULL AND started_at = finished_at;
