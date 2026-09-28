-- Vencimientos de documentos: camiones (SOA, Permiso Puerto, APPLUS, Sticker) y choferes
-- (Permiso Puerto, Carnet de salud). La libreta de conducir ya existe (`drivers.license_expiry`)
-- y se queda donde está.
--
-- Aditiva y sin valor por defecto: NULL = no se sabe, que no es lo mismo que vencido. Hoy no hay
-- ningún dato cargado y nada de esto frena a nadie: sólo avisa.
--
-- Son fechas de un día ("YYYY-MM-DD"), no instantes.
ALTER TABLE trucks ADD COLUMN venc_soa TEXT;
ALTER TABLE trucks ADD COLUMN venc_permiso_puerto TEXT;
ALTER TABLE trucks ADD COLUMN venc_applus TEXT;
ALTER TABLE trucks ADD COLUMN venc_sticker TEXT;
ALTER TABLE drivers ADD COLUMN venc_permiso_puerto TEXT;
ALTER TABLE drivers ADD COLUMN venc_carnet_salud TEXT;
-- Va ANTES que el código en el deploy: el SELECT de choferes ya lee las columnas nuevas.
