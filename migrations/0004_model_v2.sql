-- Modelo v2: viajes precargados + surtidas. Reemplaza el modelo con GPS.

-- Choferes: PIN de acceso + camión habitual.
ALTER TABLE drivers ADD COLUMN pin_hash TEXT;
ALTER TABLE drivers ADD COLUMN default_truck_id INTEGER REFERENCES trucks(id) ON DELETE SET NULL;

-- Baja de las tablas del modelo viejo.
DROP TABLE IF EXISTS trip_positions;
DROP TABLE IF EXISTS trip_photos;
DROP TABLE IF EXISTS trips;
DROP TABLE IF EXISTS cargos;

-- Proveedores (cartera de clientes).
CREATE TABLE IF NOT EXISTS providers (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL
);

-- Plantillas de viaje (lo "precargado").
CREATE TABLE IF NOT EXISTS trip_templates (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  provider_id    INTEGER NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  origin         TEXT NOT NULL,
  destinations   TEXT NOT NULL DEFAULT '[]',   -- JSON array de strings
  cargo_type     TEXT NOT NULL DEFAULT '',
  requires_kilos INTEGER NOT NULL DEFAULT 0,
  extra_label    TEXT,
  extra_type     TEXT NOT NULL DEFAULT 'none' CHECK (extra_type IN ('none','texto','numero')),
  extra_required INTEGER NOT NULL DEFAULT 0,
  active         INTEGER NOT NULL DEFAULT 1
);

-- Viaje realizado por un chofer.
CREATE TABLE IF NOT EXISTS trips (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  template_id   INTEGER REFERENCES trip_templates(id) ON DELETE SET NULL,
  provider_name TEXT NOT NULL DEFAULT '',
  origin        TEXT NOT NULL,
  destination   TEXT NOT NULL,
  driver_id     INTEGER NOT NULL REFERENCES drivers(id),
  truck_id      INTEGER NOT NULL REFERENCES trucks(id),
  cargo_type    TEXT NOT NULL DEFAULT '',
  kilos         REAL,
  extra_label   TEXT,
  extra_value   TEXT,
  status        TEXT NOT NULL DEFAULT 'EN_CURSO'
                  CHECK (status IN ('EN_CURSO','COMPLETADO','CANCELADO')),
  started_at    TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at   TEXT,
  notes         TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS trip_photos (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  trip_id  INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  r2_key   TEXT NOT NULL,
  kind     TEXT NOT NULL CHECK (kind IN ('carga','descarga','documento')),
  taken_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Surtidas (combustible): foto del tacógrafo + litros + odómetro.
CREATE TABLE IF NOT EXISTS fuel_logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  truck_id    INTEGER NOT NULL REFERENCES trucks(id) ON DELETE CASCADE,
  driver_id   INTEGER REFERENCES drivers(id) ON DELETE SET NULL,
  trip_id     INTEGER REFERENCES trips(id) ON DELETE SET NULL,
  odometer_km REAL NOT NULL,
  liters      REAL NOT NULL,
  is_full     INTEGER NOT NULL DEFAULT 1,
  r2_key      TEXT,
  logged_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_trips_driver ON trips(driver_id);
CREATE INDEX IF NOT EXISTS idx_trips_truck ON trips(truck_id);
CREATE INDEX IF NOT EXISTS idx_trips_status ON trips(status);
CREATE INDEX IF NOT EXISTS idx_templates_provider ON trip_templates(provider_id);
CREATE INDEX IF NOT EXISTS idx_fuel_truck ON fuel_logs(truck_id, odometer_km);
CREATE INDEX IF NOT EXISTS idx_photos_trip ON trip_photos(trip_id);
