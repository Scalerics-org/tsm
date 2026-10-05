import { Link, NavLink, Navigate, Route, Routes, useParams, useSearchParams } from "react-router-dom";
import { TruckMark } from "../../components/AppShell";
import { VEHICULOS, enLaDireccion, vehiculoDe } from "./datos";
import { FlotaPage } from "./FlotaPage";
import { TabCubiertas } from "./TabCubiertas";
import { TabComponentes } from "./TabComponentes";
import { TabServices } from "./TabServices";
import { StockPage } from "./StockPage";
import { fmtUso } from "./tipos";

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
          <span className="hidden font-cond text-[15px] font-semibold uppercase tracking-[0.14em] text-brand-400 sm:inline">Taller</span>
          <nav aria-label="Taller" className="ml-3 flex">
            {[
              ["/taller-maqueta", "Flota", true],
              ["/taller-maqueta/stock", "Stock", false],
            ].map(([to, texto, exacto]) => (
              <NavLink
                key={String(to)}
                to={String(to)}
                end={Boolean(exacto)}
                className={({ isActive }) =>
                  `flex min-h-[44px] items-center border-b-[3px] px-3 font-cond text-[14px] font-semibold uppercase tracking-[0.1em] ${
                    isActive ? "border-brand text-bg" : "border-transparent text-bg/55 hover:text-bg"
                  }`
                }
              >
                {texto}
              </NavLink>
            ))}
          </nav>
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
          <Route path="stock" element={<StockPage />} />
          <Route path=":patente" element={<FichaDelVehiculo />} />
          <Route path="*" element={<Navigate to="/taller-maqueta" replace />} />
        </Routes>
      </main>
    </div>
  );
}

type Pestana = "cubiertas" | "services" | "componentes";

function FichaDelVehiculo() {
  const { patente } = useParams();
  const [params, setParams] = useSearchParams();
  const vehiculo = vehiculoDe(patente);
  if (!vehiculo) return <Navigate to="/taller-maqueta" replace />;
  const tieneCubiertas = vehiculo.disposicion != null;
  const pedida = params.get("tab");
  const pestana: Pestana =
    pedida === "services" ? "services" : pedida === "componentes" ? "componentes" : tieneCubiertas ? "cubiertas" : "services";
  const pestanas = (["cubiertas", "services", "componentes"] as const).filter((p) => p !== "cubiertas" || tieneCubiertas);
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
          <div className="kicker">{vehiculo.unidad === "h" ? "Horas de uso" : "Km actual"}</div>
          <div className="font-cond text-3xl font-semibold leading-none tabular-nums">{fmtUso(vehiculo, vehiculo.km)}</div>
        </div>
      </div>

      <div role="tablist" aria-label="Secciones del taller" className="sin-barra -mx-4 flex overflow-x-auto border-b border-ink/15 px-4 sm:mx-0 sm:px-0">
        {pestanas.map((t) => (
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
            {t === "cubiertas" ? "Cubiertas" : t === "services" ? "Services" : "Componentes"}
          </button>
        ))}
      </div>

      {pestana === "cubiertas" ? (
        <TabCubiertas key={vehiculo.patente} vehiculo={vehiculo} />
      ) : pestana === "services" ? (
        <TabServices vehiculo={vehiculo} />
      ) : (
        <TabComponentes vehiculo={vehiculo} />
      )}
    </div>
  );
}
