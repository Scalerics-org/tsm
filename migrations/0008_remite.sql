-- No-op. Las columnas `remite` de trip_templates y trips se agregaban acá, pero el seed
-- de 0007 ya las usa: sobre una base nueva la cadena fallaba con
-- "table trip_templates has no column named remite".
--
-- Los ALTER se movieron al inicio de 0007_seed_real.sql. Esta migración se conserva
-- (sin efecto) porque en las bases que ya la aplicaron figura como ejecutada, y
-- renumerarla rompería ese registro.
SELECT 1;
