# Factura y pago por cliente dentro del viaje — diseño (paso A)

Estado: **implementado en local (migración 0055, rutas, bloqueos, pantalla, resumen y Excel), sin desplegar; pendiente de que Rodrigo confirme la unidad (ver "Pregunta abierta: cobro o cliente").** Pedido de Rodrigo: al lado de cada cliente del viaje, una
cajita de "facturado" y otra de "pagado", porque un viaje puede llevar carga para varios clientes. Datos de
producción del 28/9: 24 viajes completados esperando factura llevan varios clientes; 18 se le cobran a gente
distinta.

## 1. La unidad

**El cliente dentro del viaje** = a quién se le cobra (`cobro_a` de cada carga), no la carga suelta. Tres cargas
de un mismo cliente son una sola unidad (una factura); tres cargas de tres clientes son tres unidades.

La clave de la unidad (`cliente_clave`) sale de la carga, y se calcula en una función pura de `shared/`:

```
clave = cobro_tipo + ":" + nombre normalizado                     p. ej. "cliente:jair", "proveedor:saman"
```

- **Siempre el nombre normalizado** (sin mayúsculas, acentos ni espacios de más), aunque la carga lleve `cobro_id`.
  Las cargas que resuelve una regla no llevan id y las que se eligen de la libreta sí; con el id en la clave el
  mismo cliente salía con dos claves en un viaje (dos cajitas, dos facturas). Un renombre de la libreta no se
  propaga hoy a las cargas, así que el nombre es igual de estable.
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
| sin factura de viaje y **con algún cobro asignado** | **por cliente** | `viaje_cliente_facturacion` |
| sin factura de viaje y sin cargas, o con cargas y **ningún** cobro asignado | **por viaje** | `trips`, como hoy |

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

- **Viajes:** para un viaje por cliente, Cliente, Factura y Pago son una sola celda de tres columnas (las de la
  tabla): cada renglón de la columna Cliente (el tilde de asignar y el nombre de a quién se le cobra, como el
  dibujo de Rodrigo del 30/9) lleva a su derecha una cajita de Factura y una de Pago, a la altura de su renglón
  también cuando el nombre ocupa dos líneas. Tres cargas de un mismo cliente son un solo cliente: las cajitas van
  en la primera. Cada cajita de factura lleva su número abajo. Un renglón **Sin asignar** tiene las cajitas
  apagadas (sin saber a quién, no hay a quién facturar). Debajo: "Factura 1/3 · Pago 0/1" y, si hay más de uno
  pendiente, los enlaces "facturar a todos" y "pagaron todos". Los viajes por viaje (todo lo de hoy) se ven y se
  tocan igual, con una sola cajita por columna.
- **Color de la fila:** el de la sección 4.
- **Filtros** (`facturado`, `pago`, `factura`): por cliente buscan "algo" y el "a medias" figura de los dos lados:
  "facturado = sí" es lo que ya salió en alguna factura, "no" lo que todavía tiene algo por facturar; "pago = sí"
  lo que ya cobró y no debe nada de lo facturado, "pago = no" lo facturado que falta cobrar (aunque falte facturar
  a otro cliente del mismo viaje); `factura = X` encuentra también la de un cliente, y el desplegable las lista. Como el estado por cliente depende de las cargas (JSON), se resuelve **en memoria sobre la lista ya
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

## 11. Cambios tras la revisión adversarial (3 revisores sobre el diff completo)

- Un viaje con cargas y **ningún** cobro asignado se sigue facturando por viaje (si no, no había forma de
  facturarlo: en producción son la mayoría de los viajes con cargas).
- Los atajos viejos (`{ trip_ids }`) no marcan un viaje en curso o cancelado, y el INSERT lo verifica al escribir
  (viaje completado y sin factura de viaje). Sacar una factura anda con una carga sin asignar; marcarla no.
- La clave no depende de `cobro_id` (ver sección 1).
- El peso del viaje entero no se puede repartir entre clientes: en un viaje a medias no suma al total del
  resumen y la planilla y el Excel para facturar traen sólo lo pendiente (las cargas de un cliente facturado no
  vuelven a salir). `cantidades` por carga ya descontaba lo facturado.
- Las marcas se leen en una sola consulta cuando son muchos viajes (una por cada 50 hacía crecer las consultas
  por pedido con el historial; el plan gratis de Workers tiene tope por invocación).
- Se corrigen los textos y estados: la factura que se sacó de un cliente se avisa en el resumen ("tuvo la…"),
  el desplegable de facturas incluye las de cada cliente, y una fecha mal escrita no tira el resumen.
- **Conocido y sin arreglar (anotado):** (a) carreras de milisegundos entre `PUT /segments` y marcar un cliente
  (la validación lee y después escribe); (b) renombrar un proveedor reescribe `trips.provider_name` también de
  los viajes facturados (ya pasaba con los facturados por viaje); (c) `viajesSinFacturarDe` (al borrar una
  plantilla) cuenta como "sin facturar" a un viaje por cliente ya facturado del todo (frena de más, no de
  menos); (d) cualquier migración futura que rehaga `trips` o `users` con DROP TABLE se lleva la tabla de
  facturas por cliente (hay que resguardarla y reponerla); (e) **orden de despliegue:** código nuevo contra una
  base sin la 0055 da 500 en la lista de viajes de oficina y en cancelar viaje / borrar foto del chofer, y
  `/api/health` da 200 igual: migrar SIEMPRE antes de desplegar.

## 12. Pregunta abierta: ¿cobro o cliente?

La unidad implementada es a quién se le cobra (`cobro_a`), que es lo que muestra el dibujo de Rodrigo: los renglones
con tilde azul y la marca "PROV." de la columna Cliente son `cobro_a`/`cobro_tipo` (los proveedores no son entradas
de `clientes`). El análisis de producción dice que 71 de 125 viajes completados sin facturar con cargas tienen al
menos una carga sin `cobro_a`: con esta unidad esas cargas quedan con las cajitas apagadas hasta asignarles a
quién se cobra. Si se prefiere que la unidad sean los `clientes` de la carga (el destino físico), la clave y el
renglón cambian en un solo lugar (`shared/facturacion-por-cliente.ts`), pero la columna del dibujo cambiaría de
contenido. Pendiente de confirmar.
