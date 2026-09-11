-- Límite de intentos del login.
--
-- La auditoría del 11/9 encontró que ni el login del chofer ni el de oficina contaban intentos.
-- El del chofer es patente + PIN de 4 dígitos, y la patente es pública (se ve en la calle y en
-- los remitos): 10.000 combinaciones sin ningún freno. Con esto, 5 fallos seguidos bloquean esa
-- patente (o ese email) 15 minutos, y 20 fallos desde una misma IP la bloquean a ella.
--
-- clave: "patente:GTP4413", "email:alguien@x.com" o "ip:1.2.3.4".
-- Fechas en UTC, "YYYY-MM-DD HH:MM:SS", igual que el resto de la base.
CREATE TABLE IF NOT EXISTS intentos_login (
  clave           TEXT PRIMARY KEY,
  fallos          INTEGER NOT NULL DEFAULT 0,
  bloqueado_hasta TEXT,
  actualizado     TEXT NOT NULL
);
