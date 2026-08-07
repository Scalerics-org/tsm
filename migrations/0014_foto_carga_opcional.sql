-- Foto de carga opcional por plantilla.
--
-- Hasta acá la foto de carga se exigía siempre salvo en los viajes marcados `viaje_vacio`.
-- En los combinados el chofer carga en 3 o 4 lugares: pedirle una foto por cada uno es
-- documentación excesiva y termina en que no cierra el viaje. El respaldo para facturar
-- pasa a ser el N° de remito del renglón, que se escribe en segundos.
--
-- Default 1: las plantillas que ya existen siguen exigiendo la foto, que es como venían
-- funcionando. La excepción se marca plantilla por plantilla desde oficina.
ALTER TABLE trip_templates ADD COLUMN foto_carga_requerida INTEGER NOT NULL DEFAULT 1;

-- Los viajes vacíos nunca tuvieron carga que fotografiar: se alinea la columna con la
-- regla que ya aplicaba, así la validación puede mirar un solo campo.
UPDATE trip_templates SET foto_carga_requerida = 0 WHERE viaje_vacio = 1;
