# Sistema de Logística de Camiones — Spec de diseño (MVP)

Fecha: 2026-07-27

## Objetivo
Gestión de viajes de carga con **trazabilidad por evidencia fotográfica** y **seguimiento GPS en vivo**.
Tres roles: chofer (móvil), encargado/operaciones (escritorio), administrador.

## Stack (definido)
- **Frontend:** React + Vite + TypeScript + Tailwind CSS. Deploy en Cloudflare Pages.
- **Backend/API:** Cloudflare Pages Functions (Workers) con Hono (TypeScript). API bajo `/api/*`.
- **DB:** Cloudflare D1 (SQLite) + migraciones SQL.
- **Fotos:** Cloudflare R2.
- **Auth:** JWT (HS256, `jose`) + PBKDF2 (WebCrypto). 3 roles.
- **Mapa:** Leaflet + react-leaflet, tiles OpenStreetMap.
- **Geocodificación inversa:** Nominatim (proxy por el Worker + cache).
- **Ruta / km faltantes:** OSRM (proxy por el Worker + cache).
- **Tiempo real:** polling (chofer hace POST de posiciones ~10s; panel hace GET ~8s).

## Modelo de datos (D1)
- `users`: id, email, password_hash, role (`chofer|encargado|admin`), driver_id?, name, created_at.
- `drivers`: id, name, document, license_number, license_category, license_expiry, phone, status (`activo|inactivo`).
- `trucks`: id, plate, brand, model, year, type, capacity_kg, odometer_km, avg_consumption_l100, status (`disponible|en_viaje|mantenimiento`).
- `trips`: id, driver_id, truck_id, origin, origin_lat, origin_lon, destination, dest_lat, dest_lon, scheduled_at, status, cargo_id, distance_km, departed_at, arrived_at, manual_km?, notes, created_by, created_at.
- `cargos`: id, description, weight_kg, quantity, client, type, doc_number.
- `trip_photos`: id, trip_id, r2_key, kind (`carga_salida|carga_llegada|combustible`), taken_at, lat, lon.
- `trip_positions`: id, trip_id, lat, lon, recorded_at, seq.

Estados de viaje (constante única, sin strings mágicos):
`PENDIENTE → EN_RUTA → COMPLETADO`, extras `CANCELADO`, `CON_INCIDENCIA`.

## Patrón Observer (GPS)
`GpsSubject` envuelve `navigator.geolocation.watchPosition` y notifica a observers en cada fix:
- `OdometerObserver` — acumula km (Haversine).
- `MapObserver` — marcador + polyline (Leaflet).
- `LocalityObserver` — geocodificación inversa (debounce) → localidad/departamento.
- `FuelEstimateObserver` — km × (L/100km) / 100.
- `SyncObserver` — buffer + POST de posiciones al backend con reintento (tolerancia a mala señal).

## API (Hono)
- `POST /api/auth/login`, `GET /api/auth/me`
- `GET /api/trips`, `POST /api/trips`, `GET /api/trips/:id`
- `POST /api/trips/:id/departure`, `POST /api/trips/:id/arrival`, `POST /api/trips/:id/cancel`, `POST /api/trips/:id/incident`
- `POST /api/trips/:id/positions`, `GET /api/trips/:id/positions`
- `POST /api/photos` (→ R2), `GET /api/photos/:key`
- `GET /api/geo/reverse`, `GET /api/geo/route`
- `GET|POST|PUT|DELETE /api/drivers`, `/api/trucks`, `/api/users`
- `GET /api/reports/summary`

## Seguridad / resiliencia
- Cada chofer solo ve sus viajes (enforced server-side por rol).
- Fotos servidas sólo con token válido.
- Cola de posiciones y de fotos con reintento/backoff ante mala señal.
- km GPS con **respaldo manual** siempre disponible.
- Secrets vía `wrangler secret` / `.env`, nunca hardcodeados.

## Datos de ejemplo (seed)
3 choferes, 3 camiones, usuarios de los 3 roles, viajes en PENDIENTE/EN_RUTA/COMPLETADO con posiciones y fotos placeholder.

## Testing
Vitest: Haversine, cálculo de km acumulados, estimado de combustible, hash/verify password, lógica de roles.
