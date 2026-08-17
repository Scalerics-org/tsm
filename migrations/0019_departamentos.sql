-- Los 19 departamentos, para filtrar antes de elegir el lugar de carga o descarga.
--
-- Van en su propia tabla y NO como un tipo más de libreta. El primer intento fue extender
-- el CHECK de `libreta`, que en SQLite obliga a recrear la tabla — y `cobro_reglas` la
-- referencia con ON DELETE CASCADE: el DROP se llevó puestas las 8 reglas de facturación
-- en la prueba local. Ni con `defer_foreign_keys` se salvó.
--
-- Además el encaje es mejor así: un departamento no se da de alta desde la ruta, no se
-- fusiona, no tiene estado "nuevo" ni reglas de cobro. Es una lista fija.

CREATE TABLE departamentos (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL UNIQUE
);

INSERT INTO departamentos (nombre) VALUES
  ('Artigas'), ('Canelones'), ('Cerro Largo'), ('Colonia'), ('Durazno'),
  ('Flores'), ('Florida'), ('Lavalleja'), ('Maldonado'), ('Montevideo'),
  ('Paysandú'), ('Río Negro'), ('Rivera'), ('Rocha'), ('Salto'),
  ('San José'), ('Soriano'), ('Tacuarembó'), ('Treinta y Tres');

-- Cada lugar puede pertenecer a un departamento. Es lo que permite achicar la lista:
-- el chofer elige el departamento y ve sólo los lugares de ahí.
ALTER TABLE libreta ADD COLUMN departamento_id INTEGER REFERENCES departamentos(id);
