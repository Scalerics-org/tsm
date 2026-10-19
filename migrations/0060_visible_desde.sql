-- Plantillas que le aparecen solas a los choferes desde una fecha (zafra de arroz: el 15/01/2027). Aditiva.
--
-- visible_desde: el día (de Uruguay, AAAA-MM-DD) desde el que los CHOFERES ven la plantilla. NULL = sin fecha, como hasta
--                hoy: ninguna plantilla existente cambia lo que ve un chofer. La oficina la ve y la edita siempre.
--
-- No hay nada que programar ni que tenga que correr ese día: la lista del chofer y el alta de un viaje comparan la fecha con
-- el "hoy" de Uruguay en cada pedido (ver `plantillaVisibleParaChofer`, shared/domain.ts).

ALTER TABLE trip_templates ADD COLUMN visible_desde TEXT;
