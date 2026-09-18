-- Las idas y vueltas de Manassi que ya estaban cerradas, con los km de la vuelta.
--
-- "Esos son siempre cargado con envase, pero es un viaje solo. No lo considero retorno vacío,
-- porque el precio del viaje es ida y vuelta." — Rodrigo, 18/9/2026. Al cerrarse, la app les
-- había estimado sólo la ida; la vuelta aparecía aparte como retorno vacío. Desde ahora el
-- cierre estima los dos tramos (`kmEstimadosDelViaje`); esto arregla los dos que ya estaban.
--
-- Sólo si todavía tienen el número que puso la app: si alguien los corrigió a mano, no se tocan.
UPDATE trips SET kilometros = 1272 WHERE id = 129 AND kilometros = 636;  -- Bella Unión ⇄ Minas
UPDATE trips SET kilometros = 1142 WHERE id = 174 AND kilometros = 571;  -- Artigas ⇄ Minas
