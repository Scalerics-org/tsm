-- La cámara de frío: su gasoil y sus horas.
--
-- "Sabés la surtida. En los dos camiones que te dije, agregale surtida cámara frío. Solo para
-- la boleta del gas oil. Y yo desde la oficina le agrego las horas inicio de mes, final de mes,
-- y ahí me da litros por hora que gasta. Porque el chofer no va a poder registrar las horas."
-- — Rodrigo, 16/9/2026. GTP 4383 y GTP 4382.
--
-- QUÉ CAMIONES. Un tilde en la ficha del camión y no las dos patentes escritas en el código:
-- "algún día otro camión la engancha" y eso lo tiene que poder resolver la oficina.
ALTER TABLE trucks ADD COLUMN camara_frio INTEGER NOT NULL DEFAULT 0;
UPDATE trucks SET camara_frio = 1 WHERE plate IN ('GTP 4382', 'GTP 4383');

-- EN TABLA APARTE Y NO DENTRO DE `fuel_logs`. Todo el km/L —el consumo del mes, el rango de
-- surtidas, Control, el acumulado del chofer— lee `fuel_logs`. El gasoil de la cámara no mueve
-- kilómetros: si cayera ahí, el camión aparecería gastando de más y nadie sabría por qué.
--
-- `truck_id` es CASCADE como en `fuel_logs`, y por la misma razón el borrado del camión cuenta
-- estas surtidas antes de dejarlo borrar (`loAtadoAlCamion`).
CREATE TABLE IF NOT EXISTS surtidas_frio (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  truck_id      INTEGER NOT NULL REFERENCES trucks(id) ON DELETE CASCADE,
  driver_id     INTEGER REFERENCES drivers(id) ON DELETE SET NULL,
  liters        REAL NOT NULL CHECK (liters > 0),
  r2_key_boleta TEXT,
  logged_at     TEXT NOT NULL DEFAULT (datetime('now')),
  edited_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  edited_at     TEXT
);
CREATE INDEX IF NOT EXISTS idx_surtidas_frio_truck ON surtidas_frio(truck_id, logged_at);

-- Las horas del equipo, que anota la oficina: una fila por camión y mes. Cualquiera de las dos
-- puede faltar un tiempo: la de inicio se anota el día 1 y la de fin cuando termina el mes.
CREATE TABLE IF NOT EXISTS horas_frio (
  truck_id     INTEGER NOT NULL REFERENCES trucks(id) ON DELETE CASCADE,
  mes          TEXT NOT NULL,
  horas_inicio REAL,
  horas_fin    REAL,
  updated_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at   TEXT,
  PRIMARY KEY (truck_id, mes)
);
