# TSM · Control de viajes y combustible

Sistema para que los choferes de **Transporte Santa María** registren sus viajes desde el celular
—con la evidencia fotográfica que la oficina necesita para facturar— y para que la oficina deje de
reconstruir esa información a mano desde WhatsApp y Excel.

Tres roles: **chofer** (móvil), **encargado/operaciones** (escritorio) y **administrador**.

> **El modelo es "viajes precargados".** La oficina define plantillas de viaje por cliente y el chofer
> elige una: no crea viajes ni completa datos libres. Todo lo que se le pide está pensado para hacerse
> con una mano, en un muelle de carga. **No hay GPS ni mapas** — se sacaron a pedido del cliente
> porque no aportaban a la operación real.

## Stack

- **Frontend:** React + Vite + TypeScript + Tailwind CSS, servido por el mismo Worker
  como *static assets* (`[assets]` en `wrangler.toml`)
- **Backend/API:** Cloudflare Workers con Hono (`api/worker.ts`)
- **Base de datos:** Cloudflare D1 (SQLite) + migraciones SQL
- **Fotos:** Cloudflare R2 *(opcional — ver abajo)*
- **Auth:** JWT (HS256) + PBKDF2 (WebCrypto)

## Funcionalidades

### Chofer (celular)

Entra con **patente + PIN** (no usa email). Elige el cliente, después el viaje precargado, y completa
solo los campos que esa plantilla define. Puede **cambiar el camión** si hoy maneja otro.

- **Salida:** destino, campos de carga (remito, toneladas, MIC…), foto de la carga
- **Llegada:** campos de descarga, foto de descarga y observaciones
- **Surtida:** kilometraje, si llenó el tanque, litros. La **foto del tacógrafo solo se pide cuando
  llena** (es lo único que cierra el consumo). Al guardar ve su consumo del tramo y del mes.

### Encargado / operaciones (panel)

- **Resumen:** totales, por camión, por cliente y consumo mensual por camión
- **Control:** viajes atrasados, viajes sin foto, licencias por vencer, consumo anómalo
- **Viajes:** filtros por cliente, chofer, camión, estado y fechas + exportación a Excel
- **Plantillas:** ABM de clientes y de viajes, con campos configurables por viaje
- **Fichas** por camión y por chofer

### Admin

ABM de choferes (con PIN y camión asignado), camiones y usuarios de oficina.

## Modelo de viajes

Una **plantilla** (`trip_templates`) define un viaje repetitivo de un cliente:

| Campo | Para qué |
|---|---|
| `origin`, `remite` | Origen y quién remite la carga |
| `dest_options` | Pares destino + destinatario que el chofer elige |
| `fields` | Campos configurables (texto/número), por etapa (carga o descarga) y obligatorios o no |
| `arrival_photo_label` | Etiqueta de la foto de descarga (`null` = no se pide) |
| `campos_ubicacion` | Partes que se resuelven con la libreta (ver abajo). `NULL` = flujo clásico |
| `active` | Si le aparece o no al chofer |

### Libreta (en construcción — Etapa 2)

La **libreta** es una lista curada de remitentes, destinatarios y lugares. El chofer elige de ahí en vez
de escribir; si aparece uno nuevo lo agrega y sigue viaje, y queda marcado como `nuevo` para que la
oficina lo confirme. Evita que entren `Galpón` / `GALPON` / `galpon` como tres cosas distintas, que
fragmentaría los reportes de facturación.

Las **reglas de cobro** (`cobro_reglas`) definen a quién se factura cada combinación
`remitente + destinatario`; con `destinatario_id NULL` la regla aplica a cualquier destino.

> El backend está desplegado pero **ninguna pantalla lo usa todavía**: las 4 plantillas actuales tienen
> `campos_ubicacion` en `NULL`, así que el chofer ve el flujo de siempre. Ver
> [docs/spec-viajes-flexibles.md](docs/spec-viajes-flexibles.md).

## Requisitos

- Node.js 18+
- Cuenta de Cloudflare para desplegar (en local funciona sin cuenta)
- `wrangler` (viene como dependencia de desarrollo)

## Instalación

```bash
npm install
```

## Base de datos

### Crear la base D1

```bash
npx wrangler d1 create logistica_db
```

Copiá el `database_id` que devuelve y pegalo en `wrangler.toml`.

### Migraciones y datos de ejemplo

```bash
npm run db:migrate:local     # esquema en local
npm run db:seed:local        # datos de ejemplo (clientes reales del Excel)

npm run db:migrate:remote    # esquema en producción
npm run db:seed:remote       # datos de ejemplo en producción
```

Las migraciones son incrementales y se aplican en orden. `0007_seed_real.sql` carga los clientes reales
(Casarone, Nayna, Molino Cañuelas) junto con viajes de ejemplo.

### Limpiar los datos de ejemplo (puesta en marcha)

```bash
npx wrangler d1 execute logistica_db --remote --file scripts/go-live-limpiar-demo.sql
```

Borra viajes, fotos y surtidas de ejemplo sin tocar clientes, plantillas, camiones ni choferes.

## Fotos (R2)

**R2 está deshabilitado.** El binding está comentado en `wrangler.toml` para poder probar el flujo sin
tenerlo contratado: `POST /api/photos` devuelve `{ skipped: true }` y **el viaje se cierra igual**.

Para habilitarlo:

```bash
npx wrangler r2 bucket create logistica-fotos
```

Después descomentá el bloque `[[r2_buckets]]` en `wrangler.toml` y volvé a desplegar.

> Sin R2 el sistema funciona, pero **no guarda evidencia** — que es la mitad del valor para la oficina.
> Es lo primero a habilitar antes de un uso real.

## Secrets

En local van en `.dev.vars` (no se commitea). En producción:

```bash
npx wrangler pages secret put JWT_SECRET
```

## Correr en local

Frontend con hot-reload (Vite en :5173, proxea `/api` al Worker):

```bash
npm run dev
```

Worker completo con los bindings de D1 locales, sobre el build:

```bash
npm run build && npm run dev:worker
```

## Usuarios de ejemplo

Vienen del seed y **hay que reemplazarlos antes de un uso real**. La pantalla de login ya no los muestra.

| Rol | Acceso |
|-----|--------|
| Administrador | `admin@demo.uy` · `demo1234` |
| Encargado | `ops@demo.uy` · `demo1234` |
| Choferes | patentes `STZ 4821`, `BQL 7390`, `MRC 1177` · PIN `1234` |

## Tests

```bash
npm test
```

Cubren la lógica pura: consumo de combustible (tramo y cierre mensual), resolución de las reglas de
cobro y normalización de nombres de la libreta, y verificación de contraseñas.

## Deploy

El proyecto vive en la cuenta de Cloudflare de **Scalerics**, no en una personal.
El `account_id` está en `wrangler.toml`, así que no hace falta exportar nada.

```bash
npm run deploy
```

Publica en **https://tsm.scalerics.com** (dominio propio, configurado como `custom_domain`
en `wrangler.toml`: Cloudflare crea el registro DNS solo).

> **Antes de desplegar, aplicá las migraciones pendientes en producción.**
>
> ```bash
> npm run db:migrate:remote && npm run deploy
> ```
>
> El Worker y la base se despliegan por separado. Si sube código que consulta una columna que todavía
> no existe en producción, la API devuelve 500 y **la app deja de funcionar para los choferes**.
> Ya pasó una vez: es la causa más probable de una caída en este proyecto.

Después de cada deploy, verificá que responda:

```bash
curl -s https://tsm.scalerics.com/api/health
```

## Estructura

```
api/            Backend Hono
  worker.ts     Punto de entrada del Worker
  routes/       Endpoints por recurso (auth, trips, fuel, libreta, reports…)
  repos/        Acceso a D1
  middleware/   Autenticación y roles
migrations/     Esquema y seeds de D1, incrementales
scripts/        Utilidades de puesta en marcha
shared/         Dominio compartido front/back: tipos, constantes y lógica pura
src/            Frontend React
  components/   UI, cámara, foto protegida, layout, selector de libreta
  features/     auth / chofer / operaciones / admin
  lib/          cliente de API, auth, formato, estimación de tiempos
tests/          Vitest
docs/           Specs y propuestas
```

`shared/domain.ts` concentra los tipos y **toda la lógica pura** (consumo, reglas de cobro,
normalización). Es lo que está cubierto por tests y lo que no debería depender de React ni de D1.

## Seguridad

- Cada chofer solo ve y modifica **sus propios viajes** (validado en el backend por rol)
- El chofer **nunca ve información de facturación**: las reglas de cobro son de oficina
- Renombrar, fusionar entradas de libreta y definir reglas requiere rol encargado o admin
- Las fotos se sirven desde R2 solo con token válido
- Contraseñas y PIN hasheados con PBKDF2; JWT firmado con un secret fuera del código
