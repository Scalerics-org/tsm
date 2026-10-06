import { Link, NavLink, Navigate, Route, Routes, useParams, useSearchParams } from "react-router-dom";
import { useState, type ReactNode } from "react";
import { VEHICULOS, enLaDireccion, vehiculoDe } from "./datos";
import { TIPOS_DE_VEHICULO, tipoDeVehiculo } from "./disposicion";
import { fmtDate } from "../../lib/format";
import { NuevoService } from "./NuevoService";
import { ServiceGuardado } from "./ServiceGuardado";
import { TabHistorial } from "./TabHistorial";
import { useConServicios, useCuantoSeCargo, volverALosDatosDeEjemplo } from "./servicio";
import { FlotaPage } from "./FlotaPage";
import { TabCubiertas } from "./TabCubiertas";
import { TabComponentes } from "./TabComponentes";
import { TabServices } from "./TabServices";
import { StockPage } from "./StockPage";
import { fmtUso, type Vehiculo } from "./tipos";

/**
 * MAQUETA del módulo de Taller: navegable, con datos de ejemplo y sin base de datos ni API. Vive dentro del panel
 * de oficina (/panel/taller, sólo admin y encargado) y usa el menú y la cabecera del panel: acá sólo hay un
 * sub-menú (Flota, Stock) y la banda que avisa que es de ejemplo.
 */
export function TallerMaqueta() {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-ink/15">
        <div className="kicker py-2">Taller</div>
        <nav aria-label="Taller" className="flex">
          {[
            ["/panel/taller", "Flota", true],
            ["/panel/taller/stock", "Stock", false],
          ].map(([to, texto, exacto]) => (
            <NavLink
              key={String(to)}
              to={String(to)}
              end={Boolean(exacto)}
              className={({ isActive }) =>
                `flex min-h-[44px] items-center border-b-[3px] px-3 font-cond text-[14px] font-semibold uppercase tracking-[0.1em] ${
                  isActive ? "border-brand text-ink" : "border-transparent text-ink/55 hover:text-ink"
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
      <BandaDeMaqueta />
      <Routes>
        <Route index element={<FlotaPage />} />
        <Route path="stock" element={<StockPage />} />
        <Route path=":patente" element={<FichaDelVehiculo />} />
        <Route path=":patente/nuevo-service" element={<EnElVehiculo>{(v) => <NuevoService vehiculo={v} />}</EnElVehiculo>} />
        <Route path=":patente/service/:id" element={<EnElVehiculo>{(v) => <ServiceGuardado vehiculo={v} />}</EnElVehiculo>} />
        <Route path="*" element={<Navigate to="/panel/taller" replace />} />
      </Routes>
    </div>
  );
}

type Pestana = "cubiertas" | "services" | "historial" | "componentes";

/** El vehículo pedido, con el tipo elegido en la pantalla (?tipo=) y los services cargados en esta sesión. */
function useVehiculoPedido(): Vehiculo | null {
  const { patente } = useParams();
  const [params] = useSearchParams();
  const base = vehiculoDe(patente);
  const conServicios = useConServicios(base ?? VEHICULOS[0]);
  if (!base) return null;
  const tipoElegido = params.get("tipo");
  // Cambiar el tipo cambia el dibujo y las posiciones; las cubiertas cargadas siguen siendo de su número.
  return base.disposicion && tipoElegido ? { ...conServicios, disposicion: tipoDeVehiculo(tipoElegido) } : conServicios;
}

/** La cabecera de un vehículo: la matrícula y los km según el tacógrafo. */
function CabeceraDelVehiculo({ vehiculo }: { vehiculo: Vehiculo }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div>
        <Link to="/panel/taller" className="font-cond text-xs font-semibold uppercase tracking-[0.12em] text-brand-700">
          ← Flota
        </Link>
        <div className="kicker mt-1">Matrícula</div>
        <h1 className="font-cond text-5xl leading-none tracking-[0.02em]">{vehiculo.patente}</h1>
        <p className="mt-1 text-sm text-ink/60">{vehiculo.descripcion}</p>
      </div>
      <div className="border-l-4 border-l-st-blueDot bg-white px-4 py-2.5 sm:text-right">
        <div className="kicker">{vehiculo.unidad === "h" ? "Horas · lectura del horímetro" : "Km del tacógrafo"}</div>
        <div className="font-cond text-4xl font-semibold leading-none tabular-nums">{fmtUso(vehiculo, vehiculo.km)}</div>
        <div className="mt-1 text-xs text-ink/55">
          lectura del {fmtDate(vehiculo.lectura)} · sale de las lecturas mensuales
        </div>
      </div>
    </div>
  );
}

/** Una pantalla de un vehículo (cargar un service, ver uno guardado) con su cabecera arriba. */
function EnElVehiculo({ children }: { children: (v: Vehiculo) => ReactNode }) {
  const vehiculo = useVehiculoPedido();
  if (!vehiculo) return <Navigate to="/panel/taller" replace />;
  return (
    <div className="space-y-6">
      <CabeceraDelVehiculo vehiculo={vehiculo} />
      {children(vehiculo)}
    </div>
  );
}

function FichaDelVehiculo() {
  const [params, setParams] = useSearchParams();
  const vehiculo = useVehiculoPedido();
  if (!vehiculo) return <Navigate to="/panel/taller" replace />;
  const tieneCubiertas = vehiculo.disposicion != null;
  const pedida = params.get("tab");
  const pestana: Pestana =
    pedida === "services" || pedida === "historial" || pedida === "componentes" ? pedida : tieneCubiertas ? "cubiertas" : "services";
  const pestanas: Pestana[] = (["cubiertas", "services", "historial", "componentes"] as const).filter((p) => p !== "cubiertas" || tieneCubiertas);
  const ir = (t: Pestana) => {
    const sig = new URLSearchParams();
    if (t !== "cubiertas") sig.set("tab", t);
    const tipo = params.get("tipo");
    if (tipo) sig.set("tipo", tipo);
    setParams(sig, { replace: true });
  };
  const elegirTipo = (id: string) => {
    const sig = new URLSearchParams(params);
    sig.set("tipo", id);
    sig.delete("cubierta");
    setParams(sig, { replace: true });
  };
  const nombres: Record<Pestana, string> = { cubiertas: "Cubiertas", services: "Services", historial: "Historial", componentes: "Componentes" };

  return (
    <div className="space-y-5">
      <nav aria-label="Vehículos" className="sin-barra -mx-5 overflow-x-auto px-5 sm:mx-0 sm:px-0">
        <ul className="flex gap-2">
          {VEHICULOS.map((v) => (
            <li key={v.patente} className="flex-none">
              <NavLink
                to={`/panel/taller/${enLaDireccion(v.patente)}`}
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

      <CabeceraDelVehiculo vehiculo={vehiculo} />

      {vehiculo.disposicion && (
        <div className="panel flex flex-wrap items-end gap-x-6 gap-y-3 px-4 py-3">
          <label className="block min-w-[220px] flex-1">
            <span className="label">Tipo de vehículo (según los ejes)</span>
            <select className="input min-h-[44px]" value={vehiculo.disposicion.id} onChange={(e) => elegirTipo(e.target.value)}>
              {TIPOS_DE_VEHICULO.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nombre}
                </option>
              ))}
            </select>
          </label>
          <div>
            <div className="label">Código MTOP del tipo</div>
            <div className="min-h-[44px] border border-dashed border-ink/25 bg-surface/60 px-3 py-2.5 font-cond text-base font-semibold tabular-nums">
              {vehiculo.disposicion.mtop || <span className="font-normal text-ink/45">A completar con la foto del sticker</span>}
            </div>
          </div>
          <p className="basis-full text-xs text-ink/55">
            El dibujo de las cubiertas sale de este tipo: {vehiculo.disposicion.ejes.length} ejes,{" "}
            {vehiculo.disposicion.ejes.map((e) => `${e.nombre.toLowerCase()} ${e.tipo}`).join(", ")}. En el sistema real se elige una vez al dar de alta
            la matrícula.
          </p>
        </div>
      )}

      <div role="tablist" aria-label="Secciones del taller" className="sin-barra -mx-5 flex overflow-x-auto border-b border-ink/15 px-5 sm:mx-0 sm:px-0">
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
            {nombres[t]}
          </button>
        ))}
      </div>

      {pestana === "cubiertas" ? (
        <TabCubiertas key={`${vehiculo.patente}-${vehiculo.disposicion?.id}`} vehiculo={vehiculo} />
      ) : pestana === "services" ? (
        <TabServices vehiculo={vehiculo} />
      ) : pestana === "historial" ? (
        <TabHistorial vehiculo={vehiculo} />
      ) : (
        <TabComponentes vehiculo={vehiculo} />
      )}
    </div>
  );
}

/**
 * La banda amarilla de arriba: avisa que es una maqueta con datos de ejemplo y que lo que se cargue queda sólo en este
 * navegador (no en un servidor), y ofrece volver a los datos de ejemplo. Borrar pide una confirmación en la misma banda.
 */
function BandaDeMaqueta() {
  const cargados = useCuantoSeCargo();
  const [confirmando, setConfirmando] = useState(false);
  return (
    <div className="border border-st-amberBd bg-st-amberBg">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2">
        <p className="min-w-0 flex-1 basis-80 text-xs leading-snug text-st-amberTx">
          Maqueta para ver cómo queda: los datos son de ejemplo. Lo que cargues (services, cambios de cubiertas, stock) queda{" "}
          <b>sólo en este navegador</b>: no se manda a ningún servidor y en otro navegador no está.
        </p>
        {confirmando ? (
          <span className="flex items-center gap-2" role="alert">
            <span className="text-xs font-semibold text-st-amberTx">¿Borrar lo que cargaste?</span>
            <button
              type="button"
              data-confirmar-borrado
              onClick={() => {
                volverALosDatosDeEjemplo();
                setConfirmando(false);
              }}
              className="min-h-[44px] border border-st-redDot bg-st-redDot px-3 font-cond text-[12px] font-semibold uppercase tracking-[0.06em] text-bg"
            >
              Sí, borrar
            </button>
            <button
              type="button"
              onClick={() => setConfirmando(false)}
              className="min-h-[44px] border border-st-amberBd bg-white px-3 font-cond text-[12px] font-semibold uppercase tracking-[0.06em] text-st-amberTx"
            >
              No
            </button>
          </span>
        ) : (
          <button
            type="button"
            data-volver-a-ejemplo
            onClick={() => setConfirmando(true)}
            className="min-h-[44px] border border-st-amberBd bg-white px-3 font-cond text-[12px] font-semibold uppercase tracking-[0.06em] text-st-amberTx hover:bg-st-amberBg"
          >
            Volver a los datos de ejemplo{cargados > 0 ? ` (${cargados} cargado${cargados === 1 ? "" : "s"})` : ""}
          </button>
        )}
      </div>
    </div>
  );
}
