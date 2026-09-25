/**
 * La versión de la app, sin infraestructura nueva: es el nombre del script que el build ya genera
 * (`assets/index-<hash>.js`, y el hash cambia cuando cambia el código).
 *
 * Sirve para avisarle al chofer que hay una versión más nueva. Es el problema inverso al de la
 * plantilla vieja: acá el chofer tiene el DATO al día y el CÓDIGO viejo, porque deja la app abierta
 * y se despliega varias veces por día. Una corrección de un cálculo no le llega hasta que la cierra.
 */

const PATRON = /\/assets\/(index-[\w-]+\.js)/;

/** La versión del código que está corriendo, o null (en desarrollo no hay hash: no se avisa nada). */
export function versionPropia(doc: Pick<Document, "querySelector"> = document): string | null {
  const script = doc.querySelector('script[type="module"][src*="/assets/index-"]');
  return script?.getAttribute("src")?.match(PATRON)?.[1] ?? null;
}

/** La versión que sirve el servidor ahora, o null si no se pudo saber (sin señal): en ese caso no pasa nada. */
export async function versionDelServidor(pedir: typeof fetch = fetch): Promise<string | null> {
  try {
    // `no-store`: el HTML sale con max-age=0, pero así no depende de ninguna caché intermedia.
    const res = await pedir("/", { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.text()).match(PATRON)?.[1] ?? null;
  } catch {
    return null;
  }
}

/**
 * Si hay que mostrar el aviso: el servidor sirve otra versión que la propia y el chofer no la
 * descartó ya. Descartar una versión no la vuelve a mostrar; sólo una todavía más nueva.
 * Sin alguna de las dos versiones (sin señal, desarrollo) no se avisa: se queda con lo que tiene.
 */
export function hayVersionNueva(propia: string | null, servidor: string | null, descartada: string | null): boolean {
  if (!propia || !servidor) return false;
  return servidor !== propia && servidor !== descartada;
}

const CLAVE_DESCARTADA = "tsm_version_descartada";

/** El almacenamiento puede estar bloqueado, vacío o fallar: la franja funciona igual, sin recordar. */
export function versionDescartada(): string | null {
  try {
    return localStorage.getItem(CLAVE_DESCARTADA);
  } catch {
    return null;
  }
}

export function descartarVersion(version: string): void {
  try {
    localStorage.setItem(CLAVE_DESCARTADA, version);
  } catch {
    /* sin almacenamiento: reaparece la próxima vez que vuelva al frente, no se rompe nada */
  }
}
