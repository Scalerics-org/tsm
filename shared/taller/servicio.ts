import type { CambioDeCubierta } from "./cambio-cubiertas";
import { numeroDeCantidad, type ConsumoDeStock, type ItemDeStock } from "./stock-consumibles";
import { FILTRO_DEL_STOCK, PIEZA, SECCION, flujoDeCubiertas, itemsDeLosTipos } from "./tipos-de-service";
import { posiciones } from "./disposicion";
import { MODELOS } from "./modelos";
import { PIEZAS_DE_RUEDA } from "./piezas-de-rueda";
import type { AccionHecha, ItemHecho, Service, TipoService, Vehiculo } from "./tipos";

/**
 * Lo puro del "Nuevo service": qué se puede marcar (el catálogo, por sección), cómo se busca una pieza en el historial,
 * qué sale del depósito y qué cambios de cubiertas hay que aplicar según lo marcado. Sin pantalla ni almacenamiento: el
 * store de la maqueta, los hooks y los datos de ejemplo se quedan en src/features/taller/servicio.ts.
 */

// ── El catálogo de lo que se puede marcar ──
export interface ItemCatalogo {
  sujeto: string;
  pieza: string;
  /** Si lleva una medida (mm de las zapatas, del tambor). */
  medida?: { unidad: string; ayuda: string };
  /** Si al ponerla nueva se pide el código (opcional) de la cubierta. */
  conCodigo?: boolean;
  /** Con qué acción se marca por defecto ("nuevo" para un filtro que se cambió, "hecho" para una regulación). */
  accionPorDefecto?: AccionHecha;
  /** Las únicas acciones que tiene sentido elegir (una regulación de válvulas se "hace"; no se repara ni se cambia). */
  acciones?: AccionHecha[];
  /** El filtro del Stock que suele salir para este ítem (sólo una sugerencia: ver `FILTRO_DEL_STOCK`). */
  filtroDelStock?: string;
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
    // Los filtros y los líquidos de los tipos de service (A, B, C, BC, D) caen en estas dos secciones.
    const cambio = (pieza: string): ItemCatalogo => ({ sujeto: "", pieza, accionPorDefecto: "nuevo", filtroDelStock: FILTRO_DEL_STOCK[pieza] });
    secciones.push({
      id: "filtros",
      nombre: SECCION.filtros,
      grupos: [
        {
          titulo: "",
          items: [
            PIEZA.filtroAceite,
            PIEZA.centrifugo,
            PIEZA.trampaGasoil,
            PIEZA.cartuchoGasoil,
            PIEZA.filtroAire,
            PIEZA.filtroCabina,
            PIEZA.filtroCaja,
            PIEZA.filtroDiferencial,
            PIEZA.filtroAps,
            PIEZA.filtroHidraulico,
          ].map(cambio),
        },
      ],
    });
    secciones.push({
      id: "liquidos",
      nombre: SECCION.liquidos,
      grupos: [{ titulo: "", items: [PIEZA.aceiteMotor, PIEZA.liquidoCajaDiferencial, PIEZA.aguaMotor].map(cambio) }],
    });
  }
  for (const id of ["motor", "caja", "diferencial"]) {
    const c = componente(id);
    if (!c) continue;
    const piezas = soloPiezas(c.piezas.map((p) => p.nombre));
    // La regulación de válvulas (tipo V) es del motor: se "hace", no se repara ni se cambia.
    if (id === "motor") piezas.items.push({ sujeto: "", pieza: PIEZA.valvulas, accionPorDefecto: "hecho", acciones: ["hecho"] });
    secciones.push({ id, nombre: c.nombre, grupos: [piezas] });
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
  /** Se la balanceó (tipos RB y NB): queda anotado en su historial, con la fecha. */
  balanceada: boolean;
  /** Filtro o líquido: de qué ítem del stock sale (vacío = no se descuenta nada) y cuánto. */
  desdeStock: string;
  cantidadStock: string;
}
export type Marcas = Record<string, Marca>;

export const marcaNueva = (parcial: Partial<Marca> = {}): Marca => ({
  accion: "revisado",
  medida: "",
  obs: "",
  codigo: "",
  modelo: "",
  delStock: "",
  rotaA: "",
  balanceada: false,
  desdeStock: "",
  cantidadStock: "",
  ...parcial,
});

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
        // El balanceo es un ítem aparte: así se busca ("balanceo") y se ve en el service.
        if (it.conCodigo && m.balanceada) {
          const n = it.sujeto.replace(/\D+/g, "");
          hechos.push({ seccion: s.nombre, sujeto: it.sujeto, pieza: `Balanceo de la cubierta ${n}`, accion: "hecho", obs: "" });
        }
      }
    }
  }
  return hechos;
}

/** Cuántos ítems marcados tiene cada sección (para el contador de cada una). */
export const marcadosEn = (s: SeccionDeService, marcas: Marcas) =>
  s.grupos.reduce((n, g) => n + g.items.filter((it) => marcas[claveDeItem(s.nombre, it)]).length, 0);

/**
 * Lo marcado según los tipos elegidos. Cada tipo trae sus ítems (los filtros y líquidos): si dos tipos comparten uno, va
 * una sola vez. Cambiar los tipos suma lo de los que se agregan y saca lo de los que se sacan (salvo lo que otro tipo
 * también trae); lo que se marcó a mano no se toca.
 */
export function marcasSegunTipos(secciones: SeccionDeService[], antes: TipoService[], ahora: TipoService[], marcas: Marcas): Marcas {
  const hay = new Set(secciones.flatMap((sec) => sec.grupos.flatMap((g) => g.items.map((it) => claveDeItem(sec.nombre, it)))));
  const clave = (i: { seccion: string; pieza: string }) => `${i.seccion}||${i.pieza}`;
  const deAhora = itemsDeLosTipos(ahora);
  const siguen = new Set(deAhora.map(clave));
  const resultado: Marcas = { ...marcas };
  for (const i of itemsDeLosTipos(antes)) if (!siguen.has(clave(i))) delete resultado[clave(i)];
  for (const i of deAhora) if (hay.has(clave(i)) && !resultado[clave(i)]) resultado[clave(i)] = marcaNueva({ accion: i.accion });
  return resultado;
}

/** Cómo se marca una cubierta nueva en la sección de cubiertas según los tipos: rotación, cubierta nueva y balanceo. */
export function marcaDeCubierta(tipos: TipoService[]): Marca {
  const f = flujoDeCubiertas(tipos);
  return marcaNueva({ accion: f.nueva && !f.rotacion ? "nuevo" : "revisado", balanceada: f.balanceo });
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

/** Qué sale del depósito según lo marcado en el service: los filtros y líquidos con un ítem del stock elegido. */
export function consumosDeMarcas(secciones: SeccionDeService[], marcas: Marcas, aceites: ItemDeStock[], filtros: ItemDeStock[]): ConsumoDeStock[] {
  const consumos: ConsumoDeStock[] = [];
  for (const sec of secciones) {
    for (const g of sec.grupos) {
      for (const it of g.items) {
        const m = marcas[claveDeItem(sec.nombre, it)];
        if (!m?.desdeStock) continue;
        const cantidad = numeroDeCantidad(m.cantidadStock) || 1;
        if (filtros.some((f) => f.id === m.desdeStock)) consumos.push({ de: "filtro", itemId: m.desdeStock, cantidad, pieza: it.pieza });
        else if (aceites.some((a) => a.id === m.desdeStock)) consumos.push({ de: "aceite", itemId: m.desdeStock, cantidad, pieza: it.pieza });
      }
    }
  }
  return consumos;
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
            balanceada: m.balanceada,
          });
        } else if (m.rotaA) {
          cambios.push({ tipo: "rotacion", numero, haciaNumero: Number(m.rotaA), balanceada: m.balanceada });
        } else if (m.balanceada) {
          cambios.push({ tipo: "balanceo", numero });
        }
      }
    }
  }
  return cambios;
}
