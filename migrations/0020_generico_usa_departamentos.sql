-- El viaje ocasional pedía la ciudad de carga contra el tipo "lugar" de la libreta,
-- que son los orígenes de los INTERNACIONALES: Arg. Rosario, Arg. Chacabuco, Concordia.
-- Al chofer le aparecían 6 ciudades argentinas para un viaje Salto → Montevideo.
--
-- Va contra los 19 departamentos, que es para lo que el cliente los pidió.

UPDATE trip_templates
SET campos_ubicacion = '{"origen":{"modo":"libreta","label":"Ciudad de carga","libreta_tipo":"departamento","permite_alta":false},"destino":{"modo":"libreta","label":"Destino","libreta_tipo":"departamento","permite_alta":false}}'
WHERE renglon_pide_ubicacion = 1;
