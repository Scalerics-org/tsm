import type { Truck } from "@shared/domain";
import { HOY } from "./base";
import { componentesSinHistoria } from "./datos-extra";
import { disposicionDesdeTexto } from "@shared/taller/flota-real";
import type { Disposicion } from "@shared/taller/disposicion";
import type { TipoVehiculo, Vehiculo } from "@shared/taller/tipos";

/**
 * Los camiones y acoplados de la base, vistos como vehículos del Taller.
 *
 * Rodrigo carga la flota en Camiones con un "Tipo" de texto libre ("TRACTOR DOBLE EJE", "03-SEMIREMOLQUE 2 EJES",
 * "099- EMIREMOLQUE-S48 FURGON"…). Acá se traduce a uno de los tipos con dibujo del Taller. Cuando el texto no
 * alcanza para decidir, se elige el más probable y se AVISA en pantalla (`aConfirmar`) en vez de callarse.
 */

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
