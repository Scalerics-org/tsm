/**
 * En qué ambiente está corriendo la app: producción (el de verdad) o prueba (la copia donde
 * Rodrigo mira cada cambio antes de que llegue a los choferes).
 *
 * Lo dice el servidor en /api/health (`ambiente`), a partir de la variable AMBIENTE del Worker.
 * No se adivina por el hostname: la fuente es una sola y es la misma que decide qué base y qué
 * fotos usa ese Worker. Si no se puede saber (sin señal, respuesta rara), se asume producción:
 * la franja de prueba sólo aparece cuando el servidor la pide expresamente.
 */
export type Ambiente = "produccion" | "prueba";

/** Lo que dice la respuesta de /api/health, o "produccion" si no dice nada claro. */
export function ambienteDeLaRespuesta(cuerpo: unknown): Ambiente {
  const ambiente = (cuerpo as { data?: { ambiente?: unknown } } | null)?.data?.ambiente;
  return ambiente === "prueba" ? "prueba" : "produccion";
}

export async function ambienteDelServidor(pedir: typeof fetch = fetch): Promise<Ambiente> {
  try {
    const res = await pedir("/api/health", { cache: "no-store" });
    if (!res.ok) return "produccion";
    return ambienteDeLaRespuesta(await res.json());
  } catch {
    return "produccion";
  }
}
