-- Esquema inicial — Sistema de Logística de Camiones (D1 / SQLite)

CREATE TABLE IF NOT EXISTS drivers (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  name           TEXT NOT NULL,
  document       TEXT NOT NULL,
  license_number TEXT NOT NULL DEFAULT '',
  license_category TEXT NOT NULL DEFAULT '',
  license_expiry TEXT NOT NULL DEFAULT '',
  phone          TEXT NOT NULL DEFAULT '',
  status         TEXT NOT NULL DEFAULT 'activo' CHECK (status IN ('activo','inactivo'))
);

CREATE TABLE IF NOT EXISTS trucks (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  plate                TEXT NOT NULL UNIQUE,
  brand                TEXT NOT NULL DEFAULT '',
  model                TEXT NOT NULL DEFAULT '',
  year                 INTEGER NOT NULL DEFAULT 0,
  type                 TEXT NOT NULL DEFAULT '',
  capacity_kg          REAL NOT NULL DEFAULT 0,
  odometer_km          REAL NOT NULL DEFAULT 0,
  avg_consumption_l100 REAL NOT NULL DEFAULT 0,
  status               TEXT NOT NULL DEFAULT 'disponible'
                         CHECK (status IN ('disponible','en_viaje','mantenimiento'))
);

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL DEFAULT '',
  role          TEXT NOT NULL CHECK (role IN ('chofer','encargado','admin')),
  driver_id     INTEGER REFERENCES drivers(id) ON DELETE SET NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS cargos (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  description TEXT NOT NULL,
  weight_kg   REAL,
  quantity    REAL,
  client      TEXT,
  type        TEXT,
  doc_number  TEXT
);

CREATE TABLE IF NOT EXISTS trips (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  driver_id    INTEGER NOT NULL REFERENCES drivers(id),
  truck_id     INTEGER NOT NULL REFERENCES trucks(id),
  origin       TEXT NOT NULL,
  origin_lat   REAL,
  origin_lon   REAL,
  destination  TEXT NOT NULL,
  dest_lat     REAL,
  dest_lon     REAL,
  scheduled_at TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'PENDIENTE'
                 CHECK (status IN ('PENDIENTE','EN_RUTA','COMPLETADO','CANCELADO','CON_INCIDENCIA')),
  cargo_id     INTEGER REFERENCES cargos(id) ON DELETE SET NULL,
  distance_km  REAL NOT NULL DEFAULT 0,
  manual_km    REAL,
  departed_at  TEXT,
  arrived_at   TEXT,
  notes        TEXT,
  created_by   INTEGER NOT NULL REFERENCES users(id),
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS trip_photos (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  trip_id  INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  r2_key   TEXT NOT NULL,
  kind     TEXT NOT NULL CHECK (kind IN ('carga_salida','carga_llegada','combustible')),
  taken_at TEXT NOT NULL DEFAULT (datetime('now')),
  lat      REAL,
  lon      REAL
);

CREATE TABLE IF NOT EXISTS trip_positions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  trip_id     INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  lat         REAL NOT NULL,
  lon         REAL NOT NULL,
  recorded_at TEXT NOT NULL,
  seq         INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_trips_driver  ON trips(driver_id);
CREATE INDEX IF NOT EXISTS idx_trips_status  ON trips(status);
CREATE INDEX IF NOT EXISTS idx_trips_truck   ON trips(truck_id);
CREATE INDEX IF NOT EXISTS idx_positions_trip ON trip_positions(trip_id, seq);
CREATE INDEX IF NOT EXISTS idx_photos_trip   ON trip_photos(trip_id);
