-- El consumo pasa a medirse en km por litro, que es como lo mide el cliente.
--
-- Su planilla muestra 2,63 para 1249 km con 474,7 litros: eso es km ÷ litros. En L/100 km
-- ese mismo viaje daría 38,01. No es un cambio de formato, es la unidad invertida.
--
-- Ojo con la dirección: en km/L **más es mejor**. La alerta de consumo anómalo, que
-- comparaba "actual > esperado", tuvo que invertirse en el mismo cambio.

ALTER TABLE trucks ADD COLUMN avg_km_litro REAL NOT NULL DEFAULT 0;

-- Se convierte lo ya cargado en vez de pedirlo de nuevo: km/L = 100 ÷ (L/100km).
-- Los camiones sin rendimiento cargado quedan en 0, igual que estaban.
UPDATE trucks
SET avg_km_litro = ROUND(100.0 / avg_consumption_l100, 2)
WHERE avg_consumption_l100 > 0;

-- La columna vieja queda: SQLite no borra columnas sin recrear la tabla, y tenerla al
-- lado permite verificar la conversión si algún número no cierra.

-- Segunda foto de la surtida. El tacógrafo respalda los km y la boleta los litros:
-- son los dos números con los que se calcula el consumo, y hasta ahora sólo se
-- guardaba evidencia de uno.
ALTER TABLE fuel_logs ADD COLUMN r2_key_boleta TEXT;
