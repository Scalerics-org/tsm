import type { CubiertaEnStock } from "./datos-extra";
import { uidDeCubierta, uidDeStock } from "./movimientos";
import { kmEnTramos, type Cubierta, type PuestaAnterior, type Service } from "./tipos";

/**
 * Lo que un service hace con las cubiertas, como cuentas puras (sin pantalla ni almacenamiento):
 *  - una cubierta NUEVA en la posición N reemplaza a la que estaba: la vieja pasa al historial de esa posición y al
 *    stock como usada; si la nueva salió del stock, se descuenta de ahí;
 *  - una ROTACIÓN intercambia las cubiertas de dos posiciones.
 */

export type CambioDeCubierta =
  | {
      tipo: "nueva";
      numero: number;
      /** Si es de una cubierta cargada a mano, su modelo; si salió del stock, el del stock. */
      modeloId: string;
      /** Código libre y opcional. */
      codigo?: string;
      /** El código de la cubierta del stock que se usó, si se eligió una. */
      delStock?: string;
      /** Por qué salió la anterior: lo que escribió Raúl, o "Cambio en service". */
      motivo?: string;
      /** Se la balanceó al colocarla (NB). */
      balanceada?: boolean;
    }
  | { tipo: "rotacion"; numero: number; haciaNumero: number; balanceada?: boolean }
  /** Balancear la cubierta que está en esa posición, sin moverla ni cambiarla. */
  | { tipo: "balanceo"; numero: number };

export interface ResultadoDeCambios {
  cubiertas: Cubierta[];
  /** Las que salieron de un vehículo y entran al stock como usadas. */
  usadas: CubiertaEnStock[];
  /** Códigos del stock de nuevas que se usaron y hay que descontar. */
  quitadasDelStock: string[];
}

const dd_mm = (dia: string) => {
  const [, m, d] = dia.split("-");
  return `${d}/${m}`;
};

export function aplicarCambios(
  v: { patente: string; cubiertas: Cubierta[] },
  service: Pick<Service, "fecha" | "km">,
  cambios: CambioDeCubierta[],
  stock: CubiertaEnStock[],
  nuevoUid: () => string = () => `c-${Math.random().toString(36).slice(2, 10)}`,
): ResultadoDeCambios {
  let cubiertas = v.cubiertas.map((c) => ({ ...c }));
  const usadas: CubiertaEnStock[] = [];
  const quitadas: string[] = [];
  const yaRotadas = new Set<number>();
  const balancear = (c: Cubierta) => ({ ...c, balanceos: [...(c.balanceos ?? []), { fecha: service.fecha, km: service.km }] });

  // Primero los balanceos sueltos, sobre las cubiertas donde están hoy; después las nuevas y las rotaciones.
  const ordenados = [...cambios].sort((a, b) => Number(b.tipo === "balanceo") - Number(a.tipo === "balanceo"));
  for (const cambio of ordenados) {
    if (cambio.tipo === "balanceo") {
      cubiertas = cubiertas.map((x) => (x.numero === cambio.numero ? balancear(x) : x));
      continue;
    }
    if (cambio.tipo === "nueva") {
      const vieja = cubiertas.find((c) => c.numero === cambio.numero);
      const delStock = cambio.delStock ? stock.find((s) => s.codigo === cambio.delStock && s.estado === "nueva") : undefined;
      const modeloId = delStock?.modeloId ?? cambio.modeloId;
      const codigo = (delStock?.codigo ?? cambio.codigo ?? "").trim() || undefined;

      const anteriores: PuestaAnterior[] = [];
      if (vieja) {
        const recorridos = Math.max(0, Math.round(service.km - vieja.kmInicial)) + kmEnTramos(vieja.historial);
        anteriores.push({
          codigo: vieja.codigo ?? "Sin código",
          modeloId: vieja.modeloId,
          desde: vieja.fecha,
          hasta: service.fecha,
          kmRecorridos: recorridos,
          motivo: cambio.motivo?.trim() || "Cambio en service",
        });
        anteriores.push(...vieja.anteriores);
        usadas.push({
          uid: uidDeCubierta(v.patente, vieja),
          codigo: vieja.codigo ?? "",
          modeloId: vieja.modeloId,
          estado: "usada",
          obs: `Salió de ${v.patente} posición ${cambio.numero} el ${dd_mm(service.fecha)} · con ${recorridos.toLocaleString("es-UY")} km`,
          balanceos: vieja.balanceos,
          desde: service.fecha,
          historial: [
            ...(vieja.historial ?? []),
            { tipo: "vehiculo", patente: v.patente, posicion: vieja.numero, desde: vieja.fecha, kmDesde: vieja.kmInicial, hasta: service.fecha, kmHasta: service.km },
          ],
        });
      }
      const nueva: Cubierta = {
        uid: delStock ? uidDeStock(delStock) : nuevoUid(),
        historial: delStock ? [...(delStock.historial ?? []), { tipo: "stock", desde: delStock.desde, hasta: service.fecha }] : [],
        numero: cambio.numero,
        codigo,
        modeloId,
        fecha: service.fecha,
        kmInicial: service.km,
        obs: "",
        anteriores,
        balanceos: cambio.balanceada ? [{ fecha: service.fecha, km: service.km }] : undefined,
      };
      cubiertas = [...cubiertas.filter((c) => c.numero !== cambio.numero), nueva];
      if (delStock) quitadas.push(uidDeStock(delStock));
    } else {
      if (yaRotadas.has(cambio.numero) || yaRotadas.has(cambio.haciaNumero) || cambio.numero === cambio.haciaNumero) continue;
      yaRotadas.add(cambio.numero);
      yaRotadas.add(cambio.haciaNumero);
      // El balanceo se le anota a la cubierta que se rota (la que está en `numero`), antes de moverla.
      if (cambio.balanceada) cubiertas = cubiertas.map((x) => (x.numero === cambio.numero ? balancear(x) : x));
      cubiertas = cubiertas.map((c) =>
        c.numero === cambio.numero ? { ...c, numero: cambio.haciaNumero } : c.numero === cambio.haciaNumero ? { ...c, numero: cambio.numero } : c,
      );
    }
  }
  return { cubiertas: cubiertas.sort((a, b) => a.numero - b.numero), usadas, quitadasDelStock: quitadas };
}
