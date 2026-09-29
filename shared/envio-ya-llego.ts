/**
 * "¿Esto que mandé ya llegó?" — para las altas que no se pueden reenviar a ciegas.
 *
 * Una surtida, un cierre o una salida no tienen clave de reenvío: si el pedido llegó y se perdió la
 * respuesta, mandarlo otra vez lo duplica (o da un 409 que dice lo contrario de lo que pasó). Así
 * que, tras un "sin respuesta", la app lee cómo quedó y compara con lo que mandó. Estas funciones
 * son esa comparación. Ninguna decide nada sobre el servidor: sólo dicen si lo leído coincide.
 *
 * Lo que llega del servidor viene con SU reloj (`ahora`), no el del celular: el reloj de un
 * teléfono puede estar corrido unos minutos, y con eso una surtida recién guardada parecería vieja.
 */
/**
 * Hasta cuánto atrás se busca la surtida que se acaba de mandar. Cubre el peor caso de espera del
 * cliente (120 s de subida más los reintentos) con margen. Es corta a propósito: dos surtidas
 * iguales de verdad —mismo odómetro y mismos litros— con más de 10 minutos de por medio no son un
 * reenvío, y darla por "ya guardada" sería tragarse una surtida real.
 */
export const VENTANA_REENVIO_MIN = 10;

/** Los litros se tipean con dos decimales; esto sólo absorbe el error de sumar los dos tanques. */
const TOLERANCIA_LITROS = 0.01;

/** Fecha del servidor ("2026-09-29 17:14:00", UTC sin zona) a milisegundos. NaN si no se entiende. */
function instante(s: string): number {
  return Date.parse(s.replace(" ", "T") + "Z");
}

/** ¿`cuando` cae en los últimos `VENTANA_REENVIO_MIN` minutos antes de `ahora`? */
export function esReciente(cuando: string, ahora: string): boolean {
  const dif = instante(ahora) - instante(cuando);
  return Number.isFinite(dif) && dif >= 0 && dif <= VENTANA_REENVIO_MIN * 60_000;
}

const mismosLitros = (a: number, b: number) => Math.abs(a - b) <= TOLERANCIA_LITROS;

/** Lo que devuelven `GET /fuel/recientes` y `GET /frio/recientes`. */
export interface SurtidasRecientes<T> {
  /** El reloj del servidor, en el mismo formato que `logged_at`. */
  ahora: string;
  surtidas: T[];
}

export interface SurtidaDeGasoil {
  driver_id: number | null;
  odometer_km: number;
  liters: number;
  logged_at: string;
}

/**
 * ¿Ya está guardada esta surtida de gasoil? Mismo chofer, mismo odómetro, mismos litros y de hace
 * pocos minutos. Con otro odómetro NO es la misma: dos surtidas parecidas el mismo día son dos.
 */
export function surtidaYaGuardada(
  enviada: { driver_id: number | null; odometer_km: number; liters: number },
  { ahora, surtidas }: SurtidasRecientes<SurtidaDeGasoil>,
): boolean {
  return surtidas.some(
    (s) =>
      s.driver_id === enviada.driver_id &&
      s.odometer_km === enviada.odometer_km &&
      mismosLitros(s.liters, enviada.liters) &&
      esReciente(s.logged_at, ahora),
  );
}

export interface SurtidaDeFrio {
  driver_id: number | null;
  liters: number;
  logged_at: string;
}

/** Lo mismo para la cámara de frío, que no tiene odómetro: mismo chofer, mismos litros, hace pocos minutos. */
export function surtidaFrioYaGuardada(
  enviada: { driver_id: number | null; liters: number },
  { ahora, surtidas }: SurtidasRecientes<SurtidaDeFrio>,
): boolean {
  return surtidas.some(
    (s) => s.driver_id === enviada.driver_id && mismosLitros(s.liters, enviada.liters) && esReciente(s.logged_at, ahora),
  );
}
