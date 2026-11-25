import type { PedidoPermitido } from "./permisos-lector";

/**
 * Qué puede pedirle al servidor el rol "mecánico" (`mecanico`): Raúl.
 *
 * Entra SÓLO al Taller. El presupuesto que aceptó Rodrigo lo dice: el usuario de mantenimiento "entra sólo a la pestaña de
 * mantenimiento" y "no ve viajes, ni facturación, ni cobranza, ni las surtidas de gasoil". Por eso tampoco ve la pantalla
 * de Camiones ni la ficha de cada camión (viajes, surtidas, consumo, fotos del tacógrafo y de la cámara de frío): lo único
 * que le llega es lo que el Taller necesita para armar su flota.
 *
 * Es una lista blanca, igual que la del lector y por lo mismo (ver `permisos-lector.ts`): la API tiene más de cien rutas y
 * varias no llevan `requireRole`, así que con una lista de prohibiciones cada ruta nueva le quedaría abierta. Con la lista
 * blanca le queda cerrada por omisión y hay que acordarse de abrirla, que es el error barato.
 *
 * El Taller todavía es la maqueta (lo que se carga queda en el navegador y sólo baja la flota y los nombres de los
 * choferes); cuando los services pasen a la base (fase 2 del plan) sus rutas se suman acá, a propósito y una por una.
 *
 * El freno se aplica en `requireAuth`, por donde pasan todas las rutas.
 */
export const LO_QUE_MIRA_EL_MECANICO: PedidoPermitido[] = [
  { metodo: "GET", ruta: /^\/api\/auth\/me$/, porque: "su propia sesión: sin esto no entra ni a la pantalla" },

  // La flota del Taller: los camiones y acoplados que carga la oficina. Es la lista entera (con odómetro), sin la ficha.
  { metodo: "GET", ruta: /^\/api\/trucks$/, porque: "la flota del Taller" },

  // El Taller muestra el chofer que anda en cada camión y sugiere los nombres al cargar un service. La ruta le contesta
  // sólo id, nombre, estado y camión asignado: el teléfono, el documento y la licencia no son de él.
  { metodo: "GET", ruta: /^\/api\/drivers$/, porque: "los nombres de los choferes, recortada" },
];

/** ¿Este pedido está en la lista blanca del mecánico? Todo lo que no esté es 403. */
export function mecanicoPuede(metodo: string, ruta: string): boolean {
  const m = metodo.toUpperCase();
  return LO_QUE_MIRA_EL_MECANICO.some((p) => p.metodo === m && p.ruta.test(ruta));
}
