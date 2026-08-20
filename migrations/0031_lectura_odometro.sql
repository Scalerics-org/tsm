-- La auditoría de kilómetros: una lectura del tacógrafo por camión y por mes.
--
-- "Yo voy a depender 100% el día de mañana de lo que me ingresen los choferes para cobrar...
-- si yo me como un viaje en ingresarlo, plata perdida... necesito una forma de yo poder
-- verificar y estar tranquilo."
--
-- El mecanismo lo puso él: "se me ocurrió que el día 1 o 31 exigirle una foto del tacógrafo,
-- o sea son 12 fotos al año... el primero de enero tengo una foto, el 31 de enero tengo la
-- otra, sé que en enero el camión recorrió X kilómetros... hizo tantos viajes cargados... la
-- diferencia son los kilómetros vacíos".
--
-- NO sale de las surtidas, y las descartó con razón: "el gasoil a veces surten el 3 o el 4,
-- no siempre cierran un mes exacto". Por eso ésta es una lectura propia, atada al mes.
CREATE TABLE IF NOT EXISTS lecturas_odometro (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  truck_id    INTEGER NOT NULL REFERENCES trucks(id) ON DELETE CASCADE,

  -- Es "YYYY-MM" y no una fecha: es el mes que la lectura cierra. Con la fecha suelta habría
  -- que adivinar a qué mes pertenece una lectura del 4 de febrero — y eso va a pasar siempre,
  -- porque al chofer se le pide el día 1 y la trae cuando puede parar el camión.
  periodo     TEXT NOT NULL,

  kilometraje REAL NOT NULL,

  -- La evidencia. Admite NULL porque R2 puede no estar bindeado (`c.env.FOTOS`): sin bucket
  -- se guarda igual el número, que es mejor que perder la lectura del mes entero.
  r2_key      TEXT,

  -- Quién la sacó. Lo que se audita es el camión, pero cuando un mes no cierra hay que saber
  -- a quién preguntarle.
  driver_id   INTEGER REFERENCES drivers(id) ON DELETE SET NULL,

  -- El día real de la foto. La oficina tiene que ver la ventana que de verdad se comparó
  -- (del 2 al 4 del mes siguiente, por ejemplo) y no un mes calendario que nunca existió.
  tomada_at   TEXT NOT NULL DEFAULT (datetime('now')),

  -- Rastro de la corrección desde oficina, igual que en las surtidas: un dígito de más en el
  -- kilometraje descuadra este mes y el siguiente, porque los dos lo usan como extremo.
  edited_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  edited_at   TEXT,

  -- Una por camión por mes: son las 12 fotos al año que pidió. Con dos del mismo mes, la
  -- resta pasaría a depender de cuál agarra la consulta.
  UNIQUE (truck_id, periodo)
);

-- La consulta de la auditoría es siempre "este camión, este mes y el anterior".
CREATE INDEX IF NOT EXISTS idx_lecturas_camion ON lecturas_odometro(truck_id, periodo);
