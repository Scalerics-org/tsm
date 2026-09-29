/**
 * ¿Este renglón que llega es una carga que ya se guardó?
 *
 * El celular le pone su propio sid a la carga ANTES de mandarla (para poder subir la foto sin
 * esperar la respuesta) y lo conserva si tiene que reintentar. Con mala señal el pedido llega
 * y la respuesta se pierde: el reintento trae el mismo sid. Eso es un reenvío, y no hay que
 * guardar nada de nuevo.
 *
 * Hace falta que coincida también el lugar de carga. El servidor mira los sid usados para que
 * una carga NUEVA no pise el de OTRA —y con él, su foto—; un sid repetido con otro lugar de
 * carga es justo ese caso, no un reenvío, y sigue recibiendo un sid nuevo.
 */
export function esReenvioDeCarga(
  pedida: unknown,
  guardadas: readonly { sid: string; remitente: string }[],
): boolean {
  if (!pedida || typeof pedida !== "object") return false;
  const r = pedida as { sid?: unknown; remitente?: unknown };
  if (typeof r.sid !== "string" || !r.sid.trim()) return false;
  const sid = r.sid.trim();
  const lugar = String(r.remitente ?? "").trim();
  return guardadas.some((g) => g.sid === sid && g.remitente === lugar);
}
