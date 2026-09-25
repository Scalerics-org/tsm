import {
  CAMPO_MODO,
  FIELD_STAGE,
  FIELD_TYPE,
  type CampoUbicacion,
  type CamposUbicacion,
  type Descarga,
  type TemplateField,
  type Trip,
} from "./domain";

/**
 * Lo que el chofer completa DESPUÉS de salir: los campos del puente y el destino al cerrar.
 *
 * "Tipo que le pida iniciar viaje, y donde cargo. Después para continuar, que le pida el nro
 * del MIC y la foto. Y luego sí cerrarlo. Cuando lleguen: departamento, donde descargo, kilos
 * y foto." — Rodrigo, 18/9/2026, de los internacionales.
 *
 * Vive en `shared/` por lo mismo que `missingField`: la pantalla del chofer y el servidor
 * tienen que aplicar la MISMA regla. Si la pantalla tuviera una propia, dejaría pasar algo que
 * el cierre después rebota con "Falta: …", en el depósito y sin nadie a quien preguntarle.
 */

/** Los campos que se piden en el camino (el puente). */
export function camposDeRuta(fields: TemplateField[]): TemplateField[] {
  return fields.filter((f) => f.stage === FIELD_STAGE.RUTA);
}

/** Los del camino que el viaje todavía no tiene: son los que el cierre le vuelve a pedir. */
export function camposDeRutaPendientes(
  fields: TemplateField[],
  values: Record<string, string>,
): TemplateField[] {
  return camposDeRuta(fields).filter((f) => !String(values[f.key] ?? "").trim());
}

/** Un número tipeado a mano: vacío vale (se completa después), cualquier otra cosa no. */
const esNumeroValido = (v: string): boolean => v === "" || Number.isFinite(Number(v));

/**
 * Lo que manda la tarjeta "En el puente", filtrado y validado.
 *
 * Sólo se aceptan las claves de los campos del camino. Si llega otra se RECHAZA y no se
 * ignora: la ruta no puede servir para cambiarle al viaje los datos de la carga —el remito, el
 * peso con el que se factura— una vez que salió. Eso lo corrige la oficina.
 */
export function valoresDeRuta(
  fields: TemplateField[],
  raw: unknown,
): { values: Record<string, string> } | { error: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { error: "Faltan los datos" };
  const deRuta = new Map(camposDeRuta(fields).map((f) => [f.key, f]));
  const values: Record<string, string> = {};
  for (const [key, valor] of Object.entries(raw as Record<string, unknown>)) {
    const campo = deRuta.get(key);
    if (!campo) return { error: "Ese dato no se completa en el camino" };
    const texto = valor == null ? "" : String(valor).trim();
    if (campo.type === FIELD_TYPE.NUMERO && !esNumeroValido(texto)) {
      return { error: `${campo.label} va en número` };
    }
    values[key] = texto;
  }
  if (!Object.keys(values).length) return { error: "Faltan los datos" };
  return { values };
}

type ParteDestino = "destino" | "destinatario";
export type PartesAlCerrar = Partial<Record<ParteDestino, CampoUbicacion>>;

/** Si esa parte se elige al cerrar. Una fija no se elige nunca: ya la puso la oficina. */
const seEligeAlCerrar = (c: CampoUbicacion | undefined): c is CampoUbicacion =>
  !!c?.al_cerrar && c.modo !== CAMPO_MODO.FIJO;

/** Si la plantilla deja el destino para el cierre: al salir no se pide ni se exige. */
export function destinoSeEligeAlCerrar(cu: CamposUbicacion | null | undefined): boolean {
  return seEligeAlCerrar(cu?.destino);
}

export function destinatarioSeEligeAlCerrar(cu: CamposUbicacion | null | undefined): boolean {
  return seEligeAlCerrar(cu?.destinatario);
}

/**
 * Las partes del destino que el cierre tiene que preguntar: las que la plantilla deja para el
 * final y el viaje todavía no tiene.
 *
 * Un viaje que salió ANTES de que la plantilla cambiara ya trae su destino, y no se le vuelve
 * a preguntar: el chofer lo eligió al salir y eso vale.
 */
export function partesAlCerrar(
  cu: CamposUbicacion | null | undefined,
  trip: Pick<Trip, "destination" | "destinatario">,
): PartesAlCerrar {
  const out: PartesAlCerrar = {};
  if (seEligeAlCerrar(cu?.destino) && !trip.destination?.trim()) out.destino = cu!.destino;
  if (seEligeAlCerrar(cu?.destinatario) && !trip.destinatario?.trim()) {
    out.destinatario = cu!.destinatario;
  }
  return out;
}

const textoDe = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/**
 * El destino con el que cierra el viaje, o qué falta.
 *
 * Sólo se toma lo que manda el chofer en las partes que la plantilla deja para el cierre: en
 * las demás el destino ya se eligió al salir y el cierre no es el lugar para cambiarlo —eso lo
 * corrige la oficina desde la cabecera—. Si la parte es obligatoria (`requerido` no es false)
 * y ni viene ni el viaje la tiene, falta.
 */
export function destinoAlCierre(
  cu: CamposUbicacion | null | undefined,
  trip: Pick<Trip, "destination" | "destinatario">,
  body: { destino?: unknown; destinatario?: unknown },
): { error: string } | { destination: string; destinatario: string | null; cambia: boolean } {
  const partes = partesAlCerrar(cu, trip);
  const destination = (partes.destino && textoDe(body.destino)) || trip.destination;
  const destinatario = (partes.destinatario && textoDe(body.destinatario)) || trip.destinatario;

  if (partes.destino && partes.destino.requerido !== false && !destination?.trim()) {
    return { error: `Falta: ${partes.destino.label ?? "el destino"}` };
  }
  if (partes.destinatario && partes.destinatario.requerido !== false && !destinatario?.trim()) {
    return { error: `Falta: ${partes.destinatario.label ?? "el lugar de descarga"}` };
  }
  return {
    destination,
    destinatario: destinatario || null,
    cambia: destination !== trip.destination || (destinatario || null) !== (trip.destinatario || null),
  };
}

/**
 * El peso en kilos del campo marcado como peso, o null.
 *
 * Al salir se guardaba en `trips.kilos` y listo, porque el peso siempre se pedía en la carga.
 * Ahora puede llegar en el cierre (los internacionales: "cuando lleguen: …kilos") y la columna
 * "Kilos" del Excel sale de `trips.kilos`, no del campo: sin esto esos viajes se exportaban
 * sin peso.
 */
export function pesoDe(fields: TemplateField[], values: Record<string, string>): number | null {
  const campo = fields.find((f) => f.is_weight);
  const crudo = campo ? String(values[campo.key] ?? "").trim() : "";
  if (!crudo) return null;
  const n = Number(crudo);
  return Number.isFinite(n) ? n : null;
}

// ── Dónde descargó el viaje, por lugar (Otros Viajes) ──

/**
 * Lo que el chofer puso en un lugar de descarga, antes de cerrar.
 *
 * Rodrigo (25/9): siempre se llena el primer lugar y después de cada uno se pregunta "¿Agregamos
 * otro lugar de descarga?", hasta que diga que no. Cada lugar: departamento, dónde descargó y la
 * foto de la boleta; kilos o pallets, si quiere. No cuelga de ninguna carga.
 */
export interface LugarDeDescarga {
  /** Id de este lugar, generado en el celular: de él cuelgan sus fotos. */
  sid: string;
  departamento: string;
  lugar: string;
  kilos: string;
  pallets: string;
  /** "No pude sacar la boleta": deja cerrar sin foto y queda marcado. */
  sinBoleta: boolean;
}

export const lugarVacio = (sid: string): LugarDeDescarga => ({
  sid,
  departamento: "",
  lugar: "",
  kilos: "",
  pallets: "",
  sinBoleta: false,
});

const numeroOpcional = (v: unknown): number | null | "mal" => {
  if (v === null || v === undefined || String(v).trim() === "") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : "mal";
};

/**
 * Los lugares de descarga que el chofer manda al cerrar, validados, o qué falta.
 *
 * Siempre hay al menos uno, y cada uno trae departamento y dónde descargó. La foto de la boleta es
 * obligatoria, pero NO traba el cierre: sin señal, sin batería o con la cámara rota, el chofer toca
 * "No pude sacar la boleta" y el viaje se cierra marcado. Un requisito nuestro no puede dejar a un
 * camión sin poder terminar el viaje. `fotosPorSid` cuenta las ya subidas de cada lugar; si no se
 * pasa (el servidor sin R2 configurado) no se mira la foto.
 */
export function lugaresDeDescarga(
  lugares: LugarDeDescarga[],
  fotosPorSid?: Record<string, number>,
): { error: string } | { descargas: Descarga[] } {
  if (!lugares.length) return { error: "Falta dónde descargaste." };
  const vistos = new Set<string>();
  const descargas: Descarga[] = [];
  for (const [i, l] of lugares.entries()) {
    const nombre = lugares.length > 1 ? `Lugar de descarga ${i + 1}` : "La descarga";
    if (!l.sid.trim() || vistos.has(l.sid)) return { error: "Lugar de descarga repetido." };
    vistos.add(l.sid);
    if (!l.departamento.trim()) return { error: `${nombre}: indicá el departamento.` };
    if (!l.lugar.trim()) return { error: `${nombre}: escribí dónde descargaste.` };
    const kilos = numeroOpcional(l.kilos);
    const pallets = numeroOpcional(l.pallets);
    if (kilos === "mal" || pallets === "mal") return { error: `${nombre}: los kilos y los pallets van en número.` };
    if (fotosPorSid && !l.sinBoleta && !fotosPorSid[l.sid]) {
      return { error: `${nombre}: sacá la foto de la boleta o tocá "No pude sacar la boleta".` };
    }
    descargas.push({
      sid: l.sid.trim(),
      departamento: l.departamento.trim(),
      lugar: l.lugar.trim(),
      kilos,
      pallets,
      ...(l.sinBoleta ? { sin_boleta: true } : {}),
    });
  }
  return { descargas };
}

/**
 * Lo que llega al servidor en `descargas`, ya con la forma final. Un valor mal formado se rechaza:
 * no se guarda a medias.
 */
export function descargasDelPedido(raw: unknown): { error: string } | { descargas: Descarga[] } {
  if (!Array.isArray(raw)) return { error: "Falta dónde descargaste." };
  return lugaresDeDescarga(
    raw.map((d: any) => ({
      sid: String(d?.sid ?? ""),
      departamento: String(d?.departamento ?? ""),
      lugar: String(d?.lugar ?? ""),
      kilos: d?.kilos == null ? "" : String(d.kilos),
      pallets: d?.pallets == null ? "" : String(d.pallets),
      sinBoleta: d?.sin_boleta === true,
    })),
  );
}
