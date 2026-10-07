import type { AccionHecha, CodigoDeService, TipoService, Vehiculo } from "./tipos";

/**
 * Los tipos de service REALES (los pasó Rodrigo): cada uno con su código, su nombre, su grupo y su lista de ítems. Es
 * el único lugar donde está qué incluye cada tipo: las pantallas lo leen de acá, no lo repiten.
 *
 * Los de motor traen sus filtros y líquidos ya marcados en "Nuevo service". Los de cubiertas (R, N, RB, NB) no pueden traer
 * posiciones marcadas: abren el flujo de rotación (R, RB) o de cubierta nueva (N, NB) en la sección de cubiertas, y los
 * que dicen "balanceo" dejan el balanceo marcado en cada posición.
 */

export type GrupoDeService = "motor" | "cubiertas";

/** Las secciones del paso 2 donde caen los ítems (los nombres son los de la pantalla). */
export const SECCION = { filtros: "Filtros", liquidos: "Líquidos", motor: "Motor", cubiertas: "Cubiertas" } as const;

export interface ItemDeTipo {
  seccion: string;
  pieza: string;
  accion: AccionHecha;
}

export interface TipoDeService {
  codigo: CodigoDeService;
  nombre: string;
  grupo: GrupoDeService;
  items: ItemDeTipo[];
  /** Cubiertas: el flujo que abre en "Nuevo service". */
  flujo?: "rotacion" | "nueva";
  /** Cubiertas: deja el balanceo marcado en cada posición. */
  balanceo?: boolean;
}

// Las piezas, con el nombre que llevan en pantalla.
export const PIEZA = {
  filtroAceite: "Filtro de aceite de motor",
  centrifugo: "Centrífugo de aceite",
  trampaGasoil: "Trampa de gasoil",
  cartuchoGasoil: "Cartucho de gasoil",
  filtroAire: "Filtro de aire del motor",
  filtroCabina: "Filtro de cabina",
  filtroCaja: "Filtro de caja",
  filtroDiferencial: "Filtro de diferencial",
  filtroAps: "Filtro APS",
  filtroHidraulico: "Filtro hidráulico",
  aceiteMotor: "Aceite de motor",
  liquidoCajaDiferencial: "Líquido de caja y diferencial",
  aguaMotor: "Agua del motor",
  valvulas: "Regulación de válvulas",
} as const;

/**
 * Qué filtro del Stock (ver `FILTROS` en `datos-extra.ts`) corresponde a cada ítem. POR AHORA NO SE DESCUENTA NADA del
 * stock al cargar un service: esto sólo deja anotado dónde se engancharía. El día que se descuente, el lugar es
 * `guardarService` en `servicio.ts`: por cada ítem con filtro del stock que se marcó como "nuevo", restar una unidad de
 * ese modelo.
 */
export const FILTRO_DEL_STOCK: Record<string, string> = {
  [PIEZA.filtroAceite]: "LF3000", // aceite de motor
  [PIEZA.trampaGasoil]: "FF5052", // combustible
  [PIEZA.cartuchoGasoil]: "FF5052", // combustible
  [PIEZA.filtroAire]: "AF25550", // aire
  [PIEZA.filtroHidraulico]: "HF607", // hidráulico
};

const filtro = (pieza: string): ItemDeTipo => ({ seccion: SECCION.filtros, pieza, accion: "nuevo" });
const liquido = (pieza: string): ItemDeTipo => ({ seccion: SECCION.liquidos, pieza, accion: "nuevo" });

export const TIPOS_DE_SERVICE: TipoDeService[] = [
  {
    codigo: "A",
    nombre: "Service A",
    grupo: "motor",
    items: [filtro(PIEZA.filtroAceite), filtro(PIEZA.trampaGasoil), filtro(PIEZA.cartuchoGasoil), filtro(PIEZA.filtroAire), liquido(PIEZA.aceiteMotor)],
  },
  {
    codigo: "B",
    nombre: "Service B",
    grupo: "motor",
    items: [filtro(PIEZA.filtroAceite), filtro(PIEZA.trampaGasoil), filtro(PIEZA.cartuchoGasoil), liquido(PIEZA.aceiteMotor)],
  },
  {
    codigo: "C",
    nombre: "Service C",
    grupo: "motor",
    items: [
      filtro(PIEZA.filtroAceite),
      filtro(PIEZA.centrifugo),
      filtro(PIEZA.trampaGasoil),
      filtro(PIEZA.cartuchoGasoil),
      filtro(PIEZA.filtroAire),
      filtro(PIEZA.filtroCabina),
      filtro(PIEZA.filtroCaja),
      filtro(PIEZA.filtroDiferencial),
      filtro(PIEZA.filtroAps),
      liquido(PIEZA.aceiteMotor),
      liquido(PIEZA.liquidoCajaDiferencial),
    ],
  },
  { codigo: "D", nombre: "Cambio de agua del motor", grupo: "motor", items: [liquido(PIEZA.aguaMotor)] },
  { codigo: "V", nombre: "Regulación de válvulas", grupo: "motor", items: [{ seccion: SECCION.motor, pieza: PIEZA.valvulas, accion: "hecho" }] },
  {
    codigo: "BC",
    nombre: "Service BC",
    grupo: "motor",
    items: [filtro(PIEZA.filtroAceite), filtro(PIEZA.centrifugo), filtro(PIEZA.trampaGasoil), filtro(PIEZA.cartuchoGasoil), liquido(PIEZA.aceiteMotor)],
  },
  { codigo: "R", nombre: "Rotación de cubiertas", grupo: "cubiertas", items: [], flujo: "rotacion" },
  { codigo: "N", nombre: "Colocación de cubiertas nuevas", grupo: "cubiertas", items: [], flujo: "nueva" },
  { codigo: "RB", nombre: "Rotación y balanceo", grupo: "cubiertas", items: [], flujo: "rotacion", balanceo: true },
  { codigo: "NB", nombre: "Nuevas balanceadas", grupo: "cubiertas", items: [], flujo: "nueva", balanceo: true },
];

export const tipoDeService = (codigo: CodigoDeService): TipoDeService => TIPOS_DE_SERVICE.find((t) => t.codigo === codigo) as TipoDeService;
export const NOMBRE_OTRO = "Otro / reparación suelta";
export const EXPLICACION_OTRO = "Una reparación que no es un service: se marca sólo lo que se hizo.";

/** "A + D + R": los códigos de un service, combinados. */
export const codigoCombinado = (tipos: TipoService[]) => (tipos.length === 0 ? "—" : tipos.map((t) => (t === "otro" ? "Otro" : t)).join(" + "));

const sinOtro = (tipos: TipoService[]) => tipos.filter((t): t is CodigoDeService => t !== "otro");

/** Los ítems de varios tipos juntos: si dos comparten uno, va una sola vez. */
export function itemsDeLosTipos(tipos: TipoService[]): ItemDeTipo[] {
  const vistos = new Map<string, ItemDeTipo>();
  for (const c of sinOtro(tipos)) {
    for (const it of tipoDeService(c).items) {
      const clave = `${it.seccion}|${it.pieza}`;
      if (!vistos.has(clave)) vistos.set(clave, it);
    }
  }
  return [...vistos.values()];
}

/** De los tipos elegidos: si piden el flujo de rotación, el de cubierta nueva, o el balanceo. */
export function flujoDeCubiertas(tipos: TipoService[]): { rotacion: boolean; nueva: boolean; balanceo: boolean } {
  const ts = sinOtro(tipos).map(tipoDeService);
  return { rotacion: ts.some((t) => t.flujo === "rotacion"), nueva: ts.some((t) => t.flujo === "nueva"), balanceo: ts.some((t) => t.balanceo) };
}

/** Qué incluye un tipo, en una línea: "Filtro de aceite de motor, trampa de gasoil… · Líquidos: aceite de motor". */
export function contenidoDeTipo(t: TipoDeService): string {
  if (t.grupo === "cubiertas") {
    return t.flujo === "rotacion"
      ? `Rotación de cubiertas${t.balanceo ? " y balanceo" : ""}: se marca cada cubierta y a qué posición pasó.`
      : `Colocación de cubiertas nuevas${t.balanceo ? ", balanceadas" : ""}: se marca cada posición y la cubierta que se puso.`;
  }
  const bajar = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
  const lista = (seccion: string) => t.items.filter((i) => i.seccion === seccion).map((i) => bajar(i.pieza));
  const filtros = [...lista(SECCION.filtros), ...lista(SECCION.motor)];
  const liquidos = lista(SECCION.liquidos);
  const primero = filtros.length > 0 ? filtros.join(", ") : "";
  const cambio = t.codigo === "D" ? liquidos.join(", ") : primero;
  return [cambio.charAt(0).toUpperCase() + cambio.slice(1), t.codigo !== "D" && liquidos.length > 0 ? `Líquidos: ${liquidos.join(", ")}` : ""].filter(Boolean).join(" · ");
}

/** Los tipos que se ofrecen para un vehículo: los de motor sólo si lleva motor, los de cubiertas sólo si lleva cubiertas. */
export function tiposDisponibles(v: Pick<Vehiculo, "componentes" | "disposicion">): TipoDeService[] {
  const conMotor = v.componentes.some((c) => c.id === "motor");
  const conCubiertas = v.disposicion != null;
  return TIPOS_DE_SERVICE.filter((t) => (t.grupo === "motor" ? conMotor : conCubiertas));
}

/** "Nombre: contenido", sin repetir el nombre cuando el contenido ya empieza con él. */
export function descripcionDeTipo(t: TipoDeService): string {
  const c = contenidoDeTipo(t);
  return c.toLowerCase().startsWith(t.nombre.toLowerCase()) ? c : `${t.nombre}: ${c}`;
}
