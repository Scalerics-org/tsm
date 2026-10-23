/**
 * La cuenta del stock de aceites y filtros. Cada ítem (un tipo de aceite, un modelo de filtro) tiene sus movimientos: las
 * compras suman y los usos (un service que sacó del depósito) restan. La existencia es la suma de todo, así no hay un número
 * que se pueda desincronizar de la historia. Son funciones puras: no tocan el estado ni el navegador.
 */

export type UnidadDeStock = "L" | "u";

export interface UsoDeStock {
  patente: string;
  /** El id del service donde se usó. */
  servicio: string;
  /** La pieza del service que lo pidió ("Filtro de aceite de motor", "Aceite de motor"). */
  pieza: string;
}

export interface MovimientoDeStock {
  id: string;
  fecha: string;
  /** Positivo si es una compra, negativo si es un uso. */
  cantidad: number;
  obs: string;
  uso?: UsoDeStock;
}

export interface ItemDeStock {
  id: string;
  /** Aceite: el tipo ("Aceite de motor"). Filtro: el modelo ("LF3000"). */
  nombre: string;
  /** Sólo filtros: qué hace ("aceite de motor", "aire"…). Los aceites lo dejan vacío. */
  tipo: string;
  unidad: UnidadDeStock;
  movimientos: MovimientoDeStock[];
}

/** Lo que un service saca del stock: qué ítem y cuánto. `de` dice en qué lista está. */
export interface ConsumoDeStock {
  de: "aceite" | "filtro";
  itemId: string;
  cantidad: number;
  pieza: string;
}

export interface FaltanteDeStock {
  itemId: string;
  nombre: string;
  disponible: number;
  pedido: number;
}

export interface CompraNueva {
  id: string;
  fecha: string;
  cantidad: number;
  obs: string;
}

/** Los tipos de filtro que se manejan. Un filtro de un modelo sólo tiene uno de estos. */
export const TIPOS_DE_FILTRO = [
  "aceite de motor",
  "combustible",
  "aire",
  "cabina",
  "caja",
  "diferencial",
  "APS",
  "hidráulico",
  "trampa de gasoil",
  "cartucho de gasoil",
];

const redondear = (n: number) => Math.round(n * 100) / 100;

export const existencia = (item: ItemDeStock): number => redondear(item.movimientos.reduce((suma, m) => suma + m.cantidad, 0));

/** Lo que se escribió en un campo de cantidad: acepta coma decimal. Lo que no es un número cuenta como cero. */
export function numeroDeCantidad(texto: string): number {
  const n = Number(texto.trim().replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

const conItem = (items: ItemDeStock[], itemId: string, cambio: (item: ItemDeStock) => ItemDeStock): ItemDeStock[] =>
  items.map((item) => (item.id === itemId ? cambio(item) : item));

const compraComoMovimiento = (c: CompraNueva): MovimientoDeStock => ({ id: c.id, fecha: c.fecha, cantidad: c.cantidad, obs: c.obs.trim() });

/** Una compra más de un ítem que ya existe: suma a la existencia. */
export function comprar(items: ItemDeStock[], itemId: string, compra: CompraNueva): ItemDeStock[] {
  return conItem(items, itemId, (item) => ({ ...item, movimientos: [...item.movimientos, compraComoMovimiento(compra)] }));
}

/** Un ítem nuevo (un tipo de aceite o un modelo de filtro), con la compra con la que entró al depósito. */
export function agregarItem(
  items: ItemDeStock[],
  nuevo: { id: string; nombre: string; tipo: string; unidad: UnidadDeStock; compra: CompraNueva },
): ItemDeStock[] {
  const item: ItemDeStock = {
    id: nuevo.id,
    nombre: nuevo.nombre.trim(),
    tipo: nuevo.tipo.trim(),
    unidad: nuevo.unidad,
    movimientos: [compraComoMovimiento(nuevo.compra)],
  };
  return [...items, item];
}

/** Cambia el nombre y el tipo; los movimientos quedan como están. */
export function editarItem(items: ItemDeStock[], itemId: string, cambios: { nombre: string; tipo: string }): ItemDeStock[] {
  return conItem(items, itemId, (item) => ({ ...item, nombre: cambios.nombre.trim(), tipo: cambios.tipo.trim() }));
}

export function eliminarItem(items: ItemDeStock[], itemId: string): ItemDeStock[] {
  return items.filter((item) => item.id !== itemId);
}

/**
 * Lo que sacó un service: un uso por cada consumo, con el service, el vehículo, la fecha y la pieza. Puede dejar el stock en
 * negativo: es a propósito, porque pueden haberlo comprado sin cargarlo, y se ve en rojo.
 */
export function descontar(
  items: ItemDeStock[],
  consumos: ConsumoDeStock[],
  uso: { patente: string; servicio: string; fecha: string },
  nuevoId: () => string,
): ItemDeStock[] {
  return consumos.reduce(
    (actual, c) =>
      conItem(actual, c.itemId, (item) => ({
        ...item,
        movimientos: [
          ...item.movimientos,
          { id: nuevoId(), fecha: uso.fecha, cantidad: -c.cantidad, obs: "", uso: { patente: uso.patente, servicio: uso.servicio, pieza: c.pieza } },
        ],
      })),
    items,
  );
}

/** Los ítems a los que el service les pide más de lo que hay. Sólo avisa: el service se guarda igual. */
export function faltantes(items: ItemDeStock[], consumos: ConsumoDeStock[]): FaltanteDeStock[] {
  const resultado: FaltanteDeStock[] = [];
  for (const item of items) {
    const pedido = redondear(consumos.filter((c) => c.itemId === item.id).reduce((suma, c) => suma + c.cantidad, 0));
    const disponible = existencia(item);
    if (pedido > 0 && pedido > disponible) resultado.push({ itemId: item.id, nombre: item.nombre, disponible, pedido });
  }
  return resultado;
}

/** Lo que hay que validar antes de dar de alta o editar un aceite o un filtro. `idActual` es el ítem que se edita. */
export function erroresDeItem(
  de: "aceite" | "filtro",
  datos: { nombre: string; tipo: string },
  items: ItemDeStock[],
  idActual?: string,
): string[] {
  const errores: string[] = [];
  const nombre = datos.nombre.trim();
  const otros = items.filter((i) => i.id !== idActual);
  if (de === "filtro") {
    if (!nombre) errores.push("Falta el modelo.");
    else if (otros.some((i) => i.nombre.toLowerCase() === nombre.toLowerCase())) errores.push(`Ya hay un filtro ${nombre}.`);
    if (!datos.tipo.trim()) errores.push("Falta el tipo de filtro.");
  } else {
    if (!nombre) errores.push("Falta el tipo.");
    else if (otros.some((i) => i.nombre.toLowerCase() === nombre.toLowerCase())) errores.push("Ya hay un aceite de ese tipo.");
  }
  return errores;
}

export function erroresDeCompra(c: { fecha: string; cantidad: number }, unidad: UnidadDeStock = "L"): string[] {
  const errores: string[] = [];
  if (!c.fecha) errores.push("Falta la fecha.");
  if (!(c.cantidad > 0)) errores.push("La cantidad tiene que ser mayor que cero.");
  else if (unidad === "u" && !Number.isInteger(c.cantidad)) errores.push("Los filtros se cuentan en unidades enteras.");
  return errores;
}

/** Un id nuevo para un ítem o un movimiento del stock, que no choca con los de ejemplo. */
export const nuevoIdDeStock = (prefijo: string) => `${prefijo}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Los datos guardados de una versión vieja o rota no pueden romper la pantalla: sólo entra lo que tiene la forma. */
export function esItemDeStock(x: unknown): x is ItemDeStock {
  if (!x || typeof x !== "object") return false;
  const i = x as Partial<ItemDeStock>;
  return (
    typeof i.id === "string" &&
    typeof i.nombre === "string" &&
    typeof i.tipo === "string" &&
    (i.unidad === "L" || i.unidad === "u") &&
    Array.isArray(i.movimientos) &&
    i.movimientos.every((m) => m && typeof m.id === "string" && typeof m.fecha === "string" && typeof m.cantidad === "number")
  );
}
