# Spec v2 — Modelo simplificado (viajes precargados)

Fecha: 2026-07-27. Reemplaza al modelo v1 (GPS en vivo) tras feedback del cliente.

## Idea
Reemplazar el registro por WhatsApp de los choferes por una app **muy simple**:
el chofer **elige un viaje precargado**, saca fotos y carga los datos mínimos.
El km/combustible se mide **de surtida a surtida** (foto del tacógrafo + litros),
no por GPS. El admin exporta todo a Excel y ve resúmenes por camión.

## Roles
- **Chofer** (móvil): login por **patente + PIN**. Elige viaje, registra salida/llegada/surtida.
- **Encargado / Admin** (escritorio): login email+password. Gestiona plantillas, ve viajes, resúmenes, exporta.

## Modelo de datos
- **providers**: id, name.
- **trip_templates** (lo "precargado"): id, provider_id, name, origin, destinations (JSON array),
  cargo_type, requires_kilos (0/1), extra_label (null), extra_type (`none|texto|numero`),
  extra_required (0/1), active.
- **drivers** (+): pin_hash, default_truck_id.
- **trucks**: patente, marca, modelo, año, tipo, capacidad, odómetro, rendimiento L/100km, estado.
- **trips** (realizado): template_id, provider_name, origin, destination, driver_id, truck_id,
  cargo_type, kilos, extra_label, extra_value, status (`EN_CURSO|COMPLETADO|CANCELADO`),
  started_at, finished_at, notes.
- **trip_photos**: trip_id, r2_key, kind (`carga|descarga|documento`), taken_at.
- **fuel_logs** (surtidas): id, truck_id, driver_id, trip_id?, odometer_km, liters, is_full (0/1),
  r2_key (foto tacógrafo), logged_at.
- **users**: encargado/admin (email, password_hash, role).

## Flujo del chofer
1. Login patente + PIN → **"Elegí tu viaje"** (plantillas activas, botones grandes).
2. Elige plantilla → destino (lista + "otro"), kilos (si aplica), campo extra (si aplica),
   **foto de carga** → *Confirmar salida* → trip EN_CURSO.
3. **Registrar llegada**: foto de descarga (+ documento opcional) → COMPLETADO.
4. Botón aparte **"Registrar surtida"**: foto del tacógrafo + litros + ¿llenado completo?.

## Panel
- ABM **proveedores** y **plantillas** (con campo extra configurable).
- Lista de **viajes** con fotos, kilos, campo extra, filtros.
- **Resumen por camión** (mensual): km (odómetro entre surtidas), litros, consumo, viajes, toneladas.
- **Exportar a Excel** (CSV) de viajes y surtidas.
- ABM choferes (patente/PIN/camión), camiones, usuarios.

## Consumo (surtida a surtida)
Por camión y período: km = odómetro última surtida − primera; litros = suma de litros;
consumo = litros / km × 100. El "chorro" (is_full=0) suma litros pero no reinicia el tramo.

## Fuera de alcance (v1 removido)
Mapa en vivo, GPS/watchPosition, patrón Observer, ruta OSRM, Nominatim, barra/ETA.
Queda en el historial de git.
