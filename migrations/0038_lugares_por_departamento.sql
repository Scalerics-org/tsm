-- De qué departamento es cada lugar de carga.
--
-- "Cuando pones agregar carga, te dice el lugar de carga y ahí te aparece SUCREE, AGROFEED,
-- todos los proveedores de Montevideo. En realidad lo que tiene que aparecer es los
-- departamentos y la opción de escribir dónde cargó, tipo Galpón."
--
-- La columna `libreta.departamento_id` existe desde 0019 y está VACÍA en las 25 filas, así
-- que el selector no tenía por dónde filtrar y le mostraba la lista entera al chofer,
-- eligiera el departamento que eligiera.
--
-- SE SIEMBRAN SÓLO LOS 17 DE LA PLANILLA DEL COMBINADO (0023). Que son de Montevideo no es
-- una suposición: son los lugares de carga del viaje "Mdeo → Bella Unión", cuyo origen es
-- Mdeo — cargan ahí por definición de la plantilla — y es como los llamó el propio cliente.
-- Los demás nombres de la libreta NO se tocan: de esos no sabemos el departamento, y quedan
-- en NULL, que el filtro trata como "todavía no clasificado" y sigue mostrando.
--
-- Cualquiera de estos se corrige desde la pantalla de Libreta si alguno no era de Montevideo.
UPDATE libreta
   SET departamento_id = (SELECT id FROM departamentos WHERE nombre = 'Montevideo')
 WHERE tipo = 'remitente'
   AND departamento_id IS NULL
   AND nombre IN (
     'TIMBER','ONTIL','AGROFEED','B.MANZINI','B.PARANA','SUCREE','ACHER','ROZEN','REMIPLAT',
     'SUMMER','BROMYROS','MONT FRIO','NICOLL','GIANNI','HIERRO MAT','TUBO ACERO','CHARRUA'
   )
   AND EXISTS (SELECT 1 FROM departamentos WHERE nombre = 'Montevideo');

-- El índice que usa el filtro del selector.
CREATE INDEX IF NOT EXISTS idx_libreta_departamento ON libreta(tipo, departamento_id);
