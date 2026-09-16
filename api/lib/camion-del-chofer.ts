import { ROLES } from "../../shared/domain";
import * as tripsRepo from "../repos/trips";

/**
 * El camión con el que el chofer está andando, no el que tiene asignado.
 *
 * Puede estar manejando otro: lo elige al salir. La surtida tiene que ir a la cadena de
 * odómetro del camión que de verdad cargó el gasoil — si no, el consumo de los dos camiones
 * queda mal, el que sumó litros que no gastó y el que perdió los kilómetros.
 *
 * Si todavía no arrancó el viaje no hay de dónde sacarlo y se cae al asignado.
 */
export async function camionDelChofer(c: any, user: { role: string; driver_id: number | null; truck_id: number | null }) {
  if (user.role !== ROLES.CHOFER || user.driver_id == null) return null;
  const enViaje = await tripsRepo.activeTripForDriver(c.env.DB, user.driver_id);
  return enViaje?.truck_id ?? user.truck_id;
}
