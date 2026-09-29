/**
 * Surtidas que parecen la misma cargada dos veces: el aviso de Control.
 *
 * Es la red de seguridad de lo que no se pudo cerrar del todo: si el celular reenvía una surtida cuyo
 * primer pedido todavía se estaba guardando, quedan dos iguales (ver `envio-ya-llego.ts`). Esto las
 * junta para que la oficina las mire. SÓLO AVISA: no borra ni marca nada. Dos surtidas idénticas no
 * siempre son un error, y decidir cuál sobra es de la oficina, con la boleta en la mano.
 */

/**
 * Cuánto tiempo puede haber entre las dos para que se avise. Más ancha que la ventana de reenvío
 * (10 min) a propósito: acá el costo de un falso positivo es un vistazo de la oficina, mientras que
 * allá era tragarse una surtida real. Con el mismo odómetro y los mismos litros, media hora igual
 * es casi seguro la misma carga.
 */
export const VENTANA_REPETIDA_MIN = 30;

/** Hasta cuántos días atrás se avisa. Lo viejo ya se miró; y una vez borrada una de las dos, el aviso se va. */
export const DIAS_REPETIDAS_VIGENTES = 30;

export interface SurtidaRepetible {
  id: number;
  truck_id: number;
  /** El gasoil del camión lo tiene; la cámara de frío no (nunca mueve kilómetros). */
  odometer_km?: number | null;
  liters: number;
  logged_at: string;
}

export interface ParRepetido<T extends SurtidaRepetible = SurtidaRepetible> {
  primera: T;
  segunda: T;
  /** Minutos entre las dos. */
  minutos: number;
}

const instante = (s: string) => Date.parse(s.replace(" ", "T") + "Z");
const litros2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Los pares de surtidas del mismo camión, con el mismo odómetro y los mismos litros, separadas por
 * `VENTANA_REPETIDA_MIN` minutos o menos. Tres iguales seguidas dan dos pares (1-2 y 2-3). Los
 * más recientes primero.
 */
export function surtidasRepetidas<T extends SurtidaRepetible>(surtidas: readonly T[]): ParRepetido<T>[] {
  const grupos = new Map<string, T[]>();
  for (const s of surtidas) {
    const clave = `${s.truck_id}|${s.odometer_km ?? "-"}|${litros2(s.liters)}`;
    const g = grupos.get(clave);
    if (g) g.push(s);
    else grupos.set(clave, [s]);
  }

  const pares: ParRepetido<T>[] = [];
  for (const grupo of grupos.values()) {
    const orden = [...grupo].sort((a, b) => instante(a.logged_at) - instante(b.logged_at) || a.id - b.id);
    for (let i = 1; i < orden.length; i++) {
      const minutos = (instante(orden[i].logged_at) - instante(orden[i - 1].logged_at)) / 60_000;
      if (Number.isFinite(minutos) && minutos <= VENTANA_REPETIDA_MIN) {
        pares.push({ primera: orden[i - 1], segunda: orden[i], minutos: Math.round(minutos) });
      }
    }
  }
  return pares.sort((a, b) => instante(b.segunda.logged_at) - instante(a.segunda.logged_at) || b.segunda.id - a.segunda.id);
}

/** Sólo los pares cuya segunda surtida es de los últimos `DIAS_REPETIDAS_VIGENTES` días, contra el reloj del servidor. */
export function repetidasVigentes<T extends SurtidaRepetible>(pares: ParRepetido<T>[], ahora: Date): ParRepetido<T>[] {
  const desde = ahora.getTime() - DIAS_REPETIDAS_VIGENTES * 86_400_000;
  return pares.filter((p) => instante(p.segunda.logged_at) >= desde);
}
