/**
 * El último número de factura que se usó, para no volver a tipearlo: una factura suele llevar
 * varios viajes —o varios clientes— seguidos de la lista. Vive mientras la pestaña esté abierta.
 */
let ultima = "";

export const ultimaFactura = (): string => ultima;
export const recordarFactura = (numero: string): void => {
  ultima = numero;
};
