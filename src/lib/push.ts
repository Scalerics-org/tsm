import { api } from "./api";
import { esIOS, estaInstalada } from "./pwa";

/** Convierte la clave pública VAPID (base64url) al formato que pide el navegador. */
function claveABytes(base64url: string): Uint8Array {
  const b64 = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function b64url(buf: ArrayBuffer | null): string {
  if (!buf) return "";
  let bin = "";
  for (const b of new Uint8Array(buf)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export type EstadoPush =
  | "activo"
  | "apagado"
  | "bloqueado"
  | "sin-soporte"
  /** iPhone en una pestaña: Safari sólo permite avisos con la app en la pantalla de inicio. */
  | "falta-instalar";

export async function estadoPush(): Promise<EstadoPush> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    // En iPhone sin instalar, `PushManager` directamente no existe. Es el caso más común y
    // conviene distinguirlo de "este navegador no puede", porque tiene solución.
    return esIOS() && !estaInstalada() ? "falta-instalar" : "sin-soporte";
  }
  if (Notification.permission === "denied") return "bloqueado";

  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  return sub ? "activo" : "apagado";
}

/**
 * Pide permiso y registra el dispositivo.
 *
 * Devuelve el estado en el que quedó, en vez de tirar excepción: "el usuario dijo que no"
 * no es un error del programa, y la pantalla tiene que poder explicarlo.
 */
export async function activarPush(): Promise<EstadoPush> {
  const estado = await estadoPush();
  if (estado === "sin-soporte" || estado === "falta-instalar" || estado === "bloqueado") return estado;

  const { publica, activo } = await api.get<{ publica: string | null; activo: boolean }>("/push/clave");
  if (!activo || !publica) return "sin-soporte";

  const permiso = await Notification.requestPermission();
  if (permiso !== "granted") return permiso === "denied" ? "bloqueado" : "apagado";

  const reg = await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      // Obligatorio: el navegador exige que cada push muestre algo al usuario. No se pueden
      // mandar avisos silenciosos.
      userVisibleOnly: true,
      applicationServerKey: claveABytes(publica) as BufferSource,
    }));

  const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  await api.post("/push/suscribir", {
    endpoint: sub.endpoint,
    keys: {
      p256dh: json.keys?.p256dh ?? b64url(sub.getKey("p256dh")),
      auth: json.keys?.auth ?? b64url(sub.getKey("auth")),
    },
  });
  return "activo";
}

/** Apaga los avisos en este dispositivo. En los demás siguen andando. */
export async function desactivarPush(): Promise<void> {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  await api.del("/push/suscribir", { endpoint: sub.endpoint });
  await sub.unsubscribe();
}
