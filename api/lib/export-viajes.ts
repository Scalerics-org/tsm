import { TRIP_STATUS, UNIDAD, type Trip, type TripTemplate } from "../../shared/domain";
import { columnasDe } from "./resumen-cliente";

/**
 * Las filas del Excel con el que la oficina factura.
 *
 * Vivía adentro del handler, así que el entregable del negocio no tenía —ni podía tener— un
 * solo test. Sale acá para poder fijar las tres reglas que importan: una fila por carga (no
 * por viaje), el viaje sin cargas igual aparece, y el combinado genérico usa el tramo del
 * renglón en vez del tramo del viaje.
 */

/** Un campo de plantilla como columna del Excel. */
export interface ColumnaCampo {
  key: string;
  label: string;
  /**
   * Si la columna es una cantidad (kilos, pallets) y no un identificador (remito, MIC, hoja
   * de ruta). Sólo las cantidades salen como número; un remito viaja como texto para que
   * "0012345" no llegue al Excel convertido en 12345.
   */
  totaliza: boolean;
}

/** Lo que va antes de los campos de la plantilla: el viaje y la carga. */
/**
 * La cantidad va en una columna POR UNIDAD.
 *
 * Antes eran dos columnas, "Cantidad" y "Unidad": arrastrar la columna Cantidad en el Excel
 * sumaba 792 pallets con 150.472 kilos y daba 151.264 de nada. Y esa misma columna va en el
 * resumen que se le manda al cliente, donde el cliente hace exactamente esa cuenta.
 *
 * Las unidades son las dos que existen (`UNIDAD`), más una tercera para la carga a la que
 * nadie le puso unidad: el número igual tiene que salir, pero aparte.
 */
/**
 * "Cantidad (kilos)" y no "Kilos de la carga": la columna "Kilos" de más abajo ya existe y es
 * OTRO hecho —`trips.kilos`, el peso del viaje, una vez por viaje y normalizado—. Dos títulos
 * casi iguales, los dos sumables y con números distintos, es la trampa que este archivo ya
 * había desarmado una vez ("un hecho, una columna").
 */
export const COLUMNA_CANTIDAD: Record<string, string> = {
  [UNIDAD.KILOS]: "Cantidad (kilos)",
  [UNIDAD.PALLETS]: "Cantidad (pallets)",
};
export const COLUMNA_CANTIDAD_SIN_UNIDAD = "Cantidad (sin unidad)";
const COLUMNAS_CANTIDAD = [...Object.values(COLUMNA_CANTIDAD), COLUMNA_CANTIDAD_SIN_UNIDAD];

export const COLUMNAS_ANTES = [
  "ID viaje",
  "Fecha",
  "Cliente",
  "Origen",
  "Destino",
  "Lugar de carga",
  "Clientes de la carga",
  ...COLUMNAS_CANTIDAD,
  "N° remito",
  "Se cobra a",
  "Tipo",
  "Kilos",
  "Km",
];

/**
 * La cantidad de la carga, en la celda de su unidad y vacía en las demás.
 *
 * La carga que tiene unidad pero no cantidad dice "sin cantidad" en la columna de su unidad.
 * Antes eso se veía solo —la columna "Unidad" mostraba "pallets" y la de al lado vacía— y era
 * la señal de "esta carga se mide en pallets y nadie puso el número"; hoy son 34 renglones. El
 * texto no rompe la suma: Excel ignora lo que no es número.
 */
function celdasDeCantidad(cantidad: number | null, unidad: string | null): Celda[] {
  const titulo = unidad ? (COLUMNA_CANTIDAD[unidad] ?? COLUMNA_CANTIDAD_SIN_UNIDAD) : COLUMNA_CANTIDAD_SIN_UNIDAD;
  return COLUMNAS_CANTIDAD.map((c) => {
    if (c !== titulo) return "";
    if (cantidad != null) return cantidad;
    return unidad ? "sin cantidad" : "";
  });
}

/** Y lo que va después: quién lo hizo y cómo terminó. */
export const COLUMNAS_DESPUES = ["Chofer", "Camión", "Estado", "Inicio", "Fin", "Observaciones"];

/**
 * Qué columnas de campos lleva esta exportación.
 *
 * "NO HAY CÓMO MEJORAR LOS ARCHIVOS Q EXPORTÁS? ES DECIR EN UN FORMATO MÁS ORDENADO QUE ME
 * QUEDE PARA GUARDAR MÁS PROLIJO." Todos los campos de plantilla iban apelmazados en una sola
 * celda ("remito: 113430 · boleta: 8842 · orden: 17"), así que no se podía ordenar, filtrar ni
 * sumar por ninguno. Ahora cada uno es una columna.
 *
 * Salen de las plantillas de los viajes exportados y no de TODAS: con las 26 plantillas el
 * Excel de un cliente se llenaría de columnas vacías de los otros.
 *
 * Un campo que quedó guardado en un viaje pero ya no está en su plantilla —la plantilla
 * cambió después— se agrega igual, con la key como título: en la celda apelmazada se veía, y
 * perderlo al pasar a columnas sería cambiar un formato feo por un dato menos.
 *
 * EL PESO NO. El campo marcado `is_weight` no lleva columna propia, y no es una omisión.
 * `trips.kilos` ya trae el peso normalizado a kilos por la migración 0039 —confirmado con el
 * cliente— y sale en la columna "Kilos". `field_values` guarda a propósito el texto crudo que
 * tipeó el chofer, que en producción viene en tres notaciones para el mismo peso:
 *
 *     viaje 27:  kilos 29539   campo "29.539"   <- el punto es separador de MILES
 *     viaje 31:  kilos 29000   campo "29"       <- son toneladas
 *     viaje 40:  kilos 29690   campo "29690"    <- kilos redondos
 *
 * Emitirlo como número daba 29,539 —el peso dividido por mil— en una columna que la oficina
 * suma para facturar; en el export de Casarone eran 401.177 kg contra los 489.479 de la
 * columna "Kilos" de la misma planilla. Y como `toneladas` y `ton_carga` llevan las dos la
 * etiqueta "Kilos de carga", salían además dos columnas con el título idéntico.
 *
 * Un hecho, una columna, y la que queda es la corregida.
 */
export function columnasDeCampos(trips: Trip[], templates: TripTemplate[]): ColumnaCampo[] {
  const usadas = new Set(trips.map((t) => t.template_id).filter((id): id is number => id != null));

  // Las keys de peso de TODAS las plantillas, no sólo de las exportadas: el mismo viaje puede
  // traer guardada la key de una plantilla que después cambió, y volvería por la rama de
  // abajo con la key como título. `columnasDe` no las filtra porque la comparte el Resumen
  // por cliente, donde el peso sí es una columna que se quiere.
  const pesos = new Set(
    templates.flatMap((t) => t.fields.filter((f) => f.is_weight).map((f) => f.key)),
  );

  const columnas: ColumnaCampo[] = columnasDe(templates.filter((t) => usadas.has(t.id))).filter(
    (c) => !pesos.has(c.key),
  );

  const vistas = new Set(columnas.map((c) => c.key));
  for (const t of trips) {
    for (const key of Object.keys(t.field_values ?? {})) {
      if (vistas.has(key) || pesos.has(key)) continue;
      vistas.add(key);
      // Sin plantilla que lo describa no se sabe si es una cantidad: va como texto, que es
      // lo que no rompe nada.
      columnas.push({ key, label: key, totaliza: false });
    }
  }
  return columnas;
}

export const encabezado = (campos: ColumnaCampo[]): string[] => [
  ...COLUMNAS_ANTES,
  ...campos.map((c) => c.label),
  ...COLUMNAS_DESPUES,
];

export type Celda = string | number | null;

/**
 * El valor de un campo, como número cuando la columna es una cantidad.
 *
 * Los `field_values` se guardan siempre como texto, así que los kilos llegaban al Excel como
 * "28.07": con el Excel en español eso entra como texto y la columna no se puede sumar. Sólo
 * se convierte lo que la plantilla dice que es cantidad, y sólo si de verdad es un número.
 */
function valorDeCampo(crudo: string | undefined, col: ColumnaCampo): Celda {
  const v = crudo ?? "";
  if (!col.totaliza || v.trim() === "") return v;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : v;
}

/**
 * Una fila por carga. Un viaje de tres paradas son tres renglones facturables y tres filas:
 * juntarlos en una perdería justo el detalle por el que se cobra.
 */
export function filasDeViaje(t: Trip, campos: ColumnaCampo[]): Celda[][] {
  const comunes: Celda[] = [t.id, t.started_at.slice(0, 10), t.provider_name];

  /**
   * La cola es la cabecera del viaje, y se pega a cada fila de carga. Lo que se SUMA va sólo
   * en la primera.
   *
   * Los kilómetros y los kilos son del viaje, no de cada carga: el chofer los carga una vez
   * al cerrar. Repetidos en las tres filas de un combinado, la columna que la oficina arrastra
   * cuenta el mismo viaje tres veces — sobre los datos reales, la columna "Km" sumaba 42.902
   * contra 34.089, un 25,8% de más.
   *
   * Lo que no se suma sí se repite: chofer, camión, estado y los identificadores de plantilla
   * sirven para leer una fila suelta y para cruzar contra una factura, y repetirlos no
   * distorsiona ningún total. El "ID viaje" es lo que vuelve a atar las filas.
   */
  const cabecera = (primera: boolean): Celda[] => [
    primera ? (t.kilos_carga ?? "") : "",
    primera ? (t.kilometros ?? "") : "",
    ...campos.map((c) => {
      if (c.totaliza && !primera) return "";
      return valorDeCampo(t.field_values?.[c.key], c);
    }),
    t.driver_name ?? "",
    t.truck_plate ?? "",
    t.status,
    t.started_at,
    t.finished_at ?? "",
    t.notes ?? "",
  ];
  const cola = cabecera(true);

  // Sin cargas el viaje igual va: existió, tiene chofer y kilómetros, y esconderlo del Excel
  // sería esconder trabajo hecho.
  if (!t.segments.length) {
    return [
      [
        ...comunes,
        t.origin,
        t.destination,
        t.remite ?? "",
        t.destinatario ?? "",
        ...COLUMNAS_CANTIDAD.map(() => "" as Celda),
        "",
        "",
        "",
        ...cola,
      ],
    ];
  }

  return t.segments.map((s, i) => [
    ...comunes,
    // En el combinado genérico cada carga tiene su propio tramo; en los demás hereda el del viaje.
    s.origen ?? t.origin,
    s.destino ?? t.destination,
    s.remitente,
    s.clientes.join(" / "),
    ...celdasDeCantidad(s.cantidad, s.unidad),
    s.remito ?? "",
    s.cobro_a ?? "",
    s.cobro_tipo ?? "",
    ...(i === 0 ? cola : cabecera(false)),
  ]);
}

/** Lo que siempre va en el resumen para el cliente: cuándo, adónde y para quién. */
export const COLUMNAS_CLIENTE = ["Fecha", "Destino", "Clientes de la carga"];

/**
 * Lo que va sólo si en el período alguien lo llenó: los números con los que el cliente cruza
 * contra sus propios papeles. A esto se le suman los campos propios de sus plantillas.
 */
export const COLUMNAS_CLIENTE_SI_HAY_DATO = [...COLUMNAS_CANTIDAD, "N° remito", "Kilos"];

/**
 * El resumen para mandarle al cliente.
 *
 * "Le eliminé un montón de celdas y lo dejé con lo que realmente me interesa. Cuando exporte
 * un resumen del molino me interesaría esos datos nomás." La planilla que armó a mano era
 * nuestro Excel con 5 de sus 20 columnas: fecha, destino y clientes de la carga, más los dos
 * campos propios de la plantilla de Cañuelas. La regla sirve para cualquier cliente —lo
 * básico más lo propio de su viaje—, así que un cliente nuevo sale con sus columnas sin que
 * nadie configure nada.
 *
 * NO ES OTRA EXPORTACIÓN: son las mismas filas del Excel completo (`filasDeViaje`) con las
 * columnas elegidas. Un valor no puede decir una cosa acá y otra en el Excel de la oficina,
 * porque hay una sola cuenta: el peso sale corregido, una fila por carga, lo que se suma va
 * en la primera fila del viaje.
 *
 * LO QUE NO VA, A PROPÓSITO. "Se cobra a" y "Tipo" son las reglas de cobro de la oficina, y
 * esto es un papel que se le manda al cliente. Chofer, camión, km, estado, horarios y
 * observaciones son cómo trabaja la empresa por dentro. Tampoco los viajes cancelados: no se
 * entregó nada.
 *
 * Una columna opcional que nadie llenó en todo el período no aparece. Justamente de eso se
 * quejaba: columnas vacías que había que borrar a mano.
 */
export function resumenParaElCliente(trips: Trip[], campos: ColumnaCampo[]): Celda[][] {
  const titulos = encabezado(campos);
  const filas = trips
    .filter((t) => t.status !== TRIP_STATUS.CANCELADO)
    .flatMap((t) => filasDeViaje(t, campos));

  const opcionales = new Set([...COLUMNAS_CLIENTE_SI_HAY_DATO, ...campos.map((c) => c.label)]);
  const tieneDato = (i: number) => filas.some((f) => f[i] != null && f[i] !== "");
  const elegidas = titulos
    .map((titulo, i) => ({ titulo, i }))
    .filter(({ titulo, i }) => COLUMNAS_CLIENTE.includes(titulo) || (opcionales.has(titulo) && tieneDato(i)))
    .map(({ i }) => i);

  return [elegidas.map((i) => titulos[i]), ...filas.map((f) => elegidas.map((i) => f[i]))];
}

/**
 * La planilla para facturar: lo que Rodrigo dejaba a mano.
 *
 * Con la 6029 (19/9/2026) bajó el Excel completo y le borró columnas hasta quedarse con Fecha ·
 * Cliente · Clientes de la carga · Kilos · Nro Fac. · Remito de carga · Chofer · Camión ·
 * Estado · Observaciones, con el total de kilos abajo. Ésta sale así de una; el completo sigue
 * estando para controlar.
 *
 * UNA FILA POR VIAJE y no por carga, como la suya: se factura el viaje. Los clientes de las
 * cargas van juntos en la misma celda. En el lugar del remito van los campos propios de la
 * plantilla (menos el peso, que es "Kilos"): en Casarone es "Remito de carga", en otros es
 * "Remito empresa" o el N° de MIC.
 */
export const ENCABEZADO_FACTURAR = [
  "Fecha",
  "Cliente",
  "Clientes de la carga",
  "Kilos",
  "Nro Fac.",
  "Chofer",
  "Camión",
  "Estado",
  "Observaciones",
];

export function planillaParaFacturar(
  trips: (Trip & { factura_numero?: string | null })[],
  campos: ColumnaCampo[],
): Celda[][] {
  const encabezado = [...ENCABEZADO_FACTURAR.slice(0, 5), ...campos.map((c) => c.label), ...ENCABEZADO_FACTURAR.slice(5)];
  const filas: Celda[][] = trips.map((t) => {
    const clientes = [...new Set(t.segments.flatMap((s) => s.clientes))];
    return [
      t.started_at.slice(0, 10),
      t.provider_name,
      clientes.join(" / ") || (t.destinatario ?? ""),
      t.kilos_carga ?? "",
      t.factura_numero ?? "",
      ...campos.map((c) => valorDeCampo(t.field_values?.[c.key], c)),
      t.driver_name ?? "",
      t.truck_plate ?? "",
      t.status,
      t.notes ?? "",
    ];
  });
  const kilos = trips.reduce((s, t) => s + (t.kilos_carga ?? 0), 0);
  const total: Celda[] = ["", "", "Total", kilos, ...Array(encabezado.length - 4).fill("")];
  return [encabezado, ...filas, total];
}
