-- Rastro de la factura que se le sacó a un viaje.
--
-- "Sacarles la factura" existe porque "se va a equivocar alguna vez": el viaje vuelve al
-- resumen y se puede volver a facturar. Pero el número viejo se borraba sin dejar nada, así
-- que si el viaje se vuelve a facturar con OTRO número, la app no tiene con qué saber que ese
-- viaje ya salió una vez en la factura A. En DGI quedan las dos, y el cliente pagado dos veces.
--
-- Guarda sólo la última: alcanza para que la oficina vea "este viaje tuvo la factura A-123" al
-- volver a facturarlo, que es el momento en que se decide.
ALTER TABLE trips ADD COLUMN factura_quitada TEXT;
ALTER TABLE trips ADD COLUMN factura_quitada_at TEXT;
