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
