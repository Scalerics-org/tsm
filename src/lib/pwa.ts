/**
 * Registro del service worker.
 *
 * Es lo que hace que la app se pueda instalar en el celular y, más adelante, que reciba el
 * aviso de viaje cerrado. No cachea nada — ver el comentario de public/sw.js.
 *
 * Si falla, la app funciona igual: el service worker es un extra, no un requisito. Por eso
 * no se propaga el error a ningún lado; lo único que se pierde es poder instalarla.
 */
export function registrarServiceWorker(): void {
  if (!("serviceWorker" in navigator)) return;
  // En desarrollo molesta más de lo que aporta: deja versiones viejas dando vueltas entre
  // recargas y hace perder tiempo buscando bugs que ya se arreglaron.
  if (import.meta.env.DEV) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      /* sin service worker la app anda igual: sólo no se puede instalar */
    });
  });
}

/**
 * Si la app se está viendo instalada (desde la pantalla de inicio) o en el navegador.
 *
 * Importa para iOS: Safari sólo permite notificaciones cuando la app se abrió desde la
 * pantalla de inicio. Estando en una pestaña, pedir permiso no sirve de nada.
 */
export function estaInstalada(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS no soporta display-mode y usa esta propiedad propia.
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

/** iPhone o iPad: la instalación es manual (Compartir → Agregar a inicio), no hay prompt. */
export function esIOS(): boolean {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}
