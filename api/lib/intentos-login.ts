/**
 * El límite de intentos del login, como reglas puras (sin base) para poder probarlas.
 *
 * Ni el login del chofer ni el de oficina contaban intentos. El del chofer es patente + PIN de
 * 4 dígitos, y la patente es pública —se ve en la calle, en los remitos, en los Excel que se le
 * mandan a los clientes—: eran 10.000 combinaciones sin ningún freno, y el Worker no tiene
 * límite propio.
 *
 * DOS CONTADORES, porque cubren ataques distintos:
 *   - por cuenta (patente o email): 5 fallos → 15 minutos. Con esto, recorrer los 10.000 PINs
 *     de una patente pasa de minutos a días.
 *   - por IP, sumando todas las cuentas: 20 fallos → 15 minutos. Frena al que prueba muchas
 *     patentes desde el mismo lugar.
 *
 * EL COSTO, dicho: quien conozca una patente puede bloquearle el login a ese chofer 15 minutos
 * a propósito. Para una flota de este tamaño es mejor que dejar el PIN abierto a fuerza bruta.
 */

export const MAX_FALLOS_CUENTA = 5;
export const MAX_FALLOS_IP = 20;
export const BLOQUEO_MIN = 15;
/** Los fallos más viejos que esto se olvidan: un PIN mal tipeado hoy no suma contra el de ayer. */
export const VENTANA_MIN = 15;

export interface RegistroIntentos {
  fallos: number;
  bloqueado_hasta: string | null;
  actualizado: string;
}

const aFecha = (s: string) => new Date(s.replace(" ", "T") + "Z");
export const aTextoUtc = (d: Date) => d.toISOString().replace("T", " ").slice(0, 19);

/** La clave de una patente, escrita como sea: "gtp 4413" y "GTP4413" son la misma. */
export const clavePatente = (plate: string) => `patente:${plate.toUpperCase().replace(/\s+/g, "")}`;
export const claveEmail = (email: string) => `email:${email.trim().toLowerCase()}`;
export const claveIp = (ip: string) => `ip:${ip.trim()}`;

/** Cuántos minutos le faltan al bloqueo, o `null` si no está bloqueado. */
export function minutosDeBloqueo(r: RegistroIntentos | null | undefined, ahora: Date): number | null {
  if (!r?.bloqueado_hasta) return null;
  const resta = aFecha(r.bloqueado_hasta).getTime() - ahora.getTime();
  return resta > 0 ? Math.ceil(resta / 60_000) : null;
}

/**
 * El registro después de un fallo. Si llega al máximo, queda bloqueado `BLOQUEO_MIN` minutos.
 *
 * Arranca de cero si el último fallo es más viejo que la ventana, o si venía de un bloqueo que
 * ya venció: pasado el castigo, se vuelve a tener los intentos completos.
 */
export function conFallo(r: RegistroIntentos | null | undefined, ahora: Date, maximo: number): RegistroIntentos {
  const enVentana = r != null && ahora.getTime() - aFecha(r.actualizado).getTime() < VENTANA_MIN * 60_000;
  const bloqueoVencido = r?.bloqueado_hasta != null && minutosDeBloqueo(r, ahora) == null;
  const fallos = (enVentana && !bloqueoVencido ? r!.fallos : 0) + 1;
  return {
    fallos,
    bloqueado_hasta: fallos >= maximo ? aTextoUtc(new Date(ahora.getTime() + BLOQUEO_MIN * 60_000)) : null,
    actualizado: aTextoUtc(ahora),
  };
}

export const mensajeDeBloqueo = (minutos: number) =>
  `Demasiados intentos fallidos. Probá de nuevo en ${minutos} minuto${minutos === 1 ? "" : "s"}.`;
