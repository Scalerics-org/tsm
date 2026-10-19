# TSM · Control de viajes y combustible

Sistema para que los choferes de **Transporte Santa María** registren sus viajes desde el celular
—con la evidencia fotográfica que la oficina necesita para facturar— y para que la oficina deje de
reconstruir esa información a mano desde WhatsApp y Excel.

Cuatro roles: **chofer** (móvil), **encargado/operaciones** (escritorio), **administrador** y
**lector** (solo mirar — ve los viajes y recibe los avisos, sin editar nada).

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
| `foto_carga_requerida` | Si se exige foto de la carga para cerrar (default `1`; `0` en los combinados) |
| `campos_ubicacion` | Partes que se resuelven con la libreta (ver abajo). `NULL` = flujo clásico |
| `active` | Si le aparece o no al chofer |

### Libreta

La **libreta** es una lista curada de remitentes, destinatarios y lugares. El chofer elige de ahí en vez
de escribir; si aparece uno nuevo lo agrega y sigue viaje, y queda marcado como `nuevo` para que la
oficina lo confirme. Evita que entren `Galpón` / `GALPON` / `galpon` como tres cosas distintas, que
fragmentaría los reportes de facturación.

Las **reglas de cobro** (`cobro_reglas`) definen a quién se factura cada combinación
`remitente + destinatario`; con `destinatario_id NULL` la regla aplica a cualquier destino.

La oficina la administra en **Panel → Libreta** (`/panel/libreta`): confirma las altas de los choferes,
renombra, fusiona duplicados y define las reglas. Las cargas que quedaron sin regla se muestran
**agrupadas por combinación**, porque el trabajo es una regla por combinación y no uno por viaje;
al guardar una regla se aplica también a las cargas ya registradas que la estaban esperando
(`completarPendientes`), así el contador de pendientes efectivamente baja.

Las plantillas actuales tienen `campos_ubicacion` en `NULL`, así que el chofer sigue viendo el flujo
clásico hasta que se carguen las plantillas nuevas. Ver
[docs/spec-viajes-flexibles.md](docs/spec-viajes-flexibles.md).

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
```

No hay `db:seed:remote`: `0007_seed_real.sql` empieza con varios `DELETE` (viajes, fotos, surtidas,
plantillas, proveedores) y sólo tiene sentido en una base de desarrollo vacía. Correrlo contra
producción borra los viajes reales del cliente.

Las migraciones son incrementales y se aplican en orden. `0007_seed_real.sql` carga los clientes reales
(Casarone, Nayna, Molino Cañuelas) junto con viajes de ejemplo.

### Limpiar los datos de ejemplo (puesta en marcha)

```bash
npx wrangler d1 execute logistica_db --local --file scripts/go-live-limpiar-demo.sql
```

Borra viajes, fotos y surtidas de ejemplo sin tocar clientes, plantillas, camiones ni choferes —
pero sin filtrar cuáles son de ejemplo y cuáles no. Sólo con `--local`, para dejar limpia una base
de desarrollo antes del piloto. Ver la advertencia arriba del `.sql`: contra producción borra los
viajes reales.

## Fotos (R2)

**R2 está habilitado** (`[[r2_buckets]]` en `wrangler.toml`, bucket `logistica-fotos`). Las fotos de
carga, descarga y documentación se guardan ahí y se sirven con token desde `/api/photos/*`.

Si en algún entorno todavía no está el bucket, el sistema no se rompe: `POST /api/photos` detecta el
binding ausente, devuelve `{ skipped: true }` y **el viaje se cierra igual, sin evidencia**. Para
habilitarlo desde cero en un entorno nuevo:

```bash
npx wrangler r2 bucket create logistica-fotos
```

Y descomentar el bloque `[[r2_buckets]]` en `wrangler.toml` si estuviera comentado.

## Secrets

En local van en `.dev.vars` (no se commitea). En producción, el proyecto corre en Workers (no en
Pages), así que el comando es:

```bash
npx wrangler secret put JWT_SECRET
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

## Usuarios

Los usuarios de oficina (admin, encargado, lector) se crean desde **Panel → Usuarios**. Los choferes
se dan de alta desde **Panel → Choferes**: entran con la patente de su camión y un PIN de 4 dígitos
o más que les asigna la oficina.

**En producción no hay cuentas de demo** — se reemplazaron por los usuarios reales de Transporte
Santa María apenas arrancó el uso real, y la pantalla de login ya no las muestra.

Para desarrollo local, las migraciones sí traen credenciales de prueba (`migrations/0005_seed_v2.sql`,
que `npm run db:migrate:local` aplica junto con el resto):

| Rol | Acceso (solo local) |
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

### Ambiente de prueba

**https://prueba.tsm.scalerics.com** es una copia de producción donde Rodrigo mira cada cambio antes de que
llegue a los choferes (el porqué está en `docs/DECISIONES.md`). Es otro Worker (`tsm-prueba`) con su propia base
(`logistica_db_prueba`) y su propio bucket de fotos (`logistica-fotos-prueba`); la config está en
`[env.prueba]` de `wrangler.toml`. Arriba de todas las pantallas lleva una franja amarilla que dice
**AMBIENTE DE PRUEBA**: la prende la variable `AMBIENTE = "prueba"`, que `/api/health` devuelve y la app lee.

Desplegar un cambio a la prueba (no hace falta el árbol limpio; avisa si hay cambios sin commitear):

```bash
npm run db:migrate:prueba && npm run deploy:prueba
curl -s https://prueba.tsm.scalerics.com/api/health   # tiene que decir "ambiente":"prueba"
```

Como en producción, **primero las migraciones y después el código**.

**Paso 0, una sola vez: la marca de la base de prueba.** El .sql de la copia empieza con `DROP TABLE` de todas las
tablas, y `logistica_db` (producción) y `logistica_db_prueba` se llaman casi igual: un nombre mal escrito en el
comando de carga borraría producción. Por eso el .sql arranca con una instrucción que toca la tabla `_solo_prueba`,
que existe SÓLO en la base de prueba (no va en `migrations/`, producción no la tiene nunca). En una base sin la
marca esa primera instrucción da "no such table" y la carga se corta antes de borrar nada. Se crea una vez:

```bash
npx wrangler d1 execute logistica_db_prueba --env prueba --remote --command "CREATE TABLE IF NOT EXISTS _solo_prueba (id INTEGER PRIMARY KEY CHECK (id = 1)); INSERT OR REPLACE INTO _solo_prueba (id) VALUES (1);"
```

Nunca se borra: los refrescos siguientes la necesitan.

**Refrescar la prueba con los datos de hoy** (siempre de producción a prueba, nunca al revés):

```bash
# 1. Respaldo de producción (sólo lee)
npx wrangler d1 export logistica_db --remote --output "<carpeta de respaldos>\tsm-AAAAMMDD-HHMM.sql"

# 2. Arma el .sql para la prueba: sin suscripciones push ni contadores de login. Queda al lado del respaldo.
node scripts/prueba-desde-respaldo.mjs "<carpeta de respaldos>\tsm-AAAAMMDD-HHMM.sql"

# 3. Lo carga en la prueba (borra y vuelve a crear las tablas) y aplica las migraciones que la prueba tenga de más
npx wrangler d1 execute logistica_db_prueba --env prueba --remote --file="<carpeta de respaldos>\tsm-AAAAMMDD-HHMM-para-prueba.sql"
npm run db:migrate:prueba

# 4. La zafra de arroz no viene de producción: se vuelve a cargar a mano (script, nunca migración)
npx wrangler d1 execute logistica_db_prueba --env prueba --remote --file=scripts/zafra-de-arroz.sql

# 5. SÓLO EN LA PRUEBA: el script la deja con fecha (los choferes la ven recién el 15/1/2027); para que Rodrigo la
#    vea ya, se le saca la fecha a las 7 plantillas
npx wrangler d1 execute logistica_db_prueba --env prueba --remote --command "UPDATE trip_templates SET visible_desde = NULL WHERE provider_id = (SELECT id FROM providers WHERE name = 'Zafra de arroz');"
```

Cosas a saber:

- El archivo generado tiene datos reales (choferes, viajes, hashes de contraseñas): vive en la carpeta de
  respaldos del cliente, nunca en el repo (el script se niega a escribirlo acá).
- Las **fotos** no se copian: los viajes copiados apuntan a archivos del bucket de producción y en la prueba el
  visor dice "No se pudo cargar la imagen". Las fotos que se saquen en la prueba sí andan.
- Refrescar vuelve la base de la prueba a lo que tiene producción. Si en la prueba hay una migración que
  producción todavía no tiene, esa tabla nueva se queda y al migrar de nuevo falla por "ya existe": en ese caso
  recreá la base de prueba en vez de refrescarla.
- La zafra de arroz vive en `scripts/zafra-de-arroz.sql`, no en `migrations/`: el refresco la borra, así que hay que volver
  a correr el paso 4 (y el 5). En producción se corre sólo con el OK de Rodrigo, y SIN el paso 5: queda cargada y
  activa con `visible_desde = 2027-01-15`, invisible para los choferes hasta ese día, y después le aparece sola al GTP 4371.
- **Plantillas con fecha:** en Plantillas, "Visible para los choferes desde" hace que una plantilla aparezca sola en el
  celular a partir de ese día (de Uruguay). La oficina la ve siempre, con la marca "Choferes: desde …" mientras falte.
  Para que la vean antes, se borra la fecha y se guarda.
- Secrets del env prueba (`--env prueba`): `JWT_SECRET` y `VAPID_PRIVATE`, propios de la prueba. Con los de
  producción, un token de un ambiente entraría en el otro.

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
