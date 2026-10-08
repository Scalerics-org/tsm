/**
 * El alta, la validación y la edición de las cubiertas del stock. Una compra puede traer varias iguales, cada una con su código
 * (opcional). Es una cuenta pura: la pantalla le pasa lo que escribieron y guarda lo que devuelve.
 */
import { MODELOS } from "./base";
import type { CubiertaEnStock } from "./datos-extra";

export interface DatosDeCompraDeCubiertas {
  modeloId: string;
  estado: "nueva" | "usada";
  fecha: string;
  proveedor: string;
  obs: string;
}

const MAXIMO_POR_COMPRA = 30;

/** Una cubierta por cada código (uno vacío si no tiene): todas de la misma compra. */
export function altaDeCubiertas(datos: DatosDeCompraDeCubiertas, codigos: string[], nuevoUid: () => string): CubiertaEnStock[] {
  const proveedor = datos.proveedor.trim();
  return codigos.map((codigo) => ({
    uid: nuevoUid(),
    codigo: codigo.trim(),
    modeloId: datos.modeloId,
    estado: datos.estado,
    obs: datos.obs.trim(),
    desde: datos.fecha,
    ...(proveedor ? { proveedor } : {}),
  }));
}

/** Lo que hay que corregir antes de dar de alta la compra. `existentes` son los códigos que ya están en el stock. */
export function erroresDeCubiertas(datos: DatosDeCompraDeCubiertas, codigos: string[], existentes: string[]): string[] {
  const errores: string[] = [];
  if (!MODELOS[datos.modeloId]) errores.push("Elegí el modelo.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datos.fecha)) errores.push("Falta la fecha.");
  if (codigos.length < 1) errores.push("Tiene que ser al menos una cubierta.");
  if (codigos.length > MAXIMO_POR_COMPRA) errores.push(`Como mucho ${MAXIMO_POR_COMPRA} cubiertas por compra.`);

  const vistos = new Map<string, string>();
  const ocupados = new Set(existentes.map((c) => c.trim().toUpperCase()).filter(Boolean));
  for (const codigo of codigos.map((c) => c.trim()).filter(Boolean)) {
    const clave = codigo.toUpperCase();
    if (vistos.has(clave)) errores.push(`El código ${vistos.get(clave)} está repetido.`);
    else if (ocupados.has(clave)) errores.push(`Ya hay una cubierta con el código ${codigo}.`);
    else vistos.set(clave, codigo);
  }
  return errores;
}

/** Cambia los datos de una cubierta del stock. El uid no cambia: así el recorrido sigue a la misma cubierta. */
export function editarCubiertaStock(
  c: CubiertaEnStock,
  cambios: Partial<Pick<CubiertaEnStock, "codigo" | "modeloId" | "estado" | "desde" | "proveedor" | "obs">>,
): CubiertaEnStock {
  return { ...c, ...cambios, codigo: (cambios.codigo ?? c.codigo).trim(), obs: (cambios.obs ?? c.obs).trim() };
}
