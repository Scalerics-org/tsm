-- Libreta curada de remitentes / destinatarios / lugares, y la regla de facturación
-- por combinación (remitente + destinatario). Reemplaza la idea de "historial" pasivo:
-- un historial genera duplicados ("Galpon" / "Galpón" / "GALPON") y eso fragmenta los
-- reportes de facturación, que es justo para lo que se usan estos datos.

CREATE TABLE IF NOT EXISTS libreta (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo        TEXT    NOT NULL CHECK (tipo IN ('remitente','destinatario','lugar')),
  nombre      TEXT    NOT NULL,
  -- NULL = disponible para todos los clientes
  provider_id INTEGER REFERENCES providers(id) ON DELETE CASCADE,
  -- 1 = "Varios" y similares: sirven como nombre de plantilla, NUNCA dentro de un renglón
  agrupador   INTEGER NOT NULL DEFAULT 0,
  -- 'nuevo' = alta hecha por un chofer en la ruta, pendiente de revisión en oficina
  estado      TEXT    NOT NULL DEFAULT 'confirmado' CHECK (estado IN ('confirmado','nuevo')),
  usos        INTEGER NOT NULL DEFAULT 0,
  created_by  INTEGER REFERENCES drivers(id),
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE(tipo, nombre, provider_id)
);

CREATE INDEX IF NOT EXISTS idx_libreta_lookup ON libreta(tipo, provider_id, usos DESC);

-- Regla de facturación. destinatario_id NULL = "aplica a cualquier destino".
-- La clave es el PAR porque un mismo remitente puede cobrarse distinto según a dónde vaya
-- (Armco -> Varios Clientes = cliente, pero Armco -> Galpon = proveedor). Una regla por
-- remitente solo heredaría el valor equivocado en silencio.
CREATE TABLE IF NOT EXISTS cobro_reglas (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  remitente_id    INTEGER NOT NULL REFERENCES libreta(id) ON DELETE CASCADE,
  destinatario_id INTEGER REFERENCES libreta(id) ON DELETE CASCADE,
  cobro_tipo      TEXT    NOT NULL CHECK (cobro_tipo IN ('cliente','proveedor')),
  cobro_a         TEXT    NOT NULL,
  UNIQUE(remitente_id, destinatario_id)
);

CREATE INDEX IF NOT EXISTS idx_cobro_reglas_rem ON cobro_reglas(remitente_id);
