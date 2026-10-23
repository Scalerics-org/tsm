export type GrupoDePieza = "rueda" | "freno" | "rodaje";

/** Una medida que se controla con calibre: el valor, el límite y de qué lado está el límite. */
export interface MedidaDePieza {
  valor: number;
  limite: number;
  sentido: "min" | "max";
  unidad: string;
}

export interface PiezaDelCatalogo {
  id: string;
  grupo: GrupoDePieza;
  nombre: string;
  medida?: MedidaDePieza;
  /** Cuántos km dura, de ejemplo: la maqueta lo usa para inventar el estado, y en la fase 5 se va. */
  vida: number;
}

/** Las piezas del despiece de 21.jpg, más las que pide el Excel (bujes, retén, grasa). */
export const PIEZAS_DE_RUEDA: PiezaDelCatalogo[] = [
  { id: "llanta", grupo: "rueda", nombre: "Llanta", vida: 400_000 },
  { id: "disco", grupo: "rueda", nombre: "Disco de rueda", vida: 400_000 },
  { id: "bulones", grupo: "rueda", nombre: "Bulones y tuercas", vida: 200_000 },
  { id: "tambor", grupo: "freno", nombre: "Tambor (campana)", medida: { valor: 0, limite: 422, sentido: "max", unidad: "mm" }, vida: 300_000 },
  { id: "zapatas", grupo: "freno", nombre: "Zapatas / cintas", medida: { valor: 0, limite: 5, sentido: "min", unidad: "mm" }, vida: 120_000 },
  { id: "leva", grupo: "freno", nombre: "Leva S", vida: 250_000 },
  { id: "bujes", grupo: "freno", nombre: "Bujes", vida: 150_000 },
  { id: "matraca", grupo: "freno", nombre: "Matraca", vida: 200_000 },
  { id: "pulmon", grupo: "freno", nombre: "Pulmón de freno", vida: 250_000 },
  { id: "maza", grupo: "rodaje", nombre: "Maza", vida: 500_000 },
  { id: "rulemanes", grupo: "rodaje", nombre: "Rulemanes", vida: 250_000 },
  { id: "reten", grupo: "rodaje", nombre: "Retén", vida: 150_000 },
  { id: "tapa", grupo: "rodaje", nombre: "Tapa de maza", vida: 300_000 },
  { id: "punta", grupo: "rodaje", nombre: "Punta de eje", vida: 500_000 },
  { id: "grasa", grupo: "rodaje", nombre: "Grasa", vida: 60_000 },
  { id: "eje", grupo: "rodaje", nombre: "Eje", vida: 600_000 },
];
