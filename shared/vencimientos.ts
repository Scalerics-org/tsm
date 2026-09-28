/**
 * Vencimientos de documentos de camiones y choferes.
 *
 * "Camiones tenemos que agregar vencimientos de: SOA, PERMISO PUERTO, APPLUS, STICKER. Choferes:
 * PERMISO PUERTO, LIBRETA CONDUCIR, CARNET DE SALUD." — Rodrigo.
 *
 * AVISA, NO BLOQUEA. Un camión con el SOA vencido sale igual: no es la app la que decide si un
 * camión sale a la ruta. Nada de acá se usa en la salida del chofer ni frena ninguna ruta.
 *
 * SIN FECHA = NO SE SABE, no "vencido". Hoy ningún camión trae nada cargado, y una ficha vacía
 * tiene que verse normal, no llena de rojos.
 *
 * UNA FECHA DE VENCIMIENTO ES UN DÍA, no un instante. Se compara en días de calendario contra el
 * "hoy" de Uruguay: comparada como instante UTC, el día del vencimiento a las 21 h ya sería
 * "mañana" y la alarma se corre un día (ya nos mordió con fechas sueltas, ver `fmtDate`).
 */

/** A cuántos días de vencer empieza el aviso ámbar. */
export const DIAS_PARA_AVISAR = 30;

/** Uruguay no tiene horario de verano desde 2015: siempre UTC−3. */
const UTC_URUGUAY_HORAS = -3;

/** El día de hoy en Uruguay, "YYYY-MM-DD". */
export function hoyEnUruguay(ahora: Date = new Date()): string {
  return new Date(ahora.getTime() + UTC_URUGUAY_HORAS * 3_600_000).toISOString().slice(0, 10);
}

const DIA_MS = 86_400_000;
const FORMATO = /^(\d{4})-(\d{2})-(\d{2})$/;

function aDias(iso: string): number | null {
  const m = FORMATO.exec(iso.trim());
  if (!m) return null;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  // Rechaza el 31 de febrero: Date lo corre al 3 de marzo en vez de fallar.
  if (new Date(ms).toISOString().slice(0, 10) !== iso.trim()) return null;
  return Math.round(ms / DIA_MS);
}

/** Si el texto es un día válido "YYYY-MM-DD". Para validar lo que llega al servidor. */
export function esDiaValido(iso: string): boolean {
  return aDias(iso) !== null;
}

/** Días que faltan (negativo = ya venció), o null si no hay una fecha válida. */
export function diasParaVencer(fecha: string | null | undefined, hoy: string): number | null {
  if (!fecha) return null;
  const f = aDias(fecha);
  const h = aDias(hoy);
  return f === null || h === null ? null : f - h;
}

export type EstadoVencimiento = "vencido" | "por_vencer" | "vigente" | "sin_fecha";

export function estadoDeVencimiento(
  fecha: string | null | undefined,
  hoy: string,
  umbral: number = DIAS_PARA_AVISAR,
): EstadoVencimiento {
  const dias = diasParaVencer(fecha, hoy);
  if (dias === null) return "sin_fecha";
  if (dias < 0) return "vencido";
  return dias <= umbral ? "por_vencer" : "vigente";
}

// ── Qué documentos hay ──

export const DOCUMENTOS_DEL_CAMION = [
  { campo: "venc_soa", nombre: "SOA" },
  { campo: "venc_permiso_puerto", nombre: "Permiso Puerto" },
  { campo: "venc_applus", nombre: "APPLUS" },
  { campo: "venc_sticker", nombre: "Sticker" },
] as const;

export const DOCUMENTOS_DEL_CHOFER = [
  // La libreta ya existía (`license_expiry`) y se queda donde está.
  { campo: "license_expiry", nombre: "Libreta de conducir" },
  { campo: "venc_permiso_puerto", nombre: "Permiso Puerto" },
  { campo: "venc_carnet_salud", nombre: "Carnet de salud" },
] as const;

export type CampoVencimientoCamion = (typeof DOCUMENTOS_DEL_CAMION)[number]["campo"];
export type CampoVencimientoChofer = (typeof DOCUMENTOS_DEL_CHOFER)[number]["campo"];

/** Los campos NUEVOS de cada uno (la libreta del chofer tiene su propio camino). */
export const CAMPOS_NUEVOS_DEL_CAMION: CampoVencimientoCamion[] = DOCUMENTOS_DEL_CAMION.map((d) => d.campo);
export const CAMPOS_NUEVOS_DEL_CHOFER = ["venc_permiso_puerto", "venc_carnet_salud"] as const;

export interface CamionConVencimientos {
  id: number;
  plate: string;
  venc_soa?: string | null;
  venc_permiso_puerto?: string | null;
  venc_applus?: string | null;
  venc_sticker?: string | null;
}

export interface ChoferConVencimientos {
  id: number;
  name: string;
  status?: string;
  license_expiry?: string | null;
  venc_permiso_puerto?: string | null;
  venc_carnet_salud?: string | null;
}

export interface AvisoDeVencimiento {
  de: "camion" | "chofer";
  id: number;
  /** "SOA", "Carnet de salud"… */
  documento: string;
  /** La patente o el nombre. */
  quien: string;
  fecha: string;
  /** Negativo = ya venció. */
  dias: number;
  estado: "vencido" | "por_vencer";
  /** En criollo, listo para mostrar: "SOA del GTP 4382 vence en 12 días". */
  texto: string;
}

function cuando(dias: number): string {
  if (dias < -1) return `venció hace ${-dias} días`;
  if (dias === -1) return "venció ayer";
  if (dias === 0) return "vence hoy";
  if (dias === 1) return "vence mañana";
  return `vence en ${dias} días`;
}

/**
 * Lo que hay que mirar: los documentos vencidos o por vencer, los que ya vencieron primero y
 * después por cercanía. Lo que no tiene fecha o está vigente NO aparece: un camión al día no es
 * una noticia.
 *
 * Los choferes dados de baja no cuentan: la libreta de alguien que ya no maneja no es una alarma.
 */
export function avisosDeVencimientos(
  datos: { camiones: CamionConVencimientos[]; choferes: ChoferConVencimientos[] },
  hoy: string,
  umbral: number = DIAS_PARA_AVISAR,
): AvisoDeVencimiento[] {
  const avisos: AvisoDeVencimiento[] = [];
  const sumar = (
    de: "camion" | "chofer",
    id: number,
    quien: string,
    documento: string,
    fecha: string | null | undefined,
  ) => {
    const dias = diasParaVencer(fecha, hoy);
    if (dias === null || !fecha) return;
    const estado = estadoDeVencimiento(fecha, hoy, umbral);
    if (estado !== "vencido" && estado !== "por_vencer") return;
    const preposicion = de === "camion" ? "del" : "de";
    avisos.push({
      de,
      id,
      documento,
      quien,
      fecha,
      dias,
      estado,
      texto: `${documento} ${preposicion} ${quien} ${cuando(dias)}`,
    });
  };

  for (const c of datos.camiones) {
    for (const d of DOCUMENTOS_DEL_CAMION) sumar("camion", c.id, c.plate, d.nombre, c[d.campo]);
  }
  for (const ch of datos.choferes) {
    if (ch.status && ch.status !== "activo") continue;
    for (const d of DOCUMENTOS_DEL_CHOFER) sumar("chofer", ch.id, ch.name, d.nombre, ch[d.campo]);
  }
  return avisos.sort((a, b) => a.dias - b.dias || a.quien.localeCompare(b.quien));
}

/** Lo que una fila de lista necesita: cuántos documentos vencidos y cuántos por vencer tiene. */
export function resumenDeVencimientos(
  fechas: (string | null | undefined)[],
  hoy: string,
  umbral: number = DIAS_PARA_AVISAR,
): { vencidos: number; porVencer: number } {
  let vencidos = 0;
  let porVencer = 0;
  for (const f of fechas) {
    const e = estadoDeVencimiento(f, hoy, umbral);
    if (e === "vencido") vencidos++;
    else if (e === "por_vencer") porVencer++;
  }
  return { vencidos, porVencer };
}

/**
 * Los vencimientos que llegan en un pedido, validados.
 *
 * SÓLO se devuelven las claves que vienen: una pantalla abierta antes de que existieran los campos
 * guarda sin mandarlos, y eso no puede borrar lo que ya se cargó. Una clave presente pero vacía
 * sí borra la fecha (`null`). Una fecha mal escrita se rechaza y no se guarda a medias.
 */
export function parseVencimientos<C extends string>(
  body: unknown,
  campos: readonly C[],
  etiquetas: Record<C, string>,
): { values: Partial<Record<C, string | null>> } | { error: string } {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const values: Partial<Record<C, string | null>> = {};
  for (const campo of campos) {
    if (!(campo in b)) continue;
    const crudo = b[campo] == null ? "" : String(b[campo]).trim();
    if (!crudo) {
      values[campo] = null;
      continue;
    }
    if (!esDiaValido(crudo)) return { error: `${etiquetas[campo]}: la fecha no es válida.` };
    values[campo] = crudo;
  }
  return { values };
}

export const ETIQUETAS_CAMION: Record<CampoVencimientoCamion, string> = Object.fromEntries(
  DOCUMENTOS_DEL_CAMION.map((d) => [d.campo, d.nombre]),
) as Record<CampoVencimientoCamion, string>;

export const ETIQUETAS_CHOFER_NUEVOS: Record<"venc_permiso_puerto" | "venc_carnet_salud", string> = {
  venc_permiso_puerto: "Permiso Puerto",
  venc_carnet_salud: "Carnet de salud",
};
