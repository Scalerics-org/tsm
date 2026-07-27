import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import { useEffect } from "react";

export interface MapPoint {
  lat: number;
  lon: number;
  label?: string;
  kind?: "truck" | "origin" | "dest";
}

// Íconos explícitos (emoji vía divIcon) para no depender del ícono por defecto
// de Leaflet, cuyas imágenes no resuelven bien con el bundler.
function emojiIcon(emoji: string, size = 26) {
  return L.divIcon({
    className: "",
    html: `<div style="font-size:${size}px;line-height:1;filter:drop-shadow(0 1px 2px rgba(0,0,0,.5))">${emoji}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size - 4],
  });
}

const ICONS: Record<NonNullable<MapPoint["kind"]>, L.DivIcon> = {
  truck: emojiIcon("🚚"),
  origin: emojiIcon("🟢", 20),
  dest: emojiIcon("📍"),
};

function Recenter({ lat, lon }: { lat: number; lon: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lon], map.getZoom(), { animate: true });
  }, [lat, lon, map]);
  return null;
}

export function MapView({
  center,
  markers = [],
  path = [],
  route = [],
  className = "h-72 w-full rounded-2xl overflow-hidden",
  follow = false,
  zoom = 9,
}: {
  center: { lat: number; lon: number };
  markers?: MapPoint[];
  /** Traza GPS real recorrida (línea azul llena). */
  path?: { lat: number; lon: number }[];
  /** Ruta planificada por calles (OSRM), línea de fondo punteada. */
  route?: { lat: number; lon: number }[];
  className?: string;
  follow?: boolean;
  zoom?: number;
}) {
  return (
    <div className={className}>
      <MapContainer center={[center.lat, center.lon]} zoom={zoom} style={{ height: "100%", width: "100%" }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {route.length > 1 && (
          <Polyline
            positions={route.map((p) => [p.lat, p.lon])}
            pathOptions={{ color: "#64748b", weight: 4, opacity: 0.6, dashArray: "6 8" }}
          />
        )}
        {path.length > 1 && (
          <Polyline positions={path.map((p) => [p.lat, p.lon])} pathOptions={{ color: "#2f8bff", weight: 4 }} />
        )}
        {markers.map((m, i) => (
          <Marker key={i} position={[m.lat, m.lon]} icon={ICONS[m.kind ?? "dest"]}>
            {m.label && <Popup>{m.label}</Popup>}
          </Marker>
        ))}
        {follow && <Recenter lat={center.lat} lon={center.lon} />}
      </MapContainer>
    </div>
  );
}
