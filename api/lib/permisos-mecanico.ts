import type { PedidoPermitido } from "./permisos-lector";

/**
 * Qué puede pedirle al servidor el rol "mecánico" (`mecanico`): Raúl.
 *
 * Ve Camiones (la lista y la ficha de cada uno) en SOLO LECTURA y usa el Taller. Nada más: no ve ni toca viajes,
 * facturación, cobranza, Consumo, surtidas de gasoil, choferes (salvo la lista de nombres que usa el Taller),
 * plantillas ni usuarios, y no recibe los avisos de la oficina.
 *
 * Es una lista blanca, igual que la del lector y por lo mismo (ver `permisos-lector.ts`): la API tiene más de cien rutas y
 * varias no llevan `requireRole`, así que con una lista de prohibiciones cada ruta nueva le quedaría abierta. Con la lista
 * blanca le queda cerrada por omisión y hay que acordarse de abrirla, que es el error barato.
 *
 * El Taller todavía es la maqueta (lo que se carga queda en el navegador y no usa la API); cuando los services pasen a la
 * base (fase 2 del plan) sus rutas se suman acá, a propósito y una por una.
 *
 * El freno se aplica en `requireAuth`, por donde pasan todas las rutas.
 */
export const LO_QUE_MIRA_EL_MECANICO: PedidoPermitido[] = [
  { metodo: "GET", ruta: /^\/api\/auth\/me$/, porque: "su propia sesión: sin esto no entra ni a la pantalla" },

  // Camiones, en SOLO LECTURA: la lista y la ficha de cada uno. Crear, editar o borrar un camión, cargar una lectura o las
  // horas de frío, y corregir o borrar una surtida siguen cerrados (un test fija el 403 de cada uno).
  { metodo: "GET", ruta: /^\/api\/trucks$/, porque: "la lista de camiones (y la flota del Taller)" },
  { metodo: "GET", ruta: /^\/api\/reports\/truck\/\d+$/, porque: "la ficha del camión: km, consumo mensual, viajes, vacíos y surtidas" },
  { metodo: "GET", ruta: /^\/api\/lecturas$/, porque: "las fotos del tacógrafo de la ficha, mes a mes (no la auditoría)" },
  { metodo: "GET", ruta: /^\/api\/frio$/, porque: "la cámara de frío de la ficha, en los camiones que la llevan" },
  // Sólo las fotos que la ficha muestra (el tacógrafo y las boletas de la cámara de frío): no las de los viajes, que son
  // los remitos con los que se factura.
  { metodo: "GET", ruta: /^\/api\/photos\/odometro\/\d+\/[^/]+$/, porque: "la foto del tacógrafo de la ficha" },
  { metodo: "GET", ruta: /^\/api\/photos\/frio\/\d+\/[^/]+$/, porque: "la boleta de la cámara de frío de la ficha" },

  // El Taller muestra el chofer que anda en cada camión y sugiere los nombres al cargar un service. La ruta le contesta
  // sólo id, nombre, estado y camión asignado: el teléfono, el documento y la licencia no son de él.
  { metodo: "GET", ruta: /^\/api\/drivers$/, porque: "los nombres de los choferes, recortada" },
];

/** ¿Este pedido está en la lista blanca del mecánico? Todo lo que no esté es 403. */
export function mecanicoPuede(metodo: string, ruta: string): boolean {
  const m = metodo.toUpperCase();
  return LO_QUE_MIRA_EL_MECANICO.some((p) => p.metodo === m && p.ruta.test(ruta));
}
