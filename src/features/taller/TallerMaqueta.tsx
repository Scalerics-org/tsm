import { Link, NavLink, Navigate, Route, Routes, useParams, useSearchParams } from "react-router-dom";
import { TruckMark } from "../../components/AppShell";
import { VEHICULOS, enLaDireccion, vehiculoDe } from "./datos";
import { FlotaPage } from "./FlotaPage";
import { TabCubiertas } from "./TabCubiertas";
import { TabServices } from "./TabServices";
import { fmtKm } from "./tipos";

/** Lo que viene después: se muestran apagadas para que se vea hacia dónde crece el taller. */
const PROXIMAMENTE = ["Frenos", "Rodaje", "Motor", "Caja", "Diferencial", "Chasis", "Electricidad", "Stock"];

/**
 * MAQUETA del módulo de Taller: navegable, con datos de ejemplo y sin base de datos. Vive afuera del login
 * (/taller-maqueta) para poder mostrarla; no toca nada del resto de la app.
 */
export function TallerMaqueta() {
  return (
    <div className="min-h-full bg-bg">
      <header className="sticky top-0 z-[500] bg-navy">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-5">
          <Link to="/taller-maqueta" className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 flex-none place-items-center bg-brand">
              <TruckMark />
            </span>
            <span className="font-cond text-[22px] font-semibold tracking-[0.06em] text-bg">TSM</span>
          </Link>
          <span className="font-cond text-[15px] font-semibold uppercase tracking-[0.14em] text-brand-400">Taller</span>
          <span className="ml-auto border border-st-amberBd bg-st-amberBg px-2.5 py-1 font-cond text-[11px] font-semibold uppercase tracking-[0.12em] text-st-amberTx">
            Maqueta
          </span>
        </div>
      </header>
      <div className="border-b border-st-amberBd bg-st-amberBg">
        <p className="mx-auto max-w-6xl px-4 py-2 text-xs text-st-amberTx sm:px-5">
          Maqueta para ver cómo queda: los datos son de ejemplo y nada se guarda.
        </p>
      </div>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-5">
        <Routes>
          <Route index element={<FlotaPage />} />
          <Route path=":patente" element={<FichaDelVehiculo />} />
          <Route path="*" element={<Navigate to="/taller-maqueta" replace />} />
        </Routes>
      </main>
    </div>
  );
}

type Pestana = "cubiertas" | "services";

function FichaDelVehiculo() {
  const { patente } = useParams();
  const [params, setParams] = useSearchParams();
  const vehiculo = vehiculoDe(patente);
  if (!vehiculo) return <Navigate to="/taller-maqueta" replace />;
  const pestana: Pestana = params.get("tab") === "services" ? "services" : "cubiertas";
  const ir = (t: Pestana) => setParams(t === "cubiertas" ? {} : { tab: t }, { replace: true });

  return (
    <div className="space-y-5">
      <nav aria-label="Camiones" className="sin-barra -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <ul className="flex gap-2">
          {VEHICULOS.map((v) => (
            <li key={v.patente} className="flex-none">
              <NavLink
                to={`/taller-maqueta/${enLaDireccion(v.patente)}`}
                className={({ isActive }) =>
                  `flex min-h-[44px] items-center border px-3 font-cond text-sm font-semibold tracking-[0.04em] ${
                    isActive ? "border-navy bg-navy text-bg" : "border-ink/[.2] bg-white text-ink/75 hover:bg-ink/[.05]"
                  }`
                }
              >
                {v.patente}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div>
          <Link to="/taller-maqueta" className="font-cond text-xs font-semibold uppercase tracking-[0.12em] text-brand-700">
            ← Flota
          </Link>
          <h1 className="font-cond text-4xl leading-none">{vehiculo.patente}</h1>
          <p className="mt-1 text-sm text-ink/60">{vehiculo.descripcion}</p>
        </div>
        <div className="text-right">
          <div className="kicker">Km actual</div>
          <div className="font-cond text-3xl font-semibold leading-none tabular-nums">{fmtKm(vehiculo.km)}</div>
        </div>
      </div>

      <div role="tablist" aria-label="Secciones del taller" className="sin-barra -mx-4 flex overflow-x-auto border-b border-ink/15 px-4 sm:mx-0 sm:px-0">
        {(["cubiertas", "services"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            type="button"
            aria-selected={pestana === t}
            onClick={() => ir(t)}
            className={`min-h-[44px] flex-none border-b-[3px] px-4 font-cond text-[15px] font-semibold uppercase tracking-[0.08em] ${
              pestana === t ? "border-brand text-ink" : "border-transparent text-ink/55 hover:text-ink"
            }`}
          >
            {t === "cubiertas" ? "Cubiertas" : "Services"}
          </button>
        ))}
        {PROXIMAMENTE.map((t) => (
          <span
            key={t}
            role="tab"
            aria-selected={false}
            aria-disabled
            title="Próximamente"
            className="flex min-h-[44px] flex-none cursor-not-allowed items-center gap-1.5 border-b-[3px] border-transparent px-3 font-cond text-[14px] font-semibold uppercase tracking-[0.08em] text-ink/30"
          >
            {t}
            <small className="hidden text-[9px] tracking-[0.1em] xl:inline">Próximamente</small>
          </span>
        ))}
      </div>

      {pestana === "cubiertas" ? <TabCubiertas key={vehiculo.patente} vehiculo={vehiculo} /> : <TabServices vehiculo={vehiculo} />}
    </div>
  );
}
