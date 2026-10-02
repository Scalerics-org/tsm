# Factura y pago por cliente dentro del viaje — diseño (paso A)

Estado: **propuesta, sin migrar ni escribir código.** Pedido de Rodrigo: al lado de cada cliente del viaje, una
cajita de "facturado" y otra de "pagado", porque un viaje puede llevar carga para varios clientes. Datos de
producción del 28/9: 24 viajes completados esperando factura llevan varios clientes; 18 se le cobran a gente
distinta.

## 1. La unidad

**El cliente dentro del viaje** = a quién se le cobra (`cobro_a` de cada carga), no la carga suelta. Tres cargas
de un mismo cliente son una sola unidad (una factura); tres cargas de tres clientes son tres unidades.

La clave de la unidad (`cliente_clave`) sale de la carga, y se calcula en una función pura de `shared/`:

```
clave = cobro_tipo + ":" + (cobro_id ?? nombre normalizado)      p. ej. "cliente:74", "proveedor:saman"
```

- Usa el id de la libreta cuando la oficina lo eligió de ahí; si no, el nombre normalizado (el mismo criterio de
  comparación de nombres de la libreta: sin mayúsculas, acentos ni espacios de más).
- Una carga **sin cobro asignado** no tiene clave: no se puede facturar y se muestra como "sin asignar". Mientras
  haya una, el viaje no puede figurar "facturado" del todo.
- Un viaje **sin cargas** (los clásicos: Casarone, Manassi…) no tiene clientes adentro: sigue facturándose por
  viaje, con las columnas de hoy.

## 2. Datos: una tabla nueva, ninguna columna tocada

Migración **0055** (aditiva; `trips` no cambia). Se aplica antes del código.

```sql
CREATE TABLE viaje_cliente_facturacion (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  trip_id            INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  cliente_clave      TEXT    NOT NULL,
  cliente_nombre     TEXT    NOT NULL,            -- como se leía al marcar, para mostrar y para el rastro
  factura_numero     TEXT,                        -- NULL = sin factura (la fila queda sólo por el rastro)
  facturado_at       TEXT,  facturado_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  factura_quitada    TEXT,  factura_quitada_at TEXT,
  pago_at            TEXT,  pago_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE (trip_id, cliente_clave)
);
CREATE INDEX idx_vcf_factura ON viaje_cliente_facturacion (factura_numero);
```

- **Una fila por cliente facturado** (se crea al marcar). Ausente = sin facturar. Sacar la factura deja la fila con
  `factura_numero` NULL y el número viejo en `factura_quitada`: el mismo rastro que hoy tiene `trips`.
- El pago es de cada cliente (`pago_at`/`pago_by` en su fila) y sólo existe con factura, igual que hoy.
- Las mismas reglas de siempre: el número es texto libre (factura, "S/F" o "SAMAN"), sólo se factura un viaje
  COMPLETADO, no se pisa una factura puesta, sacar la factura saca también el pago.

## 3. Dos estrategias, elegidas en un solo lugar (el paso 1.2 del plan de patrones)

`estrategiaDeFacturacion(viaje)` en `shared/`, una función pura que es el **único** lugar que decide:

| Viaje | Estrategia | Dónde vive la factura |
|---|---|---|
| tiene `trips.factura_numero` (todo lo facturado hasta hoy) | **por viaje** | `trips.factura_numero` / `pago_at`, como hoy |
| sin factura de viaje y **con cargas** | **por cliente** | `viaje_cliente_facturacion` |
| sin factura de viaje y sin cargas (clásicos) | **por viaje** | `trips`, como hoy |

Los viajes ya facturados **no se migran ni se tocan**: siguen en `trips`, con su estado, su color y su bloqueo de
hoy. Un viaje con cargas que nunca se facturó pasa a "por cliente" desde el despliegue. Un viaje por cliente nunca
escribe `trips.factura_numero`; uno por viaje nunca escribe en la tabla nueva.

## 4. Estados derivados (función pura, con tests)

Para un viaje **por cliente**, con N clientes (claves distintas con cobro asignado), F facturados, P pagados (de
los facturados) y S cargas sin asignar:

| Facturación | Cuándo |
|---|---|
| sin facturar | F = 0 |
| facturado a medias | 0 < F < N, o F = N pero S > 0 |
| facturado | F = N y S = 0 |

| Pago | Cuándo |
|---|---|
| (sin pago que mostrar) | F = 0 |
| pago a medias | F > 0 y 0 < P < F, o P = F pero todavía no está facturado del todo |
| sin pagar | F > 0 y P = 0 |
| pago | facturado del todo y P = F = N |

El **estado de color de la fila** (`estadoDeCobro`, las tres tintas del Excel de Rodrigo) usa "lo peor que falta":
**blanco** si algo está sin facturar (incluido "a medias"), **rojo** si todo está facturado y algo sin pagar,
**verde** sólo si todo está pago. Para un viaje por viaje la función da lo mismo que hoy (un test lo fija con todas
las combinaciones). El "a medias" no inventa colores: lo dice una marca chica (`1/3 facturados · 0/3 pagos`).

## 5. Bloqueos (`shared/bloqueo-facturacion.ts`)

`bloqueoPorFacturacion(viaje, alcance)` ya existe y todas las rutas la llaman. Pasa a elegir por estrategia:

- **Por viaje:** idéntica a hoy, mensajes incluidos.
- **Por cliente:**
  - alcance **viaje** (cabecera, fecha, llegada, cancelar, borrar, descargas): se bloquea si **algún** cliente está
    facturado, también "a medias": parte del viaje ya está en una factura emitida. El mensaje nombra la factura y el
    cliente.
  - alcance **cargas** (corregir la lista entera): se bloquea sólo si el cambio **toca** una carga de un cliente
    facturado (cambia, sale, o se le suma una carga a ese cliente). Cambiar las de otro cliente del mismo viaje sí
    se puede. Hace falta comparar la lista nueva contra la guardada: esa comparación es pura.
  - alcance **carga** (a quién se le cobra, por `sid`): se bloquea si la carga es de un cliente facturado, **o** si
    el cobro nuevo cae en un cliente ya facturado.
  - alcance **foto**: la de una carga se bloquea si su cliente está facturado; la del viaje entero (remito de
    descarga), si hay alguno.
- Además, los trabajos que reescriben cargas por su cuenta (propagar el nombre de la libreta, "enganchar" cargas con
  una regla nueva) **saltean** las cargas de clientes facturados, como hoy saltean los viajes facturados.

## 6. Servidor

Las rutas de `/api/facturacion/*` siguen siendo sólo de encargado y admin (el lector da 403: no están en su lista
blanca). Quedan las de hoy, para por viaje, y se suman las de por cliente, que trabajan con **ítems**
`{ trip_id, cliente_clave }`, así la oficina marca varios de una vez (lo que sirve tanto si pagan una factura por
vez como si pagan varias juntas):

- `POST /facturacion/marcar-clientes   { items: [...], factura_numero }`
- `POST /facturacion/desmarcar-clientes { items: [...] }`
- `POST /facturacion/marcar-pagos-clientes / desmarcar-pagos-clientes { items: [...] }`

Cada una verifica, por ítem y en el servidor: viaje COMPLETADO, viaje por cliente, la clave existe entre las cargas
**actuales**, y la regla de siempre (no pisar una factura, el pago exige factura). Se contestan `marcados` y
`sin_tocar` con el motivo de cada uno que quedó afuera. Quién y cuándo se registra igual que hoy. La condición se
cierra en el `INSERT … ON CONFLICT … WHERE factura_numero IS NULL`, sin leer y después escribir.
Las rutas viejas `{ trip_ids }` siguen: sobre un viaje por cliente con **un solo** cliente marcan ese cliente; con
**varios**, lo saltean y dicen "tiene varios clientes: marcalos por cliente". Así ningún atajo viejo factura a
varios clientes con un solo número.

## 7. Pantallas

- **Viajes, columna Cliente:** hoy muestra un tick por carga (asignar a quién se le cobra). Para un viaje por
  cliente se agrupa **por cliente** y cada uno lleva sus dos cajitas: `[✓ Jair] [F] [P]`. Tocar F pide el número
  (con el último usado de sugerencia, como hoy) y deja el número debajo; tocar P marca el pago. Debajo, un enlace
  "todos" que aplica a todos los clientes pendientes del viaje con un solo número / un solo pago.
- **Columnas Factura y Pago** del viaje: en un viaje por cliente muestran el resumen (`2/3`), sin tick propio. Los
  viajes por viaje (todo lo de hoy y los clásicos) se ven y se tocan igual.
- **Color de la fila:** el de la sección 4, más la marca "a medias".
- **Filtros** (`facturado`, `pago`, `factura`): "facturado = sí" = completamente facturado; "no" = algo por
  facturar (el "a medias" figura acá, que es donde lo va a buscar); `factura = X` encuentra también la de un
  cliente. Como el estado por cliente depende de las cargas (JSON), se resuelve **en memoria sobre la lista ya
  acotada por fechas**, no en SQL.
- **Resumen por cliente (para facturar):** un viaje por cliente se queda en el resumen mientras le falte facturar
  algún cliente. Sus cargas ya facturadas **no suman** a los totales (el total es lo que se factura ahora), y el
  renglón dice qué clientes ya están en qué factura. "Marcar facturados" ahí trabaja por ítem (viaje + cliente).
- **Excel:** la planilla para facturar muestra en la columna Factura el número de cada cliente
  (`A-1 (Jair) · A-2 (BMR)`); el Excel por carga no tiene columna de factura hoy y no la gana.

## 8. Lo que no cambia al desplegar (y un test lo fija)

Para todo viaje con `trips.factura_numero` o sin cargas: mismo estado, mismo color, mismo bloqueo, mismos números
en filtros, resumen y Excel. Es un test de tabla con todas las combinaciones (sin facturar / facturado / pago, con y
sin cargas) contra las funciones nuevas y las de hoy, más un test de que ninguna ruta nueva escribe en `trips`.

## 9. Orden de implementación (commits separados)

1. Migración 0055 + dominio puro (clave, estados, estrategia, bloqueo por cliente) con tests, incluido el de arriba.
2. Servidor: las rutas por ítem y el cálculo del estado en las listas.
3. Bloqueos por cliente en las rutas que hoy llaman a `bloqueoPorFacturacion` y en los trabajos que reescriben cargas.
4. Pantalla de Viajes (cajitas y colores).
5. Resumen por cliente y Excel.
Revisión adversarial del diff completo antes de reportar.

## 10. Preguntas abiertas

- **Pagos:** ¿entran uno por factura o varios juntos? Está resuelto para los dos (cada cliente tiene su pago y se
  marcan varios de una vez), pero conviene saber cuál es el caso común para decidir qué queda a un toque.
- **Carga sin cobro asignado:** propongo que el viaje no figure "facturado" del todo mientras la haya. ¿Está bien?
- **Color de "a medias":** propongo blanco/rojo según lo peor que falta, con la marca `2/3`. Si Rodrigo prefiere un
  color propio (p. ej. ámbar) se agrega sin tocar nada más.
- **Un viaje con cargas ya facturado por viaje entero** no se parte nunca: para pasarlo a por cliente habría que
  sacarle la factura (como hoy) y volver a facturarlo.
