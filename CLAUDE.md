# TSM — Control de viajes y combustible

Sistema para que los choferes de **Transporte Santa María** registren sus viajes desde el celular
(con la foto de evidencia que la oficina necesita para facturar) y para que la oficina deje de
reconstruir esa información a mano desde WhatsApp y Excel. Tres roles: **chofer** (celular),
**encargado/operaciones** (escritorio) y **administrador**.

## Estado

**Producción, en uso diario.** No es una demo ni un prototipo: los choferes registran viajes reales
todos los días. Un bug o una caída afecta la operación real del cliente, no un ambiente de prueba.

## Reglas que no se negocian

1. Español rioplatense en todo: código, comentarios, docs y commits.
2. Nada de dependencias nuevas sin que la tarea lo pida explícitamente.
3. El adaptador (rutas de `api/`, componentes de `src/`) nunca decide una regla de negocio — eso
   vive en `shared/`, que son funciones puras sin `fetch` ni D1 adentro.
4. Migraciones de D1 aditivas. Para borrar una columna hacen falta dos releases.
5. **Las migraciones se aplican antes del deploy, nunca después.** Ver la trampa de abajo: es la
   causa más probable de una caída en este proyecto.
6. Conventional Commits, sin línea de coautoría de ninguna IA.
7. Si un cambio toca `shared/domain.ts`, `shared/rango-surtidas.ts` o `shared/vacios.ts`, correr
   los tests de esos archivos antes de tocar nada más — son los que protegen la plata que se
   factura.

## Trampas del dominio

Cosas que parecen un bug y no lo son. Si algo de acá se "arregla" sin leer esto, el sistema se
rompe en silencio para el cliente.

- **El consumo NO se mide de llenado a llenado.** La oficina mide por calendario:
  `consumoDelPeriodo` en `shared/domain.ts` toma el último odómetro dentro del rango contra el
  último odómetro antes del rango, con todos los litros cargados en el medio — es "la regla del
  calendario del cliente", documentada ahí mismo. La excepción deliberada es la pantalla del
  chofer: `fuelFeedback` sí mide de llenado a llenado, porque es un número en vivo que el chofer
  ve apenas carga, y con la regla de calendario a mitad de mes le daría un número raro. Las dos
  cuentas dan distinto sobre los mismos datos **a propósito** — no las unifiques sin preguntar
  (el comentario en el código lo dice explícito: "NO lo unifiques sin preguntar").

- **Un "chorro" (cargar sin llenar el tanque) no abre tramo de consumo.** Sus litros no se pierden:
  se terminan de contar en el tramo que cierra el llenado siguiente (`shared/rango-surtidas.ts`,
  `tramosDeConsumo`). Si se cuentan solo los llenados, esos litros quedan afuera y el camión
  parece rendir mejor de lo que rinde.

- **Las fechas se guardan en UTC sin zona.** El servidor usa `datetime('now')` de SQLite
  (`"2026-09-18 17:14:00"`, sin offset). `src/lib/format.ts` las pasa a hora local de Uruguay al
  mostrarlas. Leerlas directo del backend sin convertir da **tres horas de más** (ya pasó una vez
  en este proyecto).

- **El odómetro no es monótono.** La oficina puede corregirlo para abajo, así que un chorro puede
  quedar con un km por debajo de un llenado anterior. `fuelFeedback` ordena cronológicamente
  (`logged_at`), no por odómetro — el tiempo sí es monótono, el km no.

- **Migrar antes de desplegar, siempre.** El Worker y la base se despliegan por separado. Si el
  código sube antes de la migración y consulta una columna que todavía no existe en producción,
  la API devuelve 500 y la app deja de funcionar para los choferes en ese momento. Es la causa más
  probable de una caída de este proyecto (ver README, sección Deploy).

- **Los "vacíos" (retornos sin carga) se deducen, no se piden.** `shared/vacios.ts`: las
  plantillas para cargar un viaje vacío existieron un mes entero y nadie las usó nunca. El sistema
  deduce el tramo vacío comparando dónde descargó un viaje contra dónde volvió a cargar el
  siguiente — con los nombres ya normalizados, porque "Montevideo" / "Mdeo" / "MONTEVIDEO" tienen
  que dar 0 km entre sí o dos de cada ocho tramos deducidos serían vacíos inventados por un
  tipeo distinto.

## Comandos

```bash
npm install                              # instalar
npm run dev                              # frontend con hot-reload (Vite en :5173)
npm run build && npm run dev:worker      # Worker completo con D1 local
npm run verify                           # typecheck + test + build — correr antes de cada commit
npm test                                 # solo tests
npm run db:migrate:local                 # migraciones en local
npm run deploy                           # build + deploy (cuenta Scalerics, nunca correr sin confirmar)
```

## Estructura

```
api/            Backend Hono — adaptador, hace I/O, no decide reglas
  worker.ts     Punto de entrada del Worker
  routes/       Endpoints por recurso (auth, trips, fuel, libreta, reports…)
  repos/        Acceso a D1
  middleware/   Autenticación y roles
shared/         Dominio: tipos y TODA la lógica pura (consumo, reglas de cobro, vacíos, libreta)
migrations/     Esquema y seeds de D1, incrementales y aditivas
src/            Frontend React
  components/   UI, cámara, foto protegida, layout, selector de libreta
  features/     auth / chofer / operaciones / admin
  lib/          cliente de API, auth, formato (fechas UTC → local), estimación de tiempos
tests/          Vitest — cubre sobre todo `shared/`
docs/           Specs (spec.md, spec-v2.md) y DECISIONES.md
```

Más detalle de cada funcionalidad y del modelo de "viajes precargados" está en el
[README](README.md).
