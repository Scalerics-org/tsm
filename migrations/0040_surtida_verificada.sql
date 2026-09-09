-- La marca de "ya chequeé esta boleta", para la oficina.
--
-- "Yo voy a tener que chequear todos los litros que ellos echan con la factura. O sea, lo que
-- ingresan con la factura sí o sí. Y a modo de control y corrección a la oficina, chequear
-- eso." — el cliente.
--
-- POR QUÉ HACE FALTA. Los litros los tipea el chofer y la foto de la boleta ya se guarda, así
-- que la evidencia está: lo que faltaba era dónde dejar constancia de que alguien la miró. Sin
-- eso, la surtida que se revisó y la que nadie abrió nunca se ven exactamente igual, y no hay
-- forma de saber por dónde se iba quedando.
--
-- Y NO ES UN DETALLE ADMINISTRATIVO. Menos litros declarados = mejor consumo: un chofer que
-- anota 250 donde cargó 300 pasa de 2,7 a 3,2 km/L y queda como el mejor de la flota. El único
-- número que puede mover a mano es ése, porque los km los respalda la foto del tacógrafo.
ALTER TABLE fuel_logs ADD COLUMN verificado_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE fuel_logs ADD COLUMN verificado_at TEXT;

-- Ninguna surtida vieja queda marcada: nadie las verificó todavía, y darlas por buenas de
-- entrada vaciaría de sentido la marca desde el primer día.
