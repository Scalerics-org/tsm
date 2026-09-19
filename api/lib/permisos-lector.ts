/**
 * Qué puede pedirle al servidor el rol "solo mirar" (`lector`).
 *
 * "Y que él tenga opción solo de mirar, no tocar ni corregir. Vaya que toque un dedazo y borre
 * algo jajaja." — Rodrigo, 19/9/2026, dando de alta a su hermano Aníbal.
 *
 * Es una lista blanca y no una lista de prohibiciones a propósito. La API tiene más de cien
 * rutas y varias no llevan `requireRole`: se apoyan en la diferencia chofer/oficina, que a un
 * lector lo deja del lado de la oficina —o sea, del lado que borra viajes—. Con una lista de
 * prohibiciones, cada ruta nueva que alguien escriba mañana le queda abierta y nadie se entera
 * hasta que pase. Con la lista blanca, la ruta nueva le queda cerrada por omisión y hay que
 * acordarse de abrirla, que es el error barato.
 *
 * El freno se aplica en `requireAuth`, que es el único lugar por el que pasan todas las rutas.
 *
 * Los cinco pedidos de `/push` escriben, sí, pero sólo la fila de SU propio celular, y sin
 * ellas el aviso no le llega —que es la mitad de lo que Rodrigo pidió—.
 */
export interface PedidoPermitido {
  metodo: string;
  /** Contra `c.req.path`, que ya viene con el prefijo /api y sin la query. */
  ruta: RegExp;
  /** Para el reporte de la auditoría y para que se lea la lista de un vistazo. */
  porque: string;
}

export const LO_QUE_MIRA_EL_LECTOR: PedidoPermitido[] = [
  { metodo: "GET", ruta: /^\/api\/auth\/me$/, porque: "su propia sesión: sin esto no entra ni a la pantalla" },

  // La pantalla de Viajes.
  { metodo: "GET", ruta: /^\/api\/trips$/, porque: "la lista de viajes" },
  { metodo: "GET", ruta: /^\/api\/trips\/clientes$/, porque: "el filtro por cliente de la carga" },
  { metodo: "GET", ruta: /^\/api\/trips\/\d+$/, porque: "la ficha de un viaje" },
  { metodo: "GET", ruta: /^\/api\/drivers$/, porque: "el filtro por chofer" },
  { metodo: "GET", ruta: /^\/api\/trucks$/, porque: "el filtro por camión" },
  { metodo: "GET", ruta: /^\/api\/providers$/, porque: "el filtro por viaje (proveedor)" },
  { metodo: "GET", ruta: /^\/api\/templates$/, porque: "el filtro por tipo de viaje" },
  { metodo: "GET", ruta: /^\/api\/photos\/.+$/, porque: "las fotos del viaje que está mirando" },
  // Bajarse el Excel de lo que está mirando sigue siendo mirar: no cambia un solo dato.
  { metodo: "GET", ruta: /^\/api\/reports\/trips\.csv$/, porque: "el Excel de la lista filtrada" },

  // Los avisos en su celular. Escriben, pero sólo su propia suscripción.
  { metodo: "GET", ruta: /^\/api\/push\/clave$/, porque: "la clave VAPID para suscribir el celular" },
  { metodo: "GET", ruta: /^\/api\/push\/estado$/, porque: "si ya tiene los avisos prendidos" },
  { metodo: "POST", ruta: /^\/api\/push\/suscribir$/, porque: "prender los avisos en su celular" },
  { metodo: "DELETE", ruta: /^\/api\/push\/suscribir$/, porque: "apagarlos" },
  { metodo: "POST", ruta: /^\/api\/push\/probar$/, porque: "probar que le llegan sin esperar un viaje" },
];

/** ¿Este pedido está en la lista blanca? Todo lo que no esté es 403. */
export function lectorPuede(metodo: string, ruta: string): boolean {
  const m = metodo.toUpperCase();
  return LO_QUE_MIRA_EL_LECTOR.some((p) => p.metodo === m && p.ruta.test(ruta));
}
