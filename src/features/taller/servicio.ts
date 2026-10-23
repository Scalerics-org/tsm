import { useSyncExternalStore } from "react";
import { aplicarCambios, type CambioDeCubierta } from "@shared/taller/cambio-cubiertas";
import { ACEITES_DE_EJEMPLO, CUBIERTAS_EN_STOCK, FILTROS_DE_EJEMPLO } from "./datos-extra";
import { aplicarMovimiento, colocarEnLugarVacio, uidDeStock, type CubiertaBaja, type Movimiento, type Reemplazo, type Situacion } from "@shared/taller/movimientos";
import { avisoDeCambioDeTipo, posiciones } from "@shared/taller/disposicion";
import { descontar, esItemDeStock, type ConsumoDeStock, type ItemDeStock } from "@shared/taller/stock-consumibles";
import { editarCubiertaStock } from "@shared/taller/stock-cubiertas";
import { marcaNueva, marcasSegunTipos, type Marca, type Marcas, type SeccionDeService } from "@shared/taller/servicio";
import { PIEZA, SECCION, flujoDeCubiertas, itemsDeLosTipos } from "@shared/taller/tipos-de-service";
import type { AccionHecha, Cubierta, CubiertaEnStock, ItemHecho, PuestaAnterior, Service, TipoService, Vehiculo } from "@shared/taller/tipos";

/**
 * Todo lo del "Nuevo service": qué se puede marcar (el catálogo, por sección), cómo se busca una pieza en el
 * historial y dónde se guardan, sólo mientras la maqueta está abierta, los services que se cargan.
 */

/** Un service ya armado de ejemplo para `?demo=1`: A + D + R, más un par de reparaciones sueltas. */
export const TIPOS_DEL_EJEMPLO: TipoService[] = ["A", "D", "R"];
export function marcasDeEjemplo(v: Vehiculo, secciones: SeccionDeService[]): Marcas {
  const m = marcasSegunTipos(secciones, [], TIPOS_DEL_EJEMPLO, {});
  const pon = (seccion: string, sujeto: string, pieza: string, parcial: Partial<Marca>) => {
    m[`${seccion}|${sujeto}|${pieza}`] = marcaNueva(parcial);
  };
  pon(SECCION.filtros, "", PIEZA.filtroAire, { accion: "nuevo", obs: "Estaba muy sucio." });
  pon("Motor", "", "Alternador", { accion: "reparado", obs: "Rebobinado en el taller de la calle." });
  pon("Frenos y rodaje, por rueda", "Rueda 4", "Zapatas / cintas", { accion: "nuevo", medida: "18" });
  if (v.disposicion) {
    // La R del ejemplo: la cubierta 3 pasa a la posición 4 (y la 4, a la 3).
    pon(SECCION.cubiertas, "Posición 3", `Cubierta 3 · ${posiciones(v.disposicion)[2]?.nombre ?? ""}`, { accion: "revisado", rotaA: "4" });
  }
  return m;
}

// ── Lo cargado en la maqueta: se guarda en este navegador (localStorage) y se puede borrar ──
/** Todo lo que se cargó: services, las cubiertas de cada vehículo tal como quedaron, y lo que cambió del stock. */
interface Guardado {
  services: Record<string, Service[]>;
  cubiertas: Record<string, Cubierta[]>;
  /** Las cubiertas de stock que no son de ejemplo: las compradas en el alta y las que salieron de un vehículo. */
  stockUsadas: CubiertaEnStock[];
  /** Ids de las cubiertas de ejemplo del stock que ya no están (se usaron, se movieron, se editaron o se eliminaron). */
  stockQuitadas: string[];
  /** Las cubiertas dadas de baja. */
  bajas: CubiertaBaja[];
  /** El historial de las posiciones que quedaron sin cubierta, por matrícula. */
  vacias: Record<string, Record<number, PuestaAnterior[]>>;
  /** El tipo de vehículo (id de disposición) con el que se cargaron las cubiertas de cada matrícula. Sin esto, un cambio de tipo pasa en silencio. */
  tipos: Record<string, string>;
  /** Cuántas cubiertas se sacaron, movieron o pusieron (para el contador del botón de volver al ejemplo). */
  movimientos: number;
  /** Los aceites y líquidos del depósito, cada tipo con sus compras y usos. */
  aceites: ItemDeStock[];
  /** Los filtros del depósito, cada modelo con sus compras y usos. */
  filtros: ItemDeStock[];
}
const VACIO: Guardado = {
  services: {},
  cubiertas: {},
  stockUsadas: [],
  stockQuitadas: [],
  bajas: [],
  vacias: {},
  tipos: {},
  movimientos: 0,
  aceites: ACEITES_DE_EJEMPLO,
  filtros: FILTROS_DE_EJEMPLO,
};
// v5: aceites y filtros pasan a ser ítems con sus movimientos (compras y usos). Lo guardado con la forma de v4 no se lee.
const CLAVE = "tsm-taller-maqueta-v5";

/** Lee lo guardado. Si no se puede (sin permiso, vacío o roto) la maqueta sigue con los datos de ejemplo. */
function leer(): Guardado {
  try {
    const raw = window.localStorage.getItem(CLAVE);
    if (!raw) return VACIO;
    const j = JSON.parse(raw) as Partial<Guardado>;
    return {
      services: j.services && typeof j.services === "object" ? j.services : {},
      cubiertas: j.cubiertas && typeof j.cubiertas === "object" ? j.cubiertas : {},
      stockUsadas: Array.isArray(j.stockUsadas) ? j.stockUsadas : [],
      stockQuitadas: Array.isArray(j.stockQuitadas) ? j.stockQuitadas : [],
      bajas: Array.isArray(j.bajas) ? j.bajas : [],
      vacias: j.vacias && typeof j.vacias === "object" ? j.vacias : {},
      tipos: j.tipos && typeof j.tipos === "object" ? j.tipos : {},
      movimientos: typeof j.movimientos === "number" ? j.movimientos : 0,
      aceites: Array.isArray(j.aceites) ? j.aceites.filter(esItemDeStock) : ACEITES_DE_EJEMPLO,
      filtros: Array.isArray(j.filtros) ? j.filtros.filter(esItemDeStock) : FILTROS_DE_EJEMPLO,
    };
  } catch {
    return VACIO;
  }
}

let guardado: Guardado = leer();
const oyentes = new Set<() => void>();
const avisar = () => oyentes.forEach((f) => f());

/** Escribe sin romper nada si el navegador no deja (modo privado, cuota llena): lo cargado vive sólo en pantalla. */
function persistir(): void {
  try {
    window.localStorage.setItem(CLAVE, JSON.stringify(guardado));
  } catch {
    /* sin almacenamiento: la maqueta sigue andando, sólo no recuerda */
  }
}

const suscribir = (f: () => void) => {
  oyentes.add(f);
  return () => void oyentes.delete(f);
};
const instantanea = () => guardado;

/** El stock como está hoy: el de ejemplo, menos lo que se usó, más lo que salió de los vehículos. */
export const stockDe = (g: Guardado): CubiertaEnStock[] => [
  ...g.stockUsadas,
  ...CUBIERTAS_EN_STOCK.filter((c) => !g.stockQuitadas.includes(uidDeStock(c))),
];

/** Lo que pasó con las cubiertas se aplica sobre la flota tal como está hoy; esto es lo que ve y guarda la maqueta. */
function situacionDe(flota: Vehiculo[]): Situacion {
  return {
    flota: Object.fromEntries(
      flota.filter((v) => v.disposicion).map((v) => [v.patente, { km: v.km, cubiertas: v.cubiertas, vacias: v.vacias ?? {} }]),
    ),
    stock: stockDe(guardado),
    bajas: guardado.bajas,
  };
}

/** El tipo de cada vehículo de la flota de hoy (id de disposición), para anotar con qué tipo se guardaron sus cubiertas. */
const tiposDe = (flota: Vehiculo[]): Record<string, string> =>
  Object.fromEntries(flota.flatMap((v) => (v.disposicion ? [[v.patente, v.disposicion.id]] : [])));

/** Guarda el resultado de un movimiento (o de poner una cubierta) y avisa a las pantallas. */
function guardarSituacion(antes: Situacion, despues: Situacion, tipos: Record<string, string>): Situacion {
  if (despues === antes) return antes;
  const cubiertas = { ...guardado.cubiertas };
  const vacias = { ...guardado.vacias };
  const tiposGuardados = { ...guardado.tipos };
  for (const [patente, v] of Object.entries(despues.flota)) {
    if (v === antes.flota[patente]) continue;
    cubiertas[patente] = v.cubiertas;
    vacias[patente] = v.vacias;
    if (tipos[patente]) tiposGuardados[patente] = tipos[patente];
  }
  // El stock de ejemplo se guarda por lo que falta; todo lo demás (usadas, o una de ejemplo que volvió) tal cual.
  const deEjemplo = new Set<CubiertaEnStock>(CUBIERTAS_EN_STOCK);
  guardado = {
    ...guardado,
    cubiertas,
    vacias,
    tipos: tiposGuardados,
    bajas: despues.bajas,
    movimientos: guardado.movimientos + 1,
    stockUsadas: despues.stock.filter((c) => !deEjemplo.has(c)),
    stockQuitadas: CUBIERTAS_EN_STOCK.filter((c) => !despues.stock.includes(c)).map(uidDeStock),
  };
  persistir();
  avisar();
  return despues;
}

const nuevoId = () => `c-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Saca o mueve una cubierta (baja, stock, otra posición o de otro vehículo). `flota` es la de hoy, con lo cargado. */
export function moverCubierta(flota: Vehiculo[], m: Movimiento): void {
  const antes = situacionDe(flota);
  guardarSituacion(antes, aplicarMovimiento(antes, m, nuevoId), tiposDe(flota));
}

/** Pone una cubierta (del stock o a mano) en una posición que estaba vacía. */
export function ponerCubierta(flota: Vehiculo[], c: { patente: string; posicion: number; fecha: string; km: number; reemplazo: Reemplazo }): void {
  const antes = situacionDe(flota);
  guardarSituacion(antes, colocarEnLugarVacio(antes, c, nuevoId), tiposDe(flota));
}

/**
 * Guarda un service. Si marcó cubiertas nuevas o rotaciones, actualiza posiciones, historial y stock de cubiertas. Y lo que
 * marcó de aceites y filtros sale del depósito: cada consumo queda como un uso con el service, el vehículo y la fecha.
 */
export function guardarService(v: Vehiculo, s: Service, cambios: CambioDeCubierta[] = [], consumos: ConsumoDeStock[] = []): void {
  const r = cambios.length > 0 ? aplicarCambios(v, s, cambios, stockDe(guardado)) : null;
  const uso = { patente: v.patente, servicio: s.id, fecha: s.fecha };
  guardado = {
    ...guardado,
    services: { ...guardado.services, [v.patente]: [s, ...(guardado.services[v.patente] ?? [])] },
    cubiertas: r ? { ...guardado.cubiertas, [v.patente]: r.cubiertas } : guardado.cubiertas,
    tipos: r && v.disposicion ? { ...guardado.tipos, [v.patente]: v.disposicion.id } : guardado.tipos,
    stockUsadas: r ? [...r.usadas, ...guardado.stockUsadas] : guardado.stockUsadas,
    stockQuitadas: r ? [...guardado.stockQuitadas, ...r.quitadasDelStock] : guardado.stockQuitadas,
    aceites: descontar(guardado.aceites, consumos.filter((c) => c.de === "aceite"), uso, nuevoId),
    filtros: descontar(guardado.filtros, consumos.filter((c) => c.de === "filtro"), uso, nuevoId),
  };
  persistir();
  avisar();
}

/** Cambia los aceites o los filtros del depósito (altas, compras, ediciones y eliminaciones salen de la pantalla de Stock). */
export function cambiarConsumibles(cambio: { aceites?: ItemDeStock[]; filtros?: ItemDeStock[] }): void {
  guardado = { ...guardado, ...cambio, movimientos: guardado.movimientos + 1 };
  persistir();
  avisar();
}

/** Da de alta cubiertas compradas (una por cada código de la compra). */
export function altaDeCubiertasEnStock(nuevas: CubiertaEnStock[]): void {
  guardado = { ...guardado, stockUsadas: [...guardado.stockUsadas, ...nuevas], movimientos: guardado.movimientos + 1 };
  persistir();
  avisar();
}

/**
 * Edita una cubierta del stock. Si es una de ejemplo, se la saca de la lista de ejemplo y su copia editada queda como propia,
 * con el mismo uid: el recorrido de la cubierta sigue siendo el mismo.
 */
export function editarCubiertaEnStock(uid: string, cambios: Partial<Pick<CubiertaEnStock, "codigo" | "modeloId" | "estado" | "desde" | "proveedor" | "obs">>): void {
  const actual = stockDe(guardado).find((c) => uidDeStock(c) === uid);
  if (!actual) return;
  const editada = editarCubiertaStock(actual, cambios);
  const deEjemplo = CUBIERTAS_EN_STOCK.some((c) => uidDeStock(c) === uid);
  guardado = {
    ...guardado,
    stockUsadas: [...guardado.stockUsadas.filter((c) => uidDeStock(c) !== uid), editada],
    stockQuitadas: deEjemplo && !guardado.stockQuitadas.includes(uid) ? [...guardado.stockQuitadas, uid] : guardado.stockQuitadas,
    movimientos: guardado.movimientos + 1,
  };
  persistir();
  avisar();
}

/** Saca del stock una cubierta que no está colocada en ningún vehículo. */
export function eliminarCubiertaDeStock(uid: string): void {
  const deEjemplo = CUBIERTAS_EN_STOCK.some((c) => uidDeStock(c) === uid);
  guardado = {
    ...guardado,
    stockUsadas: guardado.stockUsadas.filter((c) => uidDeStock(c) !== uid),
    stockQuitadas: deEjemplo && !guardado.stockQuitadas.includes(uid) ? [...guardado.stockQuitadas, uid] : guardado.stockQuitadas,
    movimientos: guardado.movimientos + 1,
  };
  persistir();
  avisar();
}

/** Los aceites y líquidos del depósito, con sus compras y usos. */
export function useAceites(): ItemDeStock[] {
  return useSyncExternalStore(suscribir, instantanea).aceites;
}

/** Los filtros del depósito, con sus compras y usos. */
export function useFiltros(): ItemDeStock[] {
  return useSyncExternalStore(suscribir, instantanea).filtros;
}

/** "Volver a los datos de ejemplo": borra lo cargado, también del navegador. */
export function volverALosDatosDeEjemplo(): void {
  guardado = VACIO;
  try {
    window.localStorage.removeItem(CLAVE);
  } catch {
    /* nada que borrar */
  }
  avisar();
}

/** Cuántas cosas se cargaron (para saber si hay algo que borrar). */
export const cuantoSeCargo = (g: Guardado) => Object.values(g.services).reduce((n, l) => n + l.length, 0) + g.movimientos;

const conLoCargado = (v: Vehiculo, g: Guardado): Vehiculo => {
  const nuevos = g.services[v.patente];
  const cubiertas = g.cubiertas[v.patente];
  const vacias = g.vacias[v.patente];
  if (!nuevos && !cubiertas && !vacias) return v;
  // Si cambió el tipo desde que se cargaron las cubiertas, la ficha lo dice (en "A confirmar"); no se toca ninguna cubierta.
  const aviso = v.disposicion && cubiertas ? avisoDeCambioDeTipo(v.disposicion, g.tipos[v.patente], cubiertas) : undefined;
  const disposicion = v.disposicion && aviso ? { ...v.disposicion, aConfirmar: [v.disposicion.aConfirmar, aviso].filter(Boolean).join(" ") } : v.disposicion;
  return {
    ...v,
    disposicion,
    services: nuevos ? [...nuevos, ...v.services] : v.services,
    cubiertas: cubiertas ?? v.cubiertas,
    vacias: vacias ?? v.vacias,
  };
};

/** El vehículo con lo que se cargó en este navegador: services nuevos y cubiertas como quedaron. */
export function useConServicios(v: Vehiculo): Vehiculo {
  return conLoCargado(v, useSyncExternalStore(suscribir, instantanea));
}

/** Toda la flota con lo cargado, para los listados. */
export function useFlotaConLoCargado(flota: Vehiculo[]): Vehiculo[] {
  const g = useSyncExternalStore(suscribir, instantanea);
  return flota.map((v) => conLoCargado(v, g));
}

/** El stock de cubiertas hoy. */
export function useStock(): CubiertaEnStock[] {
  return stockDe(useSyncExternalStore(suscribir, instantanea));
}

export function useCuantoSeCargo(): number {
  return cuantoSeCargo(useSyncExternalStore(suscribir, instantanea));
}

/** Las cubiertas dadas de baja. */
export function useBajas(): CubiertaBaja[] {
  return useSyncExternalStore(suscribir, instantanea).bajas;
}

/** Un id de service nuevo, que no choca con los de ejemplo. */
export const idDeService = (patente: string) => `${patente.replace(/\s+/g, "")}-${Date.now().toString(36)}`;

// ── Ítems de los services de ejemplo ──
const AZAR = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10_000) / 10_000;
};

const item = (seccion: string, sujeto: string, pieza: string, accion: AccionHecha, obs = "", medida?: string): ItemHecho => ({
  seccion,
  sujeto,
  pieza,
  accion,
  obs,
  medida,
});

/** Los tipos de los services de ejemplo, (datos de ejemplo: los tipos no tienen un orden fijo, los elige el mecánico en cada service). */
export const TIPOS_DE_LOS_EJEMPLOS: TipoService[][] = [["A"], ["B"], ["A", "R"], ["C"], ["A", "D"], ["BC", "RB"], ["B", "V"], ["A", "NB"]];

/** Lo que dejaron los tipos de un service de ejemplo, más un par de reparaciones sueltas. */
export function itemsDeService(v: Pick<Vehiculo, "patente" | "disposicion">, tipos: TipoService[], orden: number, fijos?: ItemHecho[]): ItemHecho[] {
  const hechos: ItemHecho[] = itemsDeLosTipos(tipos).map((i) => item(i.seccion, "", i.pieza, i.accion));
  const ruedas = v.disposicion ? posiciones(v.disposicion).length : 0;
  const f = flujoDeCubiertas(tipos);
  if (ruedas > 0 && (f.rotacion || f.nueva)) {
    const a = 1 + Math.floor(AZAR(`${v.patente}-c-${orden}`) * ruedas);
    const b = a === ruedas ? a - 1 : a + 1;
    const balanceo = (n: number) => item(SECCION.cubiertas, `Posición ${n}`, `Balanceo de la cubierta ${n}`, "hecho");
    if (f.rotacion) {
      hechos.push(item(SECCION.cubiertas, `Posición ${a}`, `Cubierta ${a}`, "revisado", `rotada a la posición ${b}`));
      hechos.push(item(SECCION.cubiertas, `Posición ${b}`, `Cubierta ${b}`, "revisado", `rotada a la posición ${a}`));
      if (f.balanceo) hechos.push(balanceo(a), balanceo(b));
    }
    if (f.nueva) {
      hechos.push(item(SECCION.cubiertas, `Posición ${a}`, `Cubierta ${a}`, "nuevo", "Cambio por desgaste."));
      if (f.balanceo) hechos.push(balanceo(a));
    }
  }
  if (fijos) return [...hechos, ...fijos];

  // Una reparación suelta de vez en cuando, para que la búsqueda tenga qué encontrar.
  const pool: ItemHecho[] = [
    item("Motor", "", "Alternador", "reparado", "Cambio de carbones."),
    item("Motor", "", "Correas", "nuevo"),
    item("Motor", "", "Radiadores", "reparado", "Tenía una pérdida."),
    item("Caja de cambios", "", "Prensa y disco", "nuevo"),
    item("Electricidad", "", "Instalación general", "reparado", "Falso contacto en las luces."),
    item("Chasis", "", "Barras de dirección", "nuevo"),
  ];
  if (ruedas > 0) {
    const r = 1 + Math.floor(AZAR(`${v.patente}-r-${orden}`) * ruedas);
    pool.push(
      item("Frenos y rodaje, por rueda", `Rueda ${r}`, "Zapatas / cintas", "nuevo", "", "18 mm"),
      item("Frenos y rodaje, por rueda", `Rueda ${r}`, "Rulemanes", "nuevo"),
    );
  }
  const extra = pool[Math.floor(AZAR(`${v.patente}-a-${orden}`) * pool.length)];
  return AZAR(`${v.patente}-c2-${orden}`) > 0.45 ? [...hechos, extra] : hechos;
}
