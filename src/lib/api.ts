import type { ApiResponse, AuthUser } from "@shared/domain";

const TOKEN_KEY = "logistica_token";
/**
 * El usuario, guardado junto al token.
 *
 * Para que un corte de señal al abrir la app no eche al chofer: si `/auth/me` no responde, se
 * sigue con el que ya estaba. No es un secreto —nombre, rol, camión— y los permisos los decide
 * igual el servidor con el token, así que tocarlo a mano no habilita nada.
 */
const USER_KEY = "logistica_user";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}
export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}
export function getCachedUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}
export function setCachedUser(user: AuthUser): void {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

/**
 * Cuánto se espera una respuesta antes de avisar.
 *
 * Sin tope, con señal intermitente en la ruta el navegador puede tardar minutos en dar por
 * muerta la conexión, y mientras tanto el botón queda girando, deshabilitado, sin decir nada.
 * Las fotos tienen más margen: suben entre 200 y 500 KB, y con 3G eso lleva su tiempo.
 */
export const ESPERA_MS = 30_000;
export const ESPERA_SUBIDA_MS = 120_000;
export const SIN_SENAL = "Sin conexión: no llegó respuesta del servidor. Revisá la señal y probá de nuevo.";

/** El servidor rechazó el token: hay que volver a entrar. Lo escucha `AuthProvider`. */
export const SESION_CAIDA = "tsm:sesion-caida";

/**
 * Cierra la sesión cuando el servidor rechaza el token, y dice por qué.
 *
 * `tokenUsado`: sólo se cierra si el token que rebotó sigue siendo el de la sesión. Un pedido
 * lento que vuelve 401 justo después de que alguien volvió a entrar echaría a la sesión nueva.
 */
function sesionRechazada(tokenUsado: string | null, motivo?: string): void {
  if (getToken() !== tokenUsado) return;
  clearToken();
  if (typeof window === "undefined") return; // los tests no tienen ventana
  window.dispatchEvent(new CustomEvent(SESION_CAIDA, { detail: { motivo } }));
}

export class ApiError extends Error {
  status: number;
  /** Ver `ApiErr.code`: el rechazo que la pantalla sabe resolver sola. */
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** El texto de un error para mostrar en pantalla: el del servidor si lo hay. */
export const mensajeDe = (e: unknown, porDefecto = "Error inesperado."): string =>
  e instanceof ApiError ? e.message : porDefecto;

interface RequestOptions {
  method?: string;
  body?: unknown;
  formData?: FormData;
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let body: BodyInit | undefined;
  if (opts.formData) {
    body = opts.formData;
  } else if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }

  const control = new AbortController();
  const espera = setTimeout(() => control.abort(), opts.formData ? ESPERA_SUBIDA_MS : ESPERA_MS);
  let res: Response;
  let json: ApiResponse<T> | null;
  try {
    res = await fetch(`/api${path}`, { method: opts.method ?? "GET", headers, body, signal: control.signal });
    json = (await res.json().catch(() => null)) as ApiResponse<T> | null;
  } catch {
    // Sin señal, o no respondió a tiempo. Antes salía como un TypeError de fetch que cada
    // pantalla traducía a su manera —o no traducía—: ahora es un error con un mensaje que el
    // chofer entiende, y con status 0 para que quien lo reciba sepa que no hubo respuesta.
    throw new ApiError(SIN_SENAL, 0);
  } finally {
    clearTimeout(espera);
  }

  // Volver a la pantalla de entrar, con el motivo. Borrar el token no alcanzaba: la pantalla
  // seguía ahí con el usuario que tenía en memoria y cada cosa que se tocara devolvía "No
  // autenticado". Pasa cuando vence el token de una semana, y ahora también cuando la oficina
  // da de baja al chofer o borra al usuario.
  if (res.status === 401) sesionRechazada(token, json?.success === false ? json.error : undefined);

  if (!json) throw new ApiError("Respuesta inválida del servidor", res.status);
  if (!json.success) throw new ApiError(json.error, res.status, json.code);
  return json.data;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: "POST", body }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: "PUT", body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: "PATCH", body }),
  // Acepta cuerpo: apagar los avisos manda el endpoint del dispositivo a dar de baja.
  del: <T>(path: string, body?: unknown) => request<T>(path, { method: "DELETE", body }),
  upload: <T>(path: string, formData: FormData) => request<T>(path, { method: "POST", formData }),
};

/**
 * Descarga un archivo protegido (ej. CSV) con el token y dispara la descarga.
 *
 * Si falla lo avisa ella misma y no rechaza. Todos los botones de exportar la llamaban sin
 * `catch`, así que un corte o un 500 terminaba en una promesa rechazada que nadie miraba: se
 * apretaba "⬇ Exportar Excel", no pasaba nada, y no había forma de saber si faltaba esperar o
 * volver a apretar.
 */
export async function downloadFile(path: string, filename: string): Promise<void> {
  const token = getToken();
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  } catch {
    alert(`No se pudo descargar. ${SIN_SENAL}`);
    return;
  }
  if (!res.ok) {
    const json = (await res.json().catch(() => null)) as { error?: string } | null;
    // Descargar no pasa por `request`, así que el 401 hay que atenderlo acá también.
    if (res.status === 401) sesionRechazada(token, json?.error);
    alert(`No se pudo descargar. ${json?.error ?? `El servidor respondió ${res.status}.`}`);
    return;
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Descarga una foto protegida y devuelve un object URL (para <img src>). */
export async function fetchPhotoUrl(r2Key: string): Promise<string | null> {
  const token = getToken();
  const res = await fetch(`/api/photos/${r2Key}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (res.status === 401) sesionRechazada(token);
  if (!res.ok) return null;
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}
