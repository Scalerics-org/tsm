# Plan: facturar por cliente dentro del viaje

Estado: **propuesta para revisión**. No hay código escrito. Nada de esto toca producción.

## 1. Qué se pide y por qué

Rodrigo pidió un tilde de factura y uno de pago **por cliente** del viaje. Hoy factura y pago son una sola cosa por viaje (`trips.factura_numero`, `pago_at`, …).

Datos que justifican hacerlo (consulta a la base real):

| Dato | Valor |
|---|---|
| Viajes ya facturados | 71 |
| …con más de un cliente | 2 |
| Completados esperando factura, con más de un cliente | **24** |
| …de esos, con varios pagadores distintos | **18** (1 con un único pagador) |
| Setiembre: viajes con varias cargas | 21 de 126 (1 de cada 6) |

Lo facturado hasta hoy subestima el caso: los viajes multicliente son nuevos y todavía no se facturaron.

Respuesta de Rodrigo: "pueden ser tres cargas para un cliente, o son 3 cargas totalmente diferentes". La unidad facturable es entonces **el cliente dentro del viaje** (no la carga, no el viaje): tres cargas de un cliente = una factura; tres cargas de tres clientes = tres.

Cambia una premisa escrita en el código (`api/lib/export-viajes.ts:284`): *"UNA FILA POR VIAJE y no por carga, como la suya: se factura el viaje"*. Es el modo de operar de Rodrigo el que cambió, no un error del diseño anterior.

## 2. Lo que el código ya tiene (mapeo con archivo:línea)

Ya existe a nivel carga el dato de "quién paga": `TripSegment.cobro_a` / `cobro_tipo` / `cobro_manual` (`shared/domain.ts:412-449`), resuelto por `resolveCobro` / `aplicarCobro` (`:506-556`). Lo que falta es que **factura y pago** vivan a ese nivel.

Dos comentarios dejan la decisión diferida a propósito:
- `shared/domain.ts:1338` (`clienteDelViaje`): "por ahora SÓLO SE VE… decidió Gonzalo".
- `api/lib/resumen-cliente.ts:196` (`cobrosAjenos`): "cambiar el resumen para que se arme por `cobro_a` es una decisión del cliente, no una corrección".

### Acoplamientos a "el viaje tiene UNA factura"

**Datos:** `migrations/0032_facturacion.sql:14-23` (factura_numero, facturado_at/by, pago_at/by), `0043_factura_quitada.sql:10-11`.

**Lógica pura:** `estadoDeCobro` (`shared/domain.ts:1304`), recibe el viaje entero.

**Rutas de marcado** (`api/routes/facturacion.ts`): `marcar` 83-99, `desmarcar` 107-114, `marcar-pago` 125-139, `desmarcar-pago` 146-153. Repos: `api/repos/trips.ts:720-818`.

**Los 8 frenos "viaje facturado no se toca"** (todos `if (…factura_numero)`):
1. `api/routes/trips.ts:512-523` `PUT /:id/segments`
2. `:735-747` `POST /:id/cancel`
3. `:780-789` `PATCH /:id` (cabecera)
4. `:831-840` `PATCH /:id/fecha`
5. `:862-872` `PATCH /:id/llegada`
6. `:893-902` `DELETE /:id`
7. `api/routes/photos.ts:73-92` `DELETE /photos/:id`
8. `api/lib/enganchar-carga.ts:53-62` `engancharEnViajes`

Acoplados de yapa: `api/repos/trips.ts:471-473` y `:499-500` (no reescribir cobros de viajes facturados), `:258-265` (filtros facturado/pago/factura), `api/lib/resumen-cliente.ts:116-128` (`viajesAFacturar`).

**Excel:** `api/lib/export-viajes.ts:284-332` (`planillaParaFacturar`), `api/routes/reports.ts:358-401`.

**Frontend:** `src/features/operaciones/FilaViaje.tsx` (colores `COLOR_DE_FILA` 51-54, tilde factura ~79-103, tilde pago ~108-120), `ResumenClientePage.tsx` (selección múltiple 106, `marcar` 181-190, `desmarcar` 196-215), `OpsTripsPage.tsx` (filtros), `GET /trips/facturas` → `listReferenciasDeFactura` (`api/repos/trips.ts:825-841`).

## 3. Decisiones de producto a cerrar antes de codear

1. **Bloqueos del viaje entero.** Cabecera, fecha, llegada, borrar y cancelar son del viaje, no de un cliente. Propuesta: si **algún** cliente ya está facturado, se bloquea todo eso; sólo las cargas de los clientes no facturados siguen editables.
2. **Cargas sin `cobro_a` resuelto.** Propuesta: forman un grupo "sin asignar" que no se puede facturar hasta que tengan regla (hoy `PendientesCobroCard` ya las junta).
3. **Pagos.** No hace falta preguntar de nuevo: `marcar-pago` ya acepta varios viajes en un tilde. Al pasar a unidades (viaje, cliente), "me pagaron tres facturas juntas del mismo cliente" queda cubierto por la misma selección múltiple.
4. **Cómo se ve un viaje con clientes en estados distintos.** Propuesta: subfila por cliente con su tilde; la fila padre en color "mixto". Es lo único de diseño visual nuevo y conviene mostrárselo a Rodrigo antes de implementarlo.

## 4. Diseño propuesto

**Modelo (migración aditiva).** Tabla nueva `viaje_facturas`: `trip_id`, `cliente` (clave normalizada de `cobro_a`), `factura_numero`, `facturado_at/by`, `pago_at/by`, `factura_quitada(_at)`. Backfill: cada viaje ya facturado genera una fila por cliente con el mismo número y fechas. Las columnas de `trips` **no se tocan** (regla 4: borrar una columna lleva dos releases).

**Dominio (`shared/`, puro).** `unidadesFacturables(viaje)` agrupa las cargas por `cobro_a` normalizado (evoluciona `clienteDelViaje`). `estadoDeCobro` pasa a operar sobre la unidad; aparece `estadoDelViaje` = blanco / rojo / verde / mixto.

**API.** Compatible hacia atrás: `marcar` / `marcar-pago` siguen aceptando `trip_ids` (= todas las unidades del viaje) y aceptan además el cliente. Los 8 frenos pasan por **un único helper** ("¿este viaje / esta carga tiene algo facturado?") en lugar de ocho `if` sueltos. El resumen se arma por `cobro_a`; `cobrosAjenos` deja de hacer falta.

## 5. Entregas y orden

**Entrega 1: invisible para Rodrigo** (~2 días)
1. `shared/`: `unidadesFacturables`, estado por unidad y agregado, con tests primero (regla 7 de CLAUDE.md si se toca `domain.ts`: correr los tests de ese archivo antes de tocar lo demás).
2. Migración + backfill.
3. Repos y rutas sobre la tabla nueva, frenos por helper, resumen por `cobro_a`. Frontend actual sigue funcionando sin cambios.

**Entrega 2: lo visible** (~3 días)
4. Excel: una fila por (viaje, cliente).
5. `FilaViaje` con subfilas y color mixto; `ResumenClientePage` selecciona por unidad; filtros de la lista.

Un commit por paso, `npm run verify` en verde antes de cada uno, sin línea `Co-Authored-By` (regla 6).

## 6. Riesgos y cómo se cubren

| Riesgo | Cobertura |
|---|---|
| Backfill que pierde o duplica facturas/pagos | Verificar contra copia de la base real: mismos totales de facturados y pagados antes y después. **Necesito un dump que me pase Gonzalo; yo no toco producción.** |
| Código sube antes que la migración → 500 (trampa documentada) | Migrar primero, siempre; la entrega 1 se puede desplegar en dos pasos (migración, luego código). |
| Un freno queda sin migrar y permite tocar un viaje facturado | Helper único + un test por cada uno de los 8 frenos con un viaje de 2 clientes (uno facturado, otro no). |
| Excel distinto al que Rodrigo usa a diario | Comparar la planilla nueva contra la vieja sobre viajes de un solo cliente: tiene que ser idéntica salvo lo esperado. |
| Rodrigo factura mientras se despliega | Desplegar fuera de horario; la entrega 1 no cambia lo que ve. |

**Rollback:** como las columnas viejas de `trips` siguen intactas y la entrega 1 no las deja de escribir, volver al código anterior no pierde datos. (Decisión a confirmar: durante la entrega 1, ¿el código nuevo escribe también las columnas viejas como espejo? Da rollback limpio a cambio de un poco más de código.)

## 7. Preguntas abiertas para la sesión principal

- ¿Confirmás las decisiones 1 y 2 de la sección 3?
- ¿Espejar en las columnas viejas durante la entrega 1 (rollback limpio) o cortar directo a la tabla nueva?
- ¿Quién consigue el dump de producción para probar el backfill, y cuándo?
- ¿Se le muestra a Rodrigo el boceto de subfilas antes de la entrega 2?
- El presupuesto (300 USD) es del módulo de mantenimiento; esto es aparte y aún **no tiene precio**. ¿Se cobra, se incluye o se conversa con él?
