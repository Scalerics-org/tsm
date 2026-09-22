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
