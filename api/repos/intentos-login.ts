import { conFallo, minutosDeBloqueo, type RegistroIntentos } from "../lib/intentos-login";

/**
 * Los contadores del login en la base.
 *
 * FALLA ABIERTO, A PROPÓSITO: si la tabla no existe —el código se desplegó antes que la
 * migración— o la base no responde, se registra en el log y el login sigue como antes. Un
 * error acá no puede dejar a todos los choferes sin poder entrar: el límite de intentos es una
 * defensa de más, no la puerta.
 */

type Clave = [clave: string, maximo: number];

async function leer(db: D1Database, claves: string[]): Promise<Map<string, RegistroIntentos>> {
  if (!claves.length) return new Map();
  const { results } = await db
    .prepare(
      `SELECT clave, fallos, bloqueado_hasta, actualizado FROM intentos_login
        WHERE clave IN (${claves.map(() => "?").join(",")})`,
    )
    .bind(...claves)
    .all<RegistroIntentos & { clave: string }>();
  return new Map((results ?? []).map((r) => [r.clave, r]));
}

/** Los minutos que faltan si alguna de las claves está bloqueada, o `null`. */
export async function minutosBloqueado(db: D1Database, claves: Clave[], ahora: Date): Promise<number | null> {
  try {
    const registros = await leer(db, claves.map(([k]) => k));
    const minutos = claves
      .map(([k]) => minutosDeBloqueo(registros.get(k), ahora))
      .filter((m): m is number => m != null);
    return minutos.length ? Math.max(...minutos) : null;
  } catch (e) {
    console.error("intentos_login: no se pudo leer, el login sigue sin límite", e);
    return null;
  }
}

/** Suma un fallo a cada clave, con el máximo de cada una. */
export async function anotarFallo(db: D1Database, claves: Clave[], ahora: Date): Promise<void> {
  try {
    const registros = await leer(db, claves.map(([k]) => k));
    await db.batch(
      claves.map(([k, maximo]) => {
        const r = conFallo(registros.get(k), ahora, maximo);
        return db
          .prepare(
            `INSERT INTO intentos_login (clave, fallos, bloqueado_hasta, actualizado) VALUES (?, ?, ?, ?)
             ON CONFLICT(clave) DO UPDATE SET fallos = excluded.fallos,
               bloqueado_hasta = excluded.bloqueado_hasta, actualizado = excluded.actualizado`,
          )
          .bind(k, r.fallos, r.bloqueado_hasta, r.actualizado);
      }),
    );
  } catch (e) {
    console.error("intentos_login: no se pudo anotar el fallo", e);
  }
}

/** Entró bien: se olvidan sus fallos. Los de la IP no, que pueden ser de otras cuentas. */
export async function olvidarFallos(db: D1Database, clave: string): Promise<void> {
  try {
    await db.prepare("DELETE FROM intentos_login WHERE clave = ?").bind(clave).run();
  } catch (e) {
    console.error("intentos_login: no se pudo limpiar", e);
  }
}
