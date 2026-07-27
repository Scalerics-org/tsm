# Scalerics Logística — Sistema de Logística de Camiones

MVP funcional para gestionar viajes de carga con **trazabilidad por evidencia fotográfica** y
**seguimiento GPS en vivo**. Tres roles: **chofer** (móvil), **encargado/operaciones** (escritorio)
y **administrador**.

## Stack

- **Frontend:** React + Vite + TypeScript + Tailwind CSS
- **Backend/API:** Cloudflare Pages Functions (Workers) con Hono
- **Base de datos:** Cloudflare D1 (SQLite) + migraciones SQL
- **Fotos:** Cloudflare R2
- **Auth:** JWT (HS256) + PBKDF2 (WebCrypto), 3 roles
- **Mapa:** Leaflet + react-leaflet (tiles OpenStreetMap)
- **Geocodificación inversa:** Nominatim (proxy por el Worker con cache)
- **Ruta / km faltantes:** OSRM (proxy por el Worker con cache)

## Funcionalidades

**Chofer (celular):** login, ver viajes asignados (solo los suyos), registrar **salida** con foto de la
carga, seguimiento **en vivo** (mapa, km recorridos, localidad/departamento, km faltantes y estimado de
gasolina), registrar **llegada** con foto de carga + foto de combustible (km por GPS con respaldo manual),
reportar incidencias.

**Encargado (panel):** crear y asignar viajes, ver todos los viajes con filtros (chofer/camión/fecha/estado),
mapa **en vivo** del camión, fotos de salida/llegada/combustible, **comparación gasolina estimada vs. foto real**,
alertas de viajes atrasados, métricas por camión y chofer.

**Admin:** ABM de choferes, camiones (con rendimiento L/100km) y usuarios/roles.

### Patrón Observer (GPS)

El GPS es el **sujeto observable** (`src/lib/gps/GpsSubject.ts`, envuelve `watchPosition`). Los
**observadores** (`src/lib/gps/observers.ts`) reaccionan a cada nueva posición: mapa, contador de km
(Haversine), localidad (Nominatim), estimado de gasolina y sincronizador con reintento ante mala señal.

## Requisitos

- Node.js 18+
- Cuenta de Cloudflare (para deploy; local funciona sin cuenta)
- `wrangler` (se instala como dependencia de desarrollo)

## Instalación

```bash
npm install
```

## Configuración de D1 y R2

### 1. Crear la base D1

```bash
npx wrangler d1 create logistica_db
```

Copiá el `database_id` que devuelve y pegalo en `wrangler.toml` (campo `database_id`).

### 2. Crear el bucket R2

```bash
npx wrangler r2 bucket create logistica-fotos
```

### 3. Aplicar migraciones y datos de ejemplo

**Local:**

```bash
npm run db:migrate:local
npm run db:seed:local
```

**Producción (remoto):**

```bash
npm run db:migrate:remote
npm run db:seed:remote
```

### 4. Secrets

En local, las variables están en `.dev.vars` (ya incluido, no se commitea).
En producción, cargá el secret del JWT:

```bash
npx wrangler pages secret put JWT_SECRET
```

## Correr en local

Levanta frontend (Vite) + API (Pages Functions) juntos:

```bash
npx wrangler pages dev -- npm run dev
```

Esto sirve el frontend con hot-reload y las Functions bajo `/api/*`, con los bindings de D1 y R2 locales.
Abrí la URL que muestra wrangler (típicamente `http://localhost:8788`).

> Alternativa solo-frontend: `npm run dev` (Vite en :5173) proxea `/api` al worker en :8788.

## Usuarios de demo

Todos con contraseña **`demo1234`**:

| Rol | Email |
|-----|-------|
| Administrador | `admin@demo.uy` |
| Encargado | `ops@demo.uy` |
| Chofer | `carlos@demo.uy`, `marta@demo.uy`, `diego@demo.uy` |

El viaje **Montevideo → Colonia** está *EN RUTA* con traza GPS para ver el seguimiento en vivo.
En escritorio, el chofer puede usar el botón **"Simular movimiento"** para probar el mapa sin GPS real.

## Tests

```bash
npm test
```

Cubre: Haversine y acumulado de km, estimado de combustible, patrón Observer del GPS y verificación de contraseñas.

## Deploy a Cloudflare Pages

```bash
npm run deploy
```

O conectá el repo en el dashboard de Cloudflare Pages:

- **Build command:** `npm run build`
- **Build output directory:** `dist`
- Agregá los bindings de **D1** (`DB`) y **R2** (`FOTOS`) y el secret **`JWT_SECRET`** en la configuración del proyecto.

## Estructura

```
api/            Backend Hono (rutas, repos, middleware, lib) importado por functions/
functions/      Catch-all de Pages Functions (delega /api/* a Hono)
migrations/     SQL de D1 (esquema + seed)
shared/         Dominio y utilidades compartidas front/back (constantes, tipos, geo)
src/            Frontend React
  components/   UI, mapa, cámara, foto protegida, layout
  features/     auth / chofer / operaciones / admin
  lib/          api client, auth, formato, gps (Observer)
tests/          Vitest
```

## Notas de seguridad

- Cada chofer solo ve sus propios viajes (validado en el backend por rol).
- Las fotos se sirven desde R2 solo con token válido.
- Contraseñas hasheadas con PBKDF2; JWT firmado con secret fuera del código.
- Nominatim/OSRM se consumen vía proxy del Worker con cache, respetando sus límites de uso.
