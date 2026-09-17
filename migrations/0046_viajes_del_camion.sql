-- Los viajes que ve un camión.
--
-- "El 4383. Solo ese tendría que ver esas opciones. Esos 4 viajes tendría que ver el 4383,
-- porque ese camión hace solo eso." — Rodrigo, 16/9/2026:
--   Viaje 1 = UAM (como está hoy)          plantilla 17, Bella Unión → Mdeo
--   Viaje 2 = UAM - Retorno                 plantilla 18, Mdeo → Bella Unión (Puestos → Galpón)
--   Viaje 3 = Agencia (como está hoy)       plantilla 22
--   Viaje 4 = Mdeo - BU (como está hoy)     plantilla 5
--
-- `template_trucks` va al revés —de la plantilla a los camiones— y no sirve: Agencia y
-- Mdeo - BU son de todos, y asignarlas al 4383 se las sacaría al resto de la flota.
--
-- Camión sin filas acá = ve lo de siempre. Es el fallo seguro: si esta lista se pierde, el
-- camión vuelve a ver lo de todos en vez de quedarse sin viajes.
CREATE TABLE IF NOT EXISTS camion_plantillas (
  truck_id    INTEGER NOT NULL REFERENCES trucks(id) ON DELETE CASCADE,
  template_id INTEGER NOT NULL REFERENCES trip_templates(id) ON DELETE CASCADE,
  PRIMARY KEY (truck_id, template_id)
);

-- Por patente e id existentes: en una base donde no estén, no inserta nada.
INSERT OR IGNORE INTO camion_plantillas (truck_id, template_id)
SELECT tr.id, tt.id
  FROM trucks tr, trip_templates tt
 WHERE tr.plate = 'GTP 4383' AND tt.id IN (17, 18, 22, 5);

-- "UAM - Retorno" es el nombre que le puso Rodrigo. Sólo si sigue siendo la de Puestos.
UPDATE trip_templates SET name = 'UAM - Retorno'
 WHERE id = 18 AND name = 'Mdeo → Bella Unión (Puestos)';
