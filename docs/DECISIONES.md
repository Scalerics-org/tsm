# Decisiones

Decisiones ya tomadas y escritas en el código, reunidas acá para no tener que ir a buscarlas. No es
una lista de todo lo que se decidió en el proyecto — solo lo que ya está documentado en un comentario
o en un test, así que nada de esto es una interpretación nueva.

## El service worker no cachea nada, a propósito

`public/sw.js` instala la app en el celular y recibe las notificaciones push de viaje cerrado — y
nada más. No guarda ningún archivo en caché ni sirve nada sin conexión. Del comentario del archivo:

> NO cachea nada. Es a propósito: un chofer con una versión vieja guardada en el celular es peor
> que un chofer sin app. Acá se corrigen cosas seguido y todas tienen que llegarle en el próximo
> arranque, no cuando al navegador se le ocurra. Si algún día hace falta que funcione sin señal, se
> agrega con cuidado y para pantallas puntuales — no para todo.

Es la opción (a) de "sin conexión" del manual de arranque: un cartel y listo, porque el chofer
siempre tiene señal en la operación real. No se agregó una estrategia de caché porque no la pidió
nadie y agregarla mal es peor que no tenerla — un service worker viejo sirviendo assets nuevos es de
los bugs más difíciles de diagnosticar que hay.

## Los "vacíos" se deducen, no se le piden al chofer

`shared/vacios.ts`: un viaje vacío (el camión vuelve sin carga desde donde descargó hasta donde
vuelve a cargar) no es algo que el chofer cargue — se calcula solo, comparando dónde terminó un viaje
contra dónde arrancó el siguiente. Del comentario del archivo:

> POR QUÉ DEDUCIRLOS Y NO PEDIRLOS. Las plantillas de viaje vacío existen desde hace un mes y NUNCA
> se usaron: cero viajes vacíos cargados en toda la historia. Pedirle al chofer un registro más por
> cada retorno ya se probó y no funciona. El dato, en cambio, ya está: entre dónde descargó y dónde
> volvió a cargar.

Para que la deducción no invente vacíos por errores de tipeo, los nombres de lugar se normalizan
antes de comparar (`"Montevideo"`, `"Mdeo"` y `"MONTEVIDEO"` cuentan como el mismo lugar) y hay un
umbral mínimo, `KM_VACIO_MINIMO = 70`, fijado por el cliente: por debajo de eso no es un viaje
vacío, es moverse dentro de la misma zona.

## Sacarle la factura a un viaje también le saca el pago

`desmarcarFacturados` (`api/repos/trips.ts`) limpia `pago_at` y `pago_by` junto con la factura. Un
viaje verde sin factura no se entiende, y sacar la factura es corregir un error, no algo de todos
los días. **Lo que se pierde:** el quién y el cuándo del pago. La factura que tenía queda en
`factura_quitada`, pero el pago no deja rastro. La alternativa descartada era bloquear "sacar
factura" mientras el viaje figure pago. Marcar el pago, en cambio, sólo agrega información: no toca
la factura ni saca al viaje de ningún resumen (decidido con Rodrigo el 23/9/2026).

## El campo de la factura también lleva "S/F" o a quién se le cobra

`trips.factura_numero` es texto libre a propósito: la oficina anota el número de la factura, "S/F", o
—cuando el viaje se arregla sin factura— a quién le corresponde pagarlo ("SAMAN"). Cualquiera de las
tres lo deja como facturado y lo saca del resumen por cliente de lo que falta facturar, que es lo que
Rodrigo ya hacía a mano. Sólo cambió cómo se lo nombra en la pantalla.

## La verificación mensual del gasoil no es una cuenta nueva

`shared/verificacion-mensual.ts` compara los litros de cada mes contra los km que hizo el camión,
para encontrar la surtida que nadie registró. Reusa lo que ya existía: los km y litros del mes son
los de `monthlyConsumption` (por calendario, con los chorros adentro, los mismos que muestra el
Resumen) y "lo habitual" es la mediana de los tramos de ese camión (`rangoDeSurtidas`). Se calla en
el mes en curso, con pocos tramos, con un mes medido desde su propia primera surtida y cuando la
diferencia son pocos litros: una alarma falsa enseña a no mirar más la pantalla. La cámara de frío
no entra (`surtidas_frio` va aparte porque no mueve kilómetros).

## A quién se le cobra cada carga se asigna desde la lista de Viajes, y sólo lo escribe la oficina

En la columna Cliente de Viajes hay un tick por carga (`ClientePorCarga.tsx`); tocarlo abre un
diálogo con el selector de la libreta y alta en el mismo lugar (Rodrigo, 25/9/2026: los choferes
cargan para clientes que todavía no existen, así que al asignar el cliente casi nunca está). Al
chofer no se le agrega ningún paso. Aparece cuando **el viaje tiene cargas** —Otros Viajes y
Mdeo-Bella Unión—, no por una lista de plantillas. Los viajes clásicos se ven como siempre.

- **Ruta propia**: `PUT /trips/:id/segments/:sid/cobro`. `PUT /segments` recibe la lista entera y por
  cada guardado cuenta usos de la libreta (el contador que ordena lo que ve el chofer), re-resuelve
  por regla las cargas no manuales y depende de que el navegador reenvíe bien todas las demás.
- Lo asignado queda `cobro_manual: true` (ninguna regla lo pisa) y lleva `cobro_id`, el id de la
  libreta, sólo para cobro tipo cliente. **Sin migración**: las cargas son JSON. El nombre lo pone el
  servidor desde la entrada. Todavía **nada propaga** un cambio de nombre en la libreta a las cargas
  que ya tienen `cobro_id`: el id deja la puerta abierta, no está hecho.
- "Quitar la asignación" devuelve la carga a las reglas de hoy. Un viaje facturado (409) o cancelado
  no se toca, y el lector no llega (la ruta es sólo de oficina).
- Del quinto tick en adelante hay un "+N más" que se abre en la misma fila y avisa si alguna de las
  ocultas está sin asignar.
- **El contador de "pendientes de cobro" de la libreta cambia de significado**: lista las cargas sin
  cobro, agrupadas por combinación remitente→destinatario. Una carga asignada a mano tiene cobro
  aunque no exista regla, así que sale de esa lista: deja de contar "combinaciones sin regla" y pasa
  a contar "renglones sin cobro". Una combinación sin regla que la oficina resolvió carga por carga
  ya no aparece como pendiente, y la regla que la resolvería para siempre no se crea sola. No se
  tocó; queda para decidir si hace falta otro aviso.

## `PUT /trips/:id/segments` descarta en silencio una carga sin lugar de carga

Hueco conocido, **sin arreglar a propósito**. `parseSegments` (`api/routes/trips.ts`) filtra los
renglones cuyo `remitente` viene vacío, y la ruta guarda lo que queda: si el cliente manda una carga
sin lugar de carga, esa carga desaparece del viaje **sin ningún aviso** —con sus fotos colgando de un
`sid` que ya no existe—. Hoy lo evitan las pantallas (`AgregarCargaOficina` y `EditarLugaresDeCarga`
exigen el lugar antes de mandar), no el servidor. No se cambió porque cambiar lo que el servidor acepta
toca a todos los que llaman a esa ruta y no estaba en el pedido; el arreglo natural es rechazar con 400
"falta el lugar de carga" en vez de descartar, pero hay que mirar antes que nadie mande a propósito una
fila vacía al final. Una carga que se pierde sin avisar es justo lo que ya nos mordió.

## La lista de departamentos en el teléfono empuja el resto de la pantalla (anotado, sin arreglar)

Rodrigo probó el cierre en un celular (25/9/2026): al abrir el selector de departamentos (`LibretaPicker`,
19 opciones) el bloque "Lugar de descarga" pasa a medir unos 1.000 px de alto y empuja todo hacia abajo.
Es un selector que usan varias pantallas del chofer y de la oficina, así que no se tocó de paso. Ideas
para mirarlo aparte: que la lista se abra a pantalla completa en el teléfono, o con un alto máximo más
chico, y que se cierre sola al elegir (eso ya lo hace).

## Un cliente de cobranza marcado "sólo para cobrar" se ve para el chofer sólo si él mismo lo da de alta

`libreta.solo_cobro` es literal: marcado, el chofer no lo ve en su lista, sin excepción por `usos`.
La rareza que eso deja está anotada a propósito para que no parezca un error: si un chofer da de alta un
nombre que ya existe como cliente de cobranza (el alta es idempotente y reutiliza la entrada existente),
recibe esa entrada marcada, la puede usar en su carga y sube `usos`, pero sigue marcada y oculta para
los demás choferes. Se prefirió esa rareza a una regla escondida del tipo "marcado, salvo que se use":
un tilde que a veces no tilda es el que nadie vuelve a mirar. Si molesta, la salida es desmarcarlo desde
Clientes (que avisa con el número de cargas). El filtro vive en la ruta `GET /libreta` (sólo para el
chofer) y no en `listLibreta`, porque `createEntry` usa esa consulta para no duplicar nombres.

## Sin señal al abrir la app: una página propia, la única excepción al "no cachea nada" (2/10/2026)

Un chofer con 4G de una rayita abrió el sitio y vio el "No se puede acceder a este sitio / ERR_FAILED" de Chrome:
el service worker hacía `respondWith(fetch(...))` y, sin red, la promesa se rechazaba. Ahora `public/sw.js` guarda UNA
página, `/sin-senal.html` (HTML suelto, sin JS, con el botón Reintentar como enlace: la política de contenido no
deja scripts en línea), en un caché versionado (`tsm-2`), y la muestra sólo cuando una NAVEGACIÓN falla por falta de
red. Un 404 o un 500 se devuelve tal cual; la API, los assets y la app siguen yendo sólo a la red.
- Se guarda una **copia limpia** de la respuesta: el hosting redirige `/sin-senal.html` a `/sin-senal` y Chrome no
  muestra en una navegación una respuesta que vino de una redirección (volvía a dar ERR_FAILED; se vio probando).
- Si la instalación no pudo guardarla (mala señal justo ahí), se reintenta en la próxima navegación con red.

## Reintentos cuando no llega respuesta (29/9/2026)

`src/lib/api.ts` envuelve cada pedido con `conReintentos` (`src/lib/reintentos.ts`); ninguna pantalla cambia
cómo llama a `api.get` / `api.post`. Antes había un solo intento y un corte lo resolvía el usuario
volviendo a tocar (Rodrigo lo vio dos veces, 25/9/2026).

- **Sólo cuando NO llegó respuesta** (`ApiError` con status 0). Una respuesta con error (4xx, 5xx) nunca
  se reintenta: el servidor contestó y repetir no cambia nada.
- **Qué se reintenta está en una lista explícita**, no inferida por método (`sePuedeReintentar`): todos los
  GET (menos `/auth/*`, para que al abrir sin señal la app siga enseguida con el usuario guardado) y
  cuatro escrituras que el servidor reconoce como reenvío: sumar una carga, corregir su cantidad, los
  datos del camino y el alta de libreta. Todo lo demás se manda una sola vez, como antes. Sumar una ruta a
  la lista es decidir que reenviarla es seguro; ver la tabla de arriba.
- **Tiempo:** 3 intentos en total, con 1 s y 3 s de espera entre ellos. El primer intento espera lo de
  siempre (30 s); cada reintento espera como mucho 15 s (`ESPERA_REINTENTO_MS`). Peor caso: 30 + 1 + 15 + 3 +
  15 = 64 s, contra 30 s antes. Se eligió 15 s y no 30 porque ya hubo una falla y quien espera es el chofer;
  y el corte de señal de verdad (sin red, no lenta) falla al instante, así que ahí son 4 s. Reenviar es
  seguro justamente porque las rutas de la lista toleran que el primer pedido sí haya llegado.
- **Lo que ve el chofer:** una franja "Sin señal. Reintentando… (intento 2 de 3)" (`AvisoReintentando`)
  mientras dura; si fallan los tres, el mismo `SIN_SENAL` de hoy.
- **Sin reintento a ciegas:** surtida, cámara de frío, salir, cerrar y lecturas no se reenvían sin mirar antes si
  ya llegaron (ver "Antes de reenviar, mirar si ya llegó"). Fotos, cancelar y borrar una carga siguen con un
  solo intento: un corte ahí lo resuelve el chofer volviendo a tocar. Las fotos necesitan una clave de
  reenvío (migración).

## Qué altas del chofer se pueden reenviar sin duplicar (29/9/2026)

Punto de partida de cualquier reintento automático: si el pedido llegó y se perdió la respuesta, ¿qué pasa
al mandarlo otra vez? Revisado ruta por ruta.

| Alta / cambio | Reenviarla | Por qué |
|---|---|---|
| `POST /trips/:id/segments` (sumar una carga) | **Segura** | El celular manda su `sid`; si ya está guardado con el mismo lugar de carga es un reenvío y se devuelve el viaje sin crear nada (`shared/reenvio-de-carga.ts`). Antes le inventaba otro sid y duplicaba. Un sid repetido con OTRO lugar de carga sigue recibiendo uno nuevo, para no pisar la foto de otra. |
| `PATCH /trips/:id/segments/:sid` (cantidad) | **Segura** | Pone un valor, no suma. |
| `PATCH /trips/:id/campos` (datos del camino) | **Segura** | Pone valores, no suma. |
| `POST /libreta` (alta rápida de nombre) | **Segura** | Reutiliza la entrada si el nombre ya existe. |
| `POST /fuel` (surtida de gasoil) | Verificando | Sin clave de reenvío guardaría otra surtida (y otro aviso a la oficina, y el consumo del camión). Tras un corte la app lee las recientes del camión y compara. |
| `POST /frio` (gasoil de cámara) | Verificando | Igual: guardaría otra surtida de litros; se verifica igual. |
| `POST /trips/:id/finish` (cerrar) | Verificando | Ya cerrado responde 409 "no está en curso". Tras un corte la app lee el viaje: si está completado, es éxito. |
| `POST /trips` (salir) | Verificando | El freno "un viaje a la vez" da 409 "todavía tenés un viaje sin cerrar". Tras un corte la app lee el viaje en curso: si es de la misma plantilla y camión, es el que salió. |
| `POST /lecturas` (tacógrafo del mes) | Verificando | Una por mes: el segundo da 409 "ya está cargada". Tras un corte la app lee la lectura del mes: la misma es éxito, una distinta es el conflicto real. |
| `DELETE /trips/:id/segments/:sid` | Un solo intento | Los datos no se dañan (va por `sid`, no borra otra), pero el reenvío recibe 404 "ya no está": el chofer vería un error de algo que salió bien. |
| `POST /photos` (foto) | **No** | Una carga puede tener varias fotos con el mismo `segment_sid`, así que no hay cómo reconocer un reenvío: cada envío suma una foto. Hace falta una clave de reenvío (migración). |

"Verificando" = no se reenvía a ciegas: ver la sección siguiente. Las de arriba se reintentan solas (ver
"Reintentos cuando no llega respuesta"); las verificables, con la lectura de por medio.

## Antes de reenviar, mirar si ya llegó (29/9/2026)

Lo que no tiene clave de reenvío no se reintenta a ciegas. Tras un "sin respuesta", `enviarVerificando`
(`src/lib/verificar-envio.ts`) espera 2 s, lee cómo quedó con un GET y compara con lo que mandó: si ya está,
sale como si hubiera salido bien; si no, manda UNA vez más; si la lectura tampoco contesta, el `SIN_SENAL` de
siempre. Un 409 del reenvío tampoco se muestra sin volver a mirar. **El servidor no cambia su forma de guardar**:
nunca descarta nada por su cuenta.

- **Surtida de gasoil y de cámara de frío** (`shared/envio-ya-llego.ts`): "ya está" = mismo chofer, mismos
  litros y, en el gasoil, mismo odómetro, cargada en los últimos 10 minutos (`VENTANA_REENVIO_MIN`). Dos
  surtidas parecidas con otro odómetro NO son la misma; una igual de hace una hora tampoco. La hora es la del
  servidor: `GET /fuel/recientes` y `GET /frio/recientes` (sólo lectura, del camión del chofer, no disparan
  avisos) devuelven `ahora` junto a las últimas 20, porque el reloj de un celular puede estar corrido.
- **Riesgo que queda:** si el primer pedido todavía se está guardando cuando se lee (más lento que 2 s), la
  lectura no lo ve y el reenvío lo duplica. Por eso existe el aviso de surtidas repetidas en Control.
- **Aviso en Control: "Surtidas que parecen repetidas"** (`shared/surtidas-repetidas.ts`): pares del mismo
  camión con el mismo odómetro (el gasoil) y los mismos litros, a 30 minutos o menos (`VENTANA_REPETIDA_MIN`),
  de los últimos 30 días; la cámara de frío se compara por camión y litros. La ventana es más ancha que la de
  reenvío a propósito: acá un falso positivo cuesta un vistazo, allá era tragarse una surtida real. **Sólo
  avisa**: no borra ni marca nada, y el renglón lleva a la ficha del camión, donde la oficina decide cuál
  sobra. Una vez borrada una de las dos, el aviso se va solo. El lector no lo ve (Control no está en su lista).

## "Internacional Otros": el cuarto internacional, una plantilla más (migración 0054)

Rodrigo (26/9/2026): hace falta un internacional que diga "otros" para el transportista que no sea ninguno de
los cargados, o "van a quedar colgados". Es una plantilla del cliente "Internacional" con la forma de Valvis:
al salir, origen (lista de lugares, con alta) y lugar de carga opcional; en el puente, N° de MIC (si no se
cargó ahí lo pide el cierre) y la foto "Hoja MIC", **opcional**; al cerrar, departamento de destino, lugar de
descarga, kilos de descarga (obligatorios, para que el viaje tenga con qué facturarse) y foto "Remito de
descarga". La migración escribe la forma completa y no la copia de la fila de Valvis, para no heredar a
escondidas lo que la oficina haya editado ahí, y no inserta nada si ya existe una "Internacional Otros".

- **Un cambio de código mínimo:** la foto del puente sólo se ofrecía si `foto_carga_requerida`. Ahora también
  se ofrece, marcada "(opcional)", si la plantilla tiene `carga_photo_label` aunque no la exija. Ninguna
  plantilla existente cambia: las que tienen etiqueta ("Hoja MIC") la exigen.
- **Camiones con lista de plantillas:** un camión al que la oficina le restringió las plantillas
  (`camion_plantillas`) no ve la nueva hasta que se la agreguen desde Camiones.
- **Preguntas abiertas para Rodrigo:** si un "Otros" puede terminar en Argentina (la lista de departamentos
  es de Uruguay), si siempre hay MIC, y si los kilos van obligatorios. Si alguna respuesta cambia algo, se
  ajusta la plantilla.

## Un grupo de campos donde alcanza con uno

`TemplateField.requiere_uno_de` (`shared/domain.ts`): dos o más campos de la misma plantilla y la
misma etapa con el mismo texto ahí (cualquier texto, es sólo una etiqueta) forman un grupo donde
alcanza con que uno tenga algo — `grupoIncompleto` lo valida, con el mensaje ya armado ("Completá
uno de estos: A o B."). `missingField` ignora el `required` de un campo agrupado: lo exige el
grupo entero, no cada uno. Nace de Molino Cañuelas (28/9/2026): "Cantidad de pallets" y "Si
cargás en Logipark…" eran los dos obligatorios, y con carga sólo en Logipark había que poner un 0
en el otro para poder seguir — un 0 que en el Excel se lee como "cargó cero pallets", no como "no
corresponde". No es un lenguaje de reglas nuevo: es la misma idea de "obligatorio" corrida del
campo al grupo, para que sirva en cualquier plantilla futura con el mismo problema sin tocar
código de nuevo. Se configura desde Plantillas, poniéndole el mismo texto de grupo a los campos
que corresponda.

## Vencimientos de documentos: columnas, y sólo avisan

Camión: SOA, Permiso Puerto, APPLUS y Sticker. Chofer: Permiso Puerto y Carnet de salud (la libreta de
conducir ya existía y se queda en `drivers.license_expiry`). Migración 0053: seis columnas de fecha
`TEXT` nulas, sin valor por defecto. Se eligieron **columnas y no una tabla de documentos** porque la
lista es concreta y estable; el séptimo documento, si aparece, es una columna más.

- **Avisa, no bloquea.** Nada de `shared/vencimientos.ts` se usa en la salida del chofer ni frena
  ninguna ruta: un camión con el SOA vencido sale igual. No es la app la que decide si un camión sale.
- **Sin fecha = no se sabe, no "vencido".** Las fichas y las listas sin nada cargado se ven como antes.
- **Una fecha es un día, no un instante.** Se cuenta en días de calendario contra el "hoy" de Uruguay
  (`hoyEnUruguay`, UTC−3); como instante UTC, a las 21 h el día del vencimiento ya sería "mañana".
- **Umbral:** `DIAS_PARA_AVISAR = 30` (ámbar hasta 30 días, rojo cuando venció). Vive en una constante.
- **Guardar desde una pantalla vieja no borra lo ya cargado:** el PUT sólo escribe las fechas que vienen
  en el pedido (`parseVencimientos` devuelve sólo las claves presentes); una clave vacía sí la borra.
- **Es de oficina:** `GET /reports/vencimientos` es sólo encargado y admin (el lector y el chofer reciben
  403, y no está en la lista blanca del lector). Editan quienes ya editaban camiones y choferes.
- El aviso del Resumen, el de Control y la marca de las listas de Camiones y Choferes salen de la misma
  función (`avisosDeVencimientos` / `resumenDeVencimientos`), con el mismo umbral. Control tenía su
  tarjeta de licencias a 60 días y con `Date.now()` en UTC, sin ninguna razón escrita: el mismo chofer
  podía figurar "por vencer" en una pantalla y no en la otra. Se unificó en 30 (decisión de Gonzalo).
  `/reports/alerts` sigue mandando `expiringLicenses` (misma cuenta) sólo para una pestaña de Control
  abierta antes del deploy; la pantalla nueva usa `vencimientos`.

## Fotos subidas desde la oficina

- **Se puede sumar en cualquier estado del viaje, también facturado.** `bloqueoPorFacturacion` con alcance "foto" frena el BORRADO (es irreversible y saca el respaldo); agregar un respaldo no cambia lo facturado y es justo lo que falta cuando un viaje que cargó la oficina quedó sin remito o MIC. Sumar no consulta esa guarda a propósito.
- Misma ruta que el chofer (`POST /photos` con `kind` y `segment_sid`) y la misma compresión. El lector lo frena la lista blanca de `requireAuth`; esconder el botón es comodidad.
- **No se guarda quién subió la foto:** `trip_photos` no tiene esa columna. Mostrarlo pide una migración aditiva; pendiente de decidir.
- Sin reintento automático, como el resto de las subidas.

## El mes en curso: la oficina ve lo mismo que el chofer (8/10/2026)

Rodrigo veía en la oficina un km/L del mes que diferia en decimales del que ven los choferes en el celular.
Eran dos cuentas a propósito (calendario en la oficina, de tanque lleno a tanque lleno en el chofer). Su pedido:
"mientras no altere cómo medir el consumo y lo que te pedí acorde a los cierres, me gustaría ver lo mismo que
ellos, para estar alineados".

- **"Mes en curso" es el MES CALENDARIO DE HOY (hora de Uruguay), no el último mes con surtidas.** Un camión que no cargó nada este mes tiene su mes anterior como último con datos, y ese ya cerró: sale por calendario y dice "cerrado". `consumoMensualParaMostrar` recibe el "hoy" por parámetro y marca `en_curso`; la etiqueta de las pantallas sale de ahí. (`closed` de `monthlyConsumption` y la verificación mensual siguen con la semántica de siempre: el último mes con datos no se juzga, que es el lado seguro.)
- **Mes abierto: una sola cuenta.** `consumoDelMesEnCurso` (`shared/domain.ts`) es la cuenta del chofer
  (primer a último llenado del mes, sin contar lo que sigue en el tanque). `fuelFeedback` la usa para el
  acumulado `month_kml` y la oficina para el mes abierto (`consumoMensualParaMostrar`): mismos datos, mismo número.
- **Mes cerrado: sin cambios.** Sigue por calendario (`consumoDelPeriodo` vía `monthlyConsumption`), que es lo
  que cierra con las facturas del gasoil: cada litro cae en el mes en que se compró. Al cerrar un mes su número
  puede moverse un poco respecto de lo que se veía abierto, y es esperable: cambia la regla, no el dato.
- **Qué pantallas:** las tarjetas de consumo mensual del Resumen y de la pantalla Consumo, y el consumo mensual de
  la ficha del camión (las tres por `consumoMensualDelCamion` / `consumoMensualParaMostrar`). Cada tarjeta dice de
  dónde sale: "en curso · de tanque lleno a tanque lleno, como lo ve el chofer" o "cerrado · por calendario".
- **Lo que NO cambia:** el "Rendimiento del período" de Consumo (Desde/Hasta es un rango libre, por defecto toda la
  historia), la tarjeta por camión del Resumen (rango elegido), la verificación de litros faltantes (al mes abierto
  no lo juzga: "en_curso"), las anomalías de Control (sólo meses cerrados) y el rango de surtidas.
- **Con menos de dos llenados en el mes** no hay tramo que medir: el km/L queda vacío (igual que en el celular) y
  los km y litros que se muestran son los del calendario.
- No se unifican las cuentas para los meses cerrados sin preguntar: si algún día se quiere, es otra decisión.
