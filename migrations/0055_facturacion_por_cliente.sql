-- Factura y pago por cliente dentro del viaje. Ver docs/FACTURACION-POR-CLIENTE.md.
--
-- Pedido de Rodrigo: al lado de cada cliente del viaje, una cajita de "facturado" y otra de "pagado",
-- porque un viaje puede llevar carga para varios clientes y a cada uno se le factura aparte.
--
-- ADITIVA: una tabla nueva y nada más. `trips` no se toca, así que todo lo que hoy tiene
-- `factura_numero` (y su pago) sigue exactamente como está: esos viajes se facturan "por viaje".
-- Un viaje con cargas que NUNCA se facturó pasa a facturarse "por cliente", y sus marcas viven acá.
--
-- Una fila por (viaje, cliente) FACTURADO; sin fila = sin facturar. Sacar la factura deja la fila con
-- `factura_numero` en NULL y el número viejo en `factura_quitada`: el mismo rastro que `trips` ya tiene
-- (0043), para que si el viaje se vuelve a facturar con otro número se vea que ya salió una vez.
-- El pago es de cada cliente y sólo existe con factura.
--
-- `cliente_clave` identifica al cliente dentro del viaje (ver `claveDeCliente` en shared/): el id de la
-- libreta si la oficina lo eligió de ahí, o el nombre normalizado. `cliente_nombre` es cómo se leía al
-- marcar, para mostrarlo y para el rastro.
CREATE TABLE IF NOT EXISTS viaje_cliente_facturacion (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  trip_id            INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  cliente_clave      TEXT    NOT NULL,
  cliente_nombre     TEXT    NOT NULL,
  factura_numero     TEXT,
  facturado_at       TEXT,
  facturado_by       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  factura_quitada    TEXT,
  factura_quitada_at TEXT,
  pago_at            TEXT,
  pago_by            INTEGER REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE (trip_id, cliente_clave)
);

-- Para encontrar de golpe todo lo que salió en una factura (el filtro "factura" de Viajes).
CREATE INDEX IF NOT EXISTS idx_vcf_factura ON viaje_cliente_facturacion (factura_numero);
