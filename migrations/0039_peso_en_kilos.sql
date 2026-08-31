-- Una sola unidad para el peso de la carga: KILOS.
--
-- "En el tema kilos podemos dejar una unidad sola de medida? Que sean en kilo igual, en mil
-- kilos, 15.000 kilos, 29.000 kilos." — el cliente.
--
-- EL DESORDEN ERA REAL. Los siete viajes con peso cargados en producción:
--     id 14  Casarone  29200      <- kilos
--     id 27  Nayna     29.539     <- toneladas
--     id 28  Casarone  29.7       <- toneladas
--     id 29  Casarone  29.69      <- toneladas
--     id 31  Casarone  29         <- toneladas
--     id 33  Casarone  29         <- toneladas
--     id 34  Casarone  30000      <- kilos
-- Kilos y toneladas en la misma columna, con mil de diferencia. El total por cliente que
-- mostraba la oficina sumaba 59.288 de nada.
--
-- LA CAUSA ERA LA ETIQUETA. El campo pedía "Toneladas" y el remito viene en kilos —el de
-- Casarone marca "Neto 29.710"—, así que unos choferes convertían de cabeza y otros copiaban
-- el papel. Ninguno se equivocaba: el formulario les pedía una cosa y el papel les daba otra.
--
-- NO SE CONVIERTE SOLO EN LA APP, a propósito. Si alguien escribe 29 no hay forma de saber si
-- son 29 kilos o 29 toneladas, y ése es el número con el que se factura. Se fija la unidad en
-- el campo y se avisa cuando el número es demasiado chico para ser una carga.

-- ── Las etiquetas ──
-- Cinco plantillas piden peso. Se cambia el texto que ve el chofer, no la clave del campo:
-- la clave es la que ata el valor guardado en los viajes que ya existen.
UPDATE trip_templates
   SET fields = replace(fields, '"label":"Toneladas de carga"', '"label":"Kilos de carga"')
 WHERE fields LIKE '%"label":"Toneladas de carga"%';

UPDATE trip_templates
   SET fields = replace(fields, '"label":"Toneladas"', '"label":"Kilos de carga"')
 WHERE fields LIKE '%"label":"Toneladas"%';

-- ── Los históricos ──
-- Los que están por debajo de 1.000 son toneladas: un camión cargado no pesa 29 kilos. Es el
-- mismo umbral que usa el aviso de la pantalla (PESO_MINIMO_ESPERADO en shared/domain.ts).
--
-- Los dos que dicen "29" a secas se leen como 29.000 kg. Confirmado con el cliente antes de
-- correr esto: es lo que pesa una carga completa, y los remitos de esos viajes andan por los
-- 29.700 kg.
UPDATE trips
   SET kilos = kilos * 1000
 WHERE kilos IS NOT NULL
   AND kilos > 0
   AND kilos < 1000;
