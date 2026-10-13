import type { Truck } from "@shared/domain";
import { HOY } from "./base";
import { componentesSinHistoria } from "./datos-extra";
import { tipoDeVehiculo, type Disposicion } from "./disposicion";
import type { TipoVehiculo, Vehiculo } from "./tipos";

/**
 * Los camiones y acoplados de la base, vistos como vehículos del Taller.
 *
 * Rodrigo carga la flota en Camiones con un "Tipo" de texto libre ("TRACTOR DOBLE EJE", "03-SEMIREMOLQUE 2 EJES",
 * "099- EMIREMOLQUE-S48 FURGON"…). Acá se traduce a uno de los tipos con dibujo del Taller. Cuando el texto no
 * alcanza para decidir, se elige el más probable y se AVISA en pantalla (`aConfirmar`) en vez de callarse.
 */

const normalizar = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** El id del tipo del Taller para un texto de "Tipo", y si hubo que suponer algo. */
export function tipoDesdeTexto(texto: string): { id: string; supuesto?: string } {
  const t = normalizar(texto);
  const ejes = t.match(/\b([23])\s*eje/)?.[1];
  const esDoble = ejes === "3" || /doble/.test(t);

  if (/acoplado|sorra|acopl/.test(t)) return { id: esDoble ? "sorra-doble" : "sorra-sencilla" };

  // "semiremolque", "semirremolque" y "emiremolque" (sin la S, como lo escribió Rodrigo en una patente) son semirremolques.
  if (/(semi|emi)r?\s?remolque/.test(t)) {
    if (ejes === "2") return { id: "remolque-2" };
    if (ejes === "3") return { id: "remolque-3" };
    return { id: "remolque-3", supuesto: "El tipo no dice cuántos ejes tiene: se asumieron tres." };
  }

  // "remolque" a secas, sin "semi": es un acoplado (sorra), no un semirremolque.
  if (/remolque/.test(t)) {
    return { id: esDoble ? "sorra-doble" : "sorra-sencilla", supuesto: "«remolque» sin «semi» se tomó como sorra. A confirmar con Rodrigo." };
  }

  if (/tractor/.test(t)) return { id: /sencillo/.test(t) ? "tractor-sencillo" : "tractor" };
  // "CAMION SENCILLO" (N2 y N99 en la flota): un solo eje trasero y, en la flota, casi todos chicos.
  if (/camion/.test(t) && /sencillo/.test(t)) {
    return { id: "camion-chico", supuesto: "Se asumió camión chico (service cada 15.000 km). A confirmar con Rodrigo." };
  }
  if (/chico|liviano/.test(t)) return { id: "camion-chico" };
  if (/camion|doble eje|rigido/.test(t)) return { id: "doble-eje" };

  return { id: "tractor", supuesto: `No se reconoció el tipo «${texto.trim() || "vacío"}»: se asumió camión tractor.` };
}

/** La disposición para un texto de "Tipo". Si hubo que suponer algo queda en `aConfirmar`, que la ficha muestra. */
export function disposicionDesdeTexto(texto: string, clase?: Truck["clase"]): Disposicion {
  let { id, supuesto } = tipoDesdeTexto(texto);
  // La clase la eligió la oficina: si dice remolque y el texto no lo dice (p. ej. "Furgón"), no se dibuja un tractor.
  if (clase === "remolque" && !/^(remolque|sorra)/.test(id)) {
    id = "remolque-3";
    supuesto = `«${texto.trim() || "vacío"}» no dice qué remolque es: se asumió un semirremolque de tres ejes.`;
  }
  const base = tipoDeVehiculo(id);
  return supuesto ? { ...base, aConfirmar: supuesto } : base;
}

const TIPO_DE_CARROCERIA: Record<Disposicion["carroceria"], TipoVehiculo> = {
  rigido: "camion",
  tractor: "camion",
  semirremolque: "semirremolque",
  acoplado: "acoplado",
};

const descripcionDe = (c: Pick<Truck, "brand" | "model" | "year">) => {
  const nombre = [c.brand, c.model].map((s) => (s ?? "").trim()).filter(Boolean).join(" ");
  return [nombre, c.year ? String(c.year) : ""].filter(Boolean).join(" · ");
};

/**
 * Un camión (o acoplado) de la base como vehículo del Taller.
 *
 * Lo que la base no tiene —cubiertas, services— arranca vacío: se carga desde el Taller. `kmPorDia` queda en 0
 * ("no se sabe") y las pantallas no estiman fechas con eso. `choferAsignado` es el nombre, si se sabe.
 */
export function vehiculoDeCamion(camion: Truck, choferAsignado = ""): Vehiculo {
  const disposicion = disposicionDesdeTexto(camion.type ?? "", camion.clase);
  const tipo = TIPO_DE_CARROCERIA[disposicion.carroceria];
  return {
    patente: camion.plate,
    tipo,
    descripcion: descripcionDe(camion),
    disposicion,
    lectura: camion.odometer_at ? camion.odometer_at.slice(0, 10) : HOY,
    choferAsignado,
    unidad: "km",
    km: camion.odometer_km ?? 0,
    cadaService: disposicion.intervaloServiceKm,
    kmPorDia: 0,
    cubiertas: [],
    services: [],
    componentes: componentesSinHistoria(tipo),
  };
}

const sinSeparadores = (s: string) => s.replace(/[\s-]/g, "").toLowerCase();

/** El vehículo de una patente tal como va en la dirección ("GTP-4325") o escrita a mano. */
export const buscarVehiculo = (flota: readonly Vehiculo[], patente: string | undefined): Vehiculo | undefined =>
  flota.find((v) => sinSeparadores(v.patente) === sinSeparadores(patente ?? ""));
