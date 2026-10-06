import { useSyncExternalStore } from "react";
import { MODELOS } from "./base";
import { aplicarCambios, type CambioDeCubierta } from "./cambio-cubiertas";
import { CUBIERTAS_EN_STOCK, PIEZAS_DE_RUEDA, type CubiertaEnStock } from "./datos-extra";
import { aplicarMovimiento, colocarEnLugarVacio, uidDeStock, type CubiertaBaja, type Movimiento, type Reemplazo, type Situacion } from "./movimientos";
import { posiciones } from "./disposicion";
import type { AccionHecha, Cubierta, ItemHecho, PuestaAnterior, Service, TipoService, Vehiculo } from "./tipos";

/**
 * Todo lo del "Nuevo service": qué se puede marcar (el catálogo, por sección), cómo se busca una pieza en el
 * historial y dónde se guardan, sólo mientras la maqueta está abierta, los services que se cargan.
 */

// ── Tipos de service: contenido de EJEMPLO. Qué incluye cada uno lo dice Rodrigo después. ──
export const TIPOS_DE_SERVICE: { id: TipoService; nombre: string; ejemplo: string }[] = [
  { id: "A", nombre: "Service A", ejemplo: "Aceite y filtro de aceite de motor." },
  { id: "B", nombre: "Service B", ejemplo: "Todo lo del A, más filtro de combustible y filtro de aire." },
  { id: "C", nombre: "Service C", ejemplo: "Todo lo del B, más revisión de zapatas y rulemanes de todas las ruedas." },
  { id: "otro", nombre: "Otro / reparación suelta", ejemplo: "Una reparación que no es un service: se marca sólo lo que se hizo." },
];
export const nombreDelTipo = (t: TipoService) => (t === "otro" ? "Otro" : t);

// ── El catálogo de lo que se puede marcar ──
export interface ItemCatalogo {
  sujeto: string;
  pieza: string;
  /** Si lleva una medida (mm de las zapatas, del tambor). */
  medida?: { unidad: string; ayuda: string };
  /** Si al ponerla nueva se pide el código (opcional) de la cubierta. */
  conCodigo?: boolean;
}
export interface GrupoDeItems {
  /** "Rueda 4 · Eje trasero 1 · izquierda interior" o vacío cuando la sección no se divide. */
  titulo: string;
  items: ItemCatalogo[];
}
export interface SeccionDeService {
  id: string;
  nombre: string;
  grupos: GrupoDeItems[];
}

export const claveDeItem = (seccion: string, it: Pick<ItemCatalogo, "sujeto" | "pieza">) => `${seccion}|${it.sujeto}|${it.pieza}`;

const soloPiezas = (nombres: string[]): GrupoDeItems => ({ titulo: "", items: nombres.map((pieza) => ({ sujeto: "", pieza })) });

/** Las secciones que se recorren al cargar un service, según lo que lleva el vehículo. */
export function seccionesDeService(v: Vehiculo): SeccionDeService[] {
  const secciones: SeccionDeService[] = [];
  const componente = (id: string) => v.componentes.find((c) => c.id === id);
  const conMotor = !!componente("motor");

  if (conMotor) {
    secciones.push({
      id: "aceite",
      nombre: "Aceite y filtros",
      grupos: [soloPiezas(["Aceite de motor", "Filtro de aceite", "Filtro de combustible", "Filtro de aire", "Filtro hidráulico"])],
    });
  }
  for (const id of ["motor", "caja", "diferencial"]) {
    const c = componente(id);
    if (c) secciones.push({ id, nombre: c.nombre, grupos: [soloPiezas(c.piezas.map((p) => p.nombre))] });
  }

  if (v.disposicion) {
    const pos = posiciones(v.disposicion);
    secciones.push({
      id: "ruedas",
      nombre: "Frenos y rodaje, por rueda",
      grupos: pos.map((p) => ({
        titulo: `Rueda ${p.numero} · ${p.nombre}`,
        items: PIEZAS_DE_RUEDA.map((pz) => ({
          sujeto: `Rueda ${p.numero}`,
          pieza: pz.nombre,
          medida: pz.medida
            ? { unidad: pz.medida.unidad, ayuda: pz.medida.sentido === "min" ? `mínimo ${pz.medida.limite} ${pz.medida.unidad}` : `máximo ${pz.medida.limite} ${pz.medida.unidad}` }
            : undefined,
        })),
      })),
    });
    secciones.push({
      id: "cubiertas",
      nombre: "Cubiertas",
      grupos: [
        {
          titulo: "",
          items: pos.map((p) => ({ sujeto: `Posición ${p.numero}`, pieza: `Cubierta ${p.numero} · ${p.nombre}`, conCodigo: true })),
        },
      ],
    });
  }

  for (const id of ["chasis", "electricidad"]) {
    const c = componente(id);
    if (c) secciones.push({ id, nombre: c.nombre, grupos: [soloPiezas(c.piezas.map((p) => p.nombre))] });
  }
  return secciones;
}

// ── Lo marcado en un service nuevo ──
export interface Marca {
  accion: AccionHecha;
  medida: string;
  obs: string;
  codigo: string;
  /** Cubierta nueva: el modelo (vacío = el que tenía la posición) y, si salió del stock, su código. */
  modelo: string;
  delStock: string;
  /** Cubierta revisada o reparada que se rotó: a qué posición pasó. */
  rotaA: string;
}
export type Marcas = Record<string, Marca>;

export const marcaNueva = (): Marca => ({ accion: "revisado", medida: "", obs: "", codigo: "", modelo: "", delStock: "", rotaA: "" });

/** Pasa lo marcado a los ítems del service, en el orden del catálogo. Sólo lo marcado entra. */
export function itemsDeMarcas(secciones: SeccionDeService[], marcas: Marcas): ItemHecho[] {
  const hechos: ItemHecho[] = [];
  for (const s of secciones) {
    for (const g of s.grupos) {
      for (const it of g.items) {
        const m = marcas[claveDeItem(s.nombre, it)];
        if (!m) continue;
        const deCubierta = it.conCodigo
          ? [
              m.accion === "nuevo" && m.delStock && `del stock ${m.delStock}`,
              m.accion === "nuevo" && !m.delStock && m.modelo && MODELOS[m.modelo]?.nombre,
              m.accion === "nuevo" && !m.delStock && m.codigo.trim() && `código ${m.codigo.trim()}`,
              m.accion !== "nuevo" && m.rotaA && `rotada a la posición ${m.rotaA}`,
            ]
          : [m.codigo.trim() && `código ${m.codigo.trim()}`];
        const extra = [...deCubierta, m.obs.trim()].filter(Boolean).join(" · ");
        hechos.push({
          seccion: s.nombre,
          sujeto: it.sujeto,
          pieza: it.pieza,
          accion: m.accion,
          medida: m.medida.trim() ? `${m.medida.trim()} ${it.medida?.unidad ?? ""}`.trim() : undefined,
          obs: extra,
        });
      }
    }
  }
  return hechos;
}

/** Cuántos ítems marcados tiene cada sección (para el contador de cada una). */
export const marcadosEn = (s: SeccionDeService, marcas: Marcas) =>
  s.grupos.reduce((n, g) => n + g.items.filter((it) => marcas[claveDeItem(s.nombre, it)]).length, 0);

/** Un service ya armado de ejemplo para `?demo=1`: lo que se vería después de un rato de marcar. */
export function marcasDeEjemplo(v: Vehiculo): Marcas {
  const m: Marcas = {};
  const pon = (seccion: string, sujeto: string, pieza: string, parcial: Partial<Marca>) => {
    m[`${seccion}|${sujeto}|${pieza}`] = { ...marcaNueva(), ...parcial };
  };
  pon("Aceite y filtros", "", "Aceite de motor", { accion: "nuevo", obs: "38 litros" });
  pon("Aceite y filtros", "", "Filtro de aceite", { accion: "nuevo" });
  pon("Motor", "", "Alternador", { accion: "reparado", obs: "Rebobinado en el taller de la calle." });
  pon("Frenos y rodaje, por rueda", "Rueda 4", "Zapatas / cintas", { accion: "nuevo", medida: "18" });
  pon("Frenos y rodaje, por rueda", "Rueda 4", "Tambor (campana)", { accion: "revisado", medida: "421,2", obs: "Se rectificó." });
  pon("Frenos y rodaje, por rueda", "Rueda 7", "Rulemanes", { accion: "nuevo" });
  if (v.disposicion && v.disposicion.ejes.length > 1) {
    pon("Cubiertas", "Posición 7", `Cubierta 7 · ${posiciones(v.disposicion)[6]?.nombre ?? ""}`, { accion: "nuevo", codigo: "R-118", modelo: "multi", obs: "" });
  }
  return m;
}

// ── Búsqueda por pieza ──
const normalizar = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export interface Coincidencia {
  service: Service;
  item: ItemHecho;
}

/**
 * "Cuando rompe algo, buscar en qué service se le cambió". Cada palabra buscada tiene que estar al principio de
 * alguna palabra de la sección, el sujeto, la pieza o la obs del ítem; los números, enteros ("7" no es "17").
 */
export function buscarEnHistorial(services: Service[], consulta: string): Coincidencia[] {
  const palabras = normalizar(consulta).split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return [];
  const resultado: Coincidencia[] = [];
  for (const service of [...services].sort((a, b) => b.km - a.km)) {
    for (const item of service.items) {
      const del = normalizar(`${item.seccion} ${item.sujeto} ${item.pieza} ${item.obs}`).split(/[^a-z0-9,]+/).filter(Boolean);
      const sirve = palabras.every((q) => del.some((w) => (/^\d+$/.test(q) ? w === q : w.startsWith(q))));
      if (sirve) resultado.push({ service, item });
    }
  }
  return resultado;
}

// ── Lo cargado en la maqueta: se guarda en este navegador (localStorage) y se puede borrar ──
/** Todo lo que se cargó: services, las cubiertas de cada vehículo tal como quedaron, y lo que cambió del stock. */
interface Guardado {
  services: Record<string, Service[]>;
  cubiertas: Record<string, Cubierta[]>;
  stockUsadas: CubiertaEnStock[];
  /** Ids de las cubiertas de ejemplo del stock que ya no están (se usaron o se movieron). */
  stockQuitadas: string[];
  /** Las cubiertas dadas de baja. */
  bajas: CubiertaBaja[];
  /** El historial de las posiciones que quedaron sin cubierta, por matrícula. */
  vacias: Record<string, Record<number, PuestaAnterior[]>>;
  /** Cuántas cubiertas se sacaron, movieron o pusieron (para el contador del botón de volver al ejemplo). */
  movimientos: number;
}
const VACIO: Guardado = { services: {}, cubiertas: {}, stockUsadas: [], stockQuitadas: [], bajas: [], vacias: {}, movimientos: 0 };
// v3: cambiaron los tipos de vehículo (y con ellos las posiciones): lo guardado con los anteriores no sirve.
const CLAVE = "tsm-taller-maqueta-v3";

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
      movimientos: typeof j.movimientos === "number" ? j.movimientos : 0,
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

/** Guarda el resultado de un movimiento (o de poner una cubierta) y avisa a las pantallas. */
function guardarSituacion(antes: Situacion, despues: Situacion): Situacion {
  if (despues === antes) return antes;
  const cubiertas = { ...guardado.cubiertas };
  const vacias = { ...guardado.vacias };
  for (const [patente, v] of Object.entries(despues.flota)) {
    if (v === antes.flota[patente]) continue;
    cubiertas[patente] = v.cubiertas;
    vacias[patente] = v.vacias;
  }
  // El stock de ejemplo se guarda por lo que falta; todo lo demás (usadas, o una de ejemplo que volvió) tal cual.
  const deEjemplo = new Set<CubiertaEnStock>(CUBIERTAS_EN_STOCK);
  guardado = {
    ...guardado,
    cubiertas,
    vacias,
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
  guardarSituacion(antes, aplicarMovimiento(antes, m, nuevoId));
}

/** Pone una cubierta (del stock o a mano) en una posición que estaba vacía. */
export function ponerCubierta(flota: Vehiculo[], c: { patente: string; posicion: number; fecha: string; km: number; reemplazo: Reemplazo }): void {
  const antes = situacionDe(flota);
  guardarSituacion(antes, colocarEnLugarVacio(antes, c, nuevoId));
}

/** Guarda un service y, si marcó cubiertas nuevas o rotaciones, actualiza posiciones, historial y stock. */
export function guardarService(v: Vehiculo, s: Service, cambios: CambioDeCubierta[] = []): void {
  const r = cambios.length > 0 ? aplicarCambios(v, s, cambios, stockDe(guardado)) : null;
  guardado = {
    ...guardado,
    services: { ...guardado.services, [v.patente]: [s, ...(guardado.services[v.patente] ?? [])] },
    cubiertas: r ? { ...guardado.cubiertas, [v.patente]: r.cubiertas } : guardado.cubiertas,
    stockUsadas: r ? [...r.usadas, ...guardado.stockUsadas] : guardado.stockUsadas,
    stockQuitadas: r ? [...guardado.stockQuitadas, ...r.quitadasDelStock] : guardado.stockQuitadas,
  };
  persistir();
  avisar();
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
  return nuevos || cubiertas || vacias
    ? { ...v, services: nuevos ? [...nuevos, ...v.services] : v.services, cubiertas: cubiertas ?? v.cubiertas, vacias: vacias ?? v.vacias }
    : v;
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

/**
 * De lo marcado en el paso de cubiertas, los cambios que hay que aplicar: las nuevas (con su modelo, código o
 * stock) y las rotaciones. `modeloActual` es el modelo que tenía la posición, para no pedirlo de nuevo.
 */
export function cambiosDeCubiertas(
  secciones: SeccionDeService[],
  marcas: Marcas,
  modeloActual: (numero: number) => string,
): CambioDeCubierta[] {
  const cambios: CambioDeCubierta[] = [];
  for (const sec of secciones) {
    for (const g of sec.grupos) {
      for (const it of g.items) {
        if (!it.conCodigo) continue;
        const m = marcas[claveDeItem(sec.nombre, it)];
        if (!m) continue;
        const numero = Number(it.sujeto.replace(/\D+/g, ""));
        if (!numero) continue;
        if (m.accion === "nuevo") {
          cambios.push({
            tipo: "nueva",
            numero,
            modeloId: m.modelo || modeloActual(numero),
            codigo: m.codigo,
            delStock: m.delStock || undefined,
            motivo: m.obs,
          });
        } else if (m.rotaA) {
          cambios.push({ tipo: "rotacion", numero, haciaNumero: Number(m.rotaA) });
        }
      }
    }
  }
  return cambios;
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

/** Lo que lleva cada tipo de service (de ejemplo), más un par de reparaciones sueltas. */
export function itemsDeService(v: Pick<Vehiculo, "patente" | "disposicion">, tipo: TipoService, orden: number, fijos?: ItemHecho[]): ItemHecho[] {
  const hechos: ItemHecho[] = [];
  const motor = v.disposicion !== undefined;
  if (motor) {
    hechos.push(item("Aceite y filtros", "", "Aceite de motor", "nuevo"), item("Aceite y filtros", "", "Filtro de aceite", "nuevo"));
    if (tipo === "B" || tipo === "C") {
      hechos.push(item("Aceite y filtros", "", "Filtro de combustible", "nuevo"), item("Aceite y filtros", "", "Filtro de aire", "nuevo"));
    }
  }
  const ruedas = v.disposicion ? posiciones(v.disposicion).length : 0;
  if (tipo === "C" && ruedas > 0) {
    for (let n = 1; n <= Math.min(ruedas, 6); n++) {
      hechos.push(item("Frenos y rodaje, por rueda", `Rueda ${n}`, "Zapatas / cintas", "revisado", "", `${(7 + AZAR(`${v.patente}${orden}${n}`) * 9).toFixed(1).replace(".", ",")} mm`));
    }
  }
  if (fijos) return [...hechos, ...fijos];

  // Una o dos reparaciones sueltas por service, para que la búsqueda tenga qué encontrar.
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
      item("Cubiertas", `Posición ${r}`, `Cubierta ${r}`, "nuevo", "Cambio por desgaste."),
    );
  }
  const a = pool[Math.floor(AZAR(`${v.patente}-a-${orden}`) * pool.length)];
  const b = pool[Math.floor(AZAR(`${v.patente}-b-${orden}`) * pool.length)];
  return [...hechos, a, ...(b !== a && AZAR(`${v.patente}-c-${orden}`) > 0.4 ? [b] : [])];
}
