import { Link } from "react-router-dom";
import { TRUCK_STATUS_LABEL, type Truck } from "@shared/domain";
import { claseDe, ETIQUETA_CLASE } from "@shared/clase-vehiculo";
import { DOCUMENTOS_DEL_CAMION } from "@shared/vencimientos";
import { DocumentosDeLaFicha } from "../../components/DocumentosDeLaFicha";
import { Stat } from "../../components/ui";
import { useSoloMirar } from "../../lib/auth";

/**
 * La ficha de un remolque o un montacargas.
 *
 * No tiene consumo, lecturas del tacógrafo ni viajes: no maneja nadie ni carga gasoil, así que
 * mostrarle esas secciones vacías (0 km, 0,00 km/L) era lo que hacía que pareciera un camión roto.
 * Sólo lo que sí tiene: qué es, cómo está y qué documentos le vencen.
 */
export function FichaDeVehiculo({ vehiculo }: { vehiculo: Truck }) {
  const soloMirar = useSoloMirar();
  const clase = claseDe(vehiculo);
  const volver = `/admin/camiones?clase=${clase}`;
  return (
    <div className="space-y-5">
      <Link to={volver} className="text-sm text-ink/60 hover:text-ink">
        ← {clase === "remolque" ? "Remolques" : "Montacargas"}
      </Link>
      <div>
        <div className="kicker">{ETIQUETA_CLASE[clase]}</div>
        <h1 className="text-3xl text-ink">{vehiculo.plate}</h1>
        <p className="text-sm text-ink/60">
          {[`${vehiculo.brand} ${vehiculo.model}`.trim(), vehiculo.year ? String(vehiculo.year) : "", vehiculo.type]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Estado" value={TRUCK_STATUS_LABEL[vehiculo.status]} />
        {vehiculo.capacity_kg > 0 && <Stat label="Capacidad" value={`${vehiculo.capacity_kg.toLocaleString("es-UY")} kg`} />}
      </div>
      <DocumentosDeLaFicha
        documentos={DOCUMENTOS_DEL_CAMION.map((x) => ({ nombre: x.nombre, fecha: vehiculo[x.campo] }))}
        dondeCargar={soloMirar ? "la oficina" : "Camiones → Editar"}
      />
    </div>
  );
}
