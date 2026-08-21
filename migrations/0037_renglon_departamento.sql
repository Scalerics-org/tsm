-- El departamento de cada carga, en los viajes que ya tienen la lista curada de lugares.
--
-- "En el combinado, cuando pone agregar viaje toma como referencia y base el de BU. Cuando
-- pones agregar carga tiene que aparecer los departamentos y dónde carga."
--
-- El combinado Mdeo → Bella Unión nació con origen y destino FIJOS, así que cada carga heredaba
-- "Mdeo" sin que el chofer eligiera nada. El dato de dónde cargó de verdad se perdía.
--
-- ¿POR QUÉ UNA BANDERA NUEVA Y NO PRENDER renglon_pide_ubicacion?
-- Porque esa bandera hace otra cosa: cambia el formulario ENTERO al modo ocasional, donde el
-- lugar de carga y el cliente se escriben a mano. Eso tiraría los 17 lugares curados de 0023 y
-- —peor— guardaría el renglón con remitente_id y cliente_ids en null, que es justo lo que las
-- reglas de cobro necesitan para facturar solas. La regla Sika → Agronorte dejaría de andar.
--
-- Esta bandera suma el departamento SIN tocar nada de eso: el chofer elige departamento y
-- después el lugar de la lista de siempre.
--
-- Va por plantilla y no para todos porque la misma pantalla la usan UAM, Agencia y Manassi,
-- donde el origen fijo ES el correcto y preguntar el departamento sería una pregunta de más.
ALTER TABLE trip_templates ADD COLUMN renglon_pide_departamento INTEGER NOT NULL DEFAULT 0;

UPDATE trip_templates
   SET renglon_pide_departamento = 1
 WHERE multi_renglon = 1
   AND renglon_pide_ubicacion = 0
   AND name LIKE '%COMBINADO%';
