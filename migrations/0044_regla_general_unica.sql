-- Una sola regla "cualquier destino" por lugar de carga.
--
-- La tabla tiene UNIQUE(remitente_id, destinatario_id), y en SQLite dos NULL NO son iguales
-- dentro de un índice único: el ON CONFLICT del upsert nunca disparaba para la regla general
-- (destinatario_id NULL). Redefinirla insertaba una SEGUNDA fila, y como `resolveCobro` se
-- queda con la primera que devuelve la consulta —sin ORDER BY, o sea la más vieja— la oficina
-- corregía a quién facturarle, la pantalla decía "Regla guardada" y se seguía cobrando igual
-- que antes.
--
-- El índice parcial es lo que hace que ese ON CONFLICT tenga a qué agarrarse.
CREATE UNIQUE INDEX IF NOT EXISTS idx_regla_general
  ON cobro_reglas (remitente_id) WHERE destinatario_id IS NULL;
