// Localidades de Uruguay con coordenadas, para asignar origen/destino a un viaje
// sin depender de un buscador externo. El chofer igualmente registra su GPS real.
export interface City {
  name: string;
  lat: number;
  lon: number;
}

export const URUGUAY_CITIES: City[] = [
  { name: "Montevideo", lat: -34.9011, lon: -56.1645 },
  { name: "Canelones", lat: -34.5378, lon: -56.2842 },
  { name: "Ciudad de la Costa", lat: -34.8167, lon: -55.95 },
  { name: "Colonia del Sacramento", lat: -34.4626, lon: -57.84 },
  { name: "Punta del Este", lat: -34.96, lon: -54.95 },
  { name: "Maldonado", lat: -34.9087, lon: -54.9586 },
  { name: "Minas", lat: -34.3757, lon: -55.2377 },
  { name: "Florida", lat: -34.0994, lon: -56.2144 },
  { name: "Durazno", lat: -33.3809, lon: -56.5231 },
  { name: "Trinidad", lat: -33.5236, lon: -56.9014 },
  { name: "Mercedes", lat: -33.2524, lon: -58.0269 },
  { name: "Fray Bentos", lat: -33.1386, lon: -58.3033 },
  { name: "Paysandú", lat: -32.3214, lon: -58.0756 },
  { name: "Salto", lat: -31.3833, lon: -57.9667 },
  { name: "Tacuarembó", lat: -31.7333, lon: -55.9833 },
  { name: "Rivera", lat: -30.9053, lon: -55.5508 },
  { name: "Melo", lat: -32.3696, lon: -54.1671 },
  { name: "Treinta y Tres", lat: -33.2333, lon: -54.3833 },
  { name: "Rocha", lat: -34.4833, lon: -54.3333 },
  { name: "San José de Mayo", lat: -34.3375, lon: -56.7136 },
  { name: "Artigas", lat: -30.4, lon: -56.4667 },
];
