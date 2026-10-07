import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { fmtDate } from "../../lib/format";
import { MODELOS } from "./base";
import { HOY, enLaDireccion } from "./datos";
import { useFlota } from "./FlotaReal";
import { Dialogo } from "./Dialogo";
import { TEXTO_DE_BAJA, type Destino, type MotivoDeBaja, type QueHacerConLaQueEstaba, type Reemplazo } from "./movimientos";
import { moverCubierta, ponerCubierta, useFlotaConLoCargado, useStock } from "./servicio";
import { VistaSuperior } from "./VistaSuperior";
import { cubiertasPorPosicion, fmtKm, type PosicionConCubierta, type Vehiculo } from "./tipos";
import { posiciones } from "./disposicion";
import type { CubiertaEnStock } from "./datos-extra";

/** Todo lo de "Sacar o mover esta cubierta": una sola pantalla que va mostrando lo que falta decidir. */

type Op = MotivoDeBaja | "stock" | "mismo" | "otro";

const OPCIONES: { op: Op; titulo: string; detalle: string }[] = [
  { op: "fin_de_vida", titulo: "Fin de la vida útil", detalle: "Se da de baja: sale de servicio." },
  { op: "mala_maniobra", titulo: "Se rompió por mala maniobra", detalle: "Se da de baja con ese motivo." },
  { op: "objeto", titulo: "Se rompió por agarrar un objeto", detalle: "Se da de baja con ese motivo." },
  { op: "stock", titulo: "Cambio para guardarla en el stock de usadas", detalle: "Sale del vehículo y queda en el stock." },
  { op: "mismo", titulo: "Cambio para colocarla en otra posición de este mismo vehículo", detalle: "Por ejemplo, en lugar de la 10." },
  { op: "otro", titulo: "Cambio para colocarla en otro vehículo", detalle: "Se elige la matrícula y la posición de la rueda." },
];

const comparable = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const MOTIVOS: MotivoDeBaja[] = ["fin_de_vida", "mala_maniobra", "objeto"];

function Opcion({
  activa,
  onClick,
  titulo,
  detalle,
  ...datos
}: {
  activa: boolean;
  onClick: () => void;
  titulo: string;
  detalle?: string;
  [dato: `data-${string}`]: string | undefined;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={activa}
      onClick={onClick}
      {...datos}
      className={`flex min-h-[48px] w-full items-start gap-3 border px-3 py-2.5 text-left ${
        activa ? "border-navy bg-brand-100" : "border-ink/[.2] bg-white hover:bg-ink/[.04]"
      }`}
    >
      <span className={`mt-1 grid h-4 w-4 flex-none place-items-center rounded-full border-2 ${activa ? "border-navy" : "border-ink/40"}`}>
        {activa && <span className="h-2 w-2 rounded-full bg-navy" />}
      </span>
      <span className="min-w-0">
        <span className="block text-[15px] font-semibold text-ink">{titulo}</span>
        {detalle && <span className="block text-xs text-ink/55">{detalle}</span>}
      </span>
    </button>
  );
}

function Paso({ n, titulo, children }: { n: number; titulo: string; children: ReactNode }) {
  return (
    <section className="space-y-2 border-t border-ink/10 pt-4 first:border-t-0 first:pt-0">
      <h3 className="flex items-center gap-2 font-cond text-lg">
        <span className="grid h-6 w-6 place-items-center bg-navy text-sm text-bg">{n}</span>
        {titulo}
      </h3>
      {children}
    </section>
  );
}

/** La lista de cubiertas del stock entre las que elegir (nuevas primero), y la carga a mano. */
function ElegirReemplazo({
  stock,
  rem,
  setRem,
  remUid,
  setRemUid,
  modelo,
  setModelo,
  codigo,
  setCodigo,
  conVacia,
}: {
  stock: CubiertaEnStock[];
  rem: "vacia" | "stock" | "manual";
  setRem: (r: "vacia" | "stock" | "manual") => void;
  remUid: string | null;
  setRemUid: (u: string | null) => void;
  modelo: string;
  setModelo: (m: string) => void;
  codigo: string;
  setCodigo: (c: string) => void;
  conVacia: boolean;
}) {
  const ordenadas = [...stock].sort((a, b) => (a.estado === b.estado ? 0 : a.estado === "nueva" ? -1 : 1));
  return (
    <div role="radiogroup" className="space-y-2">
      {conVacia && (
        <Opcion data-reemplazo="vacia" activa={rem === "vacia"} onClick={() => setRem("vacia")} titulo="Dejar la posición vacía" detalle="Queda gris, con guiones, en el dibujo. Después se le puede poner una." />
      )}
      <Opcion data-reemplazo="stock" activa={rem === "stock"} onClick={() => setRem("stock")} titulo="Una del stock (nuevas o usadas)" />
      {rem === "stock" && (
        <ul className="max-h-56 space-y-1 overflow-y-auto border border-ink/10 bg-white p-1">
          {ordenadas.length === 0 && <li className="px-2 py-2 text-sm text-ink/55">No hay cubiertas en el stock.</li>}
          {ordenadas.map((s) => {
            const uid = s.uid ?? s.codigo;
            return (
              <li key={uid}>
                <button
                  type="button"
                  data-reemplazo-uid={uid}
                  onClick={() => setRemUid(uid)}
                  aria-pressed={remUid === uid}
                  className={`flex min-h-[44px] w-full items-center justify-between gap-3 px-2 py-1.5 text-left ${remUid === uid ? "bg-brand-100" : "hover:bg-ink/[.04]"}`}
                >
                  <span className="text-sm">
                    <b className="font-cond text-base">{s.codigo || "Sin código"}</b> · {MODELOS[s.modeloId]?.nombre}
                  </span>
                  <span className={`border px-1.5 py-0.5 font-cond text-[11px] font-semibold uppercase tracking-[0.1em] ${s.estado === "nueva" ? "border-st-greenBd bg-st-greenBg text-st-greenTx" : "border-ink/25 text-ink/65"}`}>
                    {s.estado === "nueva" ? "Nueva" : "Usada"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <Opcion data-reemplazo="manual" activa={rem === "manual"} onClick={() => setRem("manual")} titulo="Una cargada a mano" detalle="Modelo y código (el código es opcional)." />
      {rem === "manual" && (
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="block">
            <span className="label">Modelo</span>
            <select className="input min-h-[44px]" value={modelo} onChange={(e) => setModelo(e.target.value)}>
              {Object.values(MODELOS).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nombre} · {m.medida}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label">Código (opcional)</span>
            <input className="input min-h-[44px]" value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="Se puede dejar vacío" />
          </label>
        </div>
      )}
    </div>
  );
}

const aReemplazo = (rem: "vacia" | "stock" | "manual", uid: string | null, modelo: string, codigo: string): Reemplazo =>
  rem === "stock" && uid ? { tipo: "stock", uid } : rem === "manual" ? { tipo: "manual", modeloId: modelo, codigo } : { tipo: "vacia" };
const reemplazoValido = (rem: "vacia" | "stock" | "manual", uid: string | null) => rem !== "stock" || uid != null;

// ───────────────────────────────────────────────────────────────────────────────────────────────

export function MoverCubierta({ vehiculo, item: itemActual, onCerrar }: { vehiculo: Vehiculo; item: PosicionConCubierta; onCerrar: () => void }) {
  // La cubierta como estaba al abrir: después de confirmar la posición puede cambiar, y el aviso tiene que seguir hablando de ésta.
  const [item] = useState(itemActual);
  const flota = useFlotaConLoCargado(useFlota().flota);
  const stock = useStock();
  const cubierta = item.cubierta;
  const numero = item.posicion.numero;

  const [op, setOp] = useState<Op | null>(null);
  const [fecha, setFecha] = useState(HOY);
  const [km, setKm] = useState(String(vehiculo.km));
  const [obs, setObs] = useState("");
  const [busca, setBusca] = useState("");
  const [destPat, setDestPat] = useState<string | null>(null);
  const [destPos, setDestPos] = useState<number | null>(null);
  const [ocupada, setOcupada] = useState<"intercambio" | "stock" | "baja">("intercambio");
  const [ocupadaMotivo, setOcupadaMotivo] = useState<MotivoDeBaja>("fin_de_vida");
  const [rem, setRem] = useState<"vacia" | "stock" | "manual">("vacia");
  const [remUid, setRemUid] = useState<string | null>(null);
  const [modelo, setModelo] = useState(cubierta?.modeloId ?? Object.keys(MODELOS)[0]);
  const [codigo, setCodigo] = useState("");
  const [resultado, setResultado] = useState<{ texto: string; ver?: string } | null>(null);

  if (!cubierta) return null;
  const kmNumero = Number(km.replace(",", "."));
  const muevo = op === "mismo" || op === "otro";
  const patenteDestino = op === "mismo" ? vehiculo.patente : destPat;
  const vDest = patenteDestino ? flota.find((v) => v.patente === patenteDestino) : undefined;
  const nombreDePos = (v: Vehiculo, n: number) => (v.disposicion ? posiciones(v.disposicion).find((p) => p.numero === n)?.nombre : undefined) ?? `posición ${n}`;
  const quienEsta = vDest && destPos != null ? vDest.cubiertas.find((c) => c.numero === destPos) : undefined;
  const destinoValido = !muevo || (!!vDest && destPos != null && !(vDest.patente === vehiculo.patente && destPos === numero));
  const quedaLibre = !(muevo && quienEsta && ocupada === "intercambio");
  const valido = op != null && kmNumero > 0 && !!fecha && destinoValido && reemplazoValido(rem, remUid);

  const vehiculosParaElegir = flota.filter(
    (v) => v.disposicion && v.patente !== vehiculo.patente && (!busca.trim() || comparable(v.patente).includes(comparable(busca))),
  );

  function confirmar() {
    if (!op || !valido) return;
    const destino: Destino =
      op === "stock"
        ? { tipo: "stock" }
        : muevo
          ? {
              tipo: "mover",
              patente: patenteDestino as string,
              posicion: destPos as number,
              ocupada: quienEsta ? ((ocupada === "baja" ? { tipo: "baja", motivo: ocupadaMotivo } : { tipo: ocupada }) as QueHacerConLaQueEstaba) : undefined,
            }
          : { tipo: "baja", motivo: op };
    moverCubierta(flota, {
      patente: vehiculo.patente,
      posicion: numero,
      fecha,
      km: kmNumero,
      obs,
      destino,
      reemplazo: quedaLibre ? aReemplazo(rem, remUid, modelo, codigo) : undefined,
    });
    const quien = cubierta?.codigo ? `La cubierta ${cubierta.codigo}` : "La cubierta (sin código)";
    const donde =
      op === "stock"
        ? "quedó en el stock de usadas"
        : muevo
          ? `pasó a la posición ${destPos} de ${patenteDestino}`
          : `se dio de baja: ${TEXTO_DE_BAJA[op as MotivoDeBaja].toLowerCase()}`;
    setResultado({
      texto: `${quien} ${donde}.${quienEsta ? " La que estaba ahí " + (ocupada === "intercambio" ? "pasó a su lugar." : ocupada === "stock" ? "quedó en el stock de usadas." : "se dio de baja.") : ""}`,
      ver: op === "otro" && patenteDestino ? patenteDestino : undefined,
    });
  }

  if (resultado) {
    return (
      <Dialogo titulo="Listo" onCerrar={onCerrar}>
        <p data-resultado className="border border-st-greenBd bg-st-greenBg px-4 py-3 text-[15px] text-st-greenTx">
          {resultado.texto}
        </p>
        <p className="mt-3 text-sm text-ink/60">El recorrido de la cubierta se puede ver desde su ficha y desde Stock.</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button type="button" onClick={onCerrar} className="btn btn-primary min-h-[44px]">
            Cerrar
          </button>
          {resultado.ver && (
            <Link to={`/panel/taller/${enLaDireccion(resultado.ver)}`} onClick={onCerrar} className="btn btn-secondary min-h-[44px]">
              Ver {resultado.ver}
            </Link>
          )}
        </div>
      </Dialogo>
    );
  }

  let paso = 1;
  return (
    <Dialogo titulo={`Sacar o mover la cubierta ${numero}`} onCerrar={onCerrar}>
      <div className="space-y-5">
        <p className="text-sm text-ink/60">
          {vehiculo.patente} · {item.posicion.nombre} · {cubierta.codigo ?? "sin código"} · {MODELOS[cubierta.modeloId]?.nombre} · {fmtKm(item.km)}
        </p>

        <Paso n={paso++} titulo="¿Qué pasa con esta cubierta?">
          <div role="radiogroup" className="space-y-2">
            {OPCIONES.map((o) => (
              <Opcion key={o.op} data-op={o.op} activa={op === o.op} onClick={() => setOp(o.op)} titulo={o.titulo} detalle={o.detalle} />
            ))}
          </div>
        </Paso>

        {op && (
          <Paso n={paso++} titulo="Cuándo y a cuántos km">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="label">Fecha</span>
                <input type="date" className="input min-h-[44px]" value={fecha} onChange={(e) => setFecha(e.target.value)} />
              </label>
              <label className="block">
                <span className="label">Km de {vehiculo.patente}</span>
                <input inputMode="decimal" className="input min-h-[44px] tabular-nums" value={km} onChange={(e) => setKm(e.target.value.replace(/[^\d.,]/g, ""))} />
                <span className="mt-1 block text-xs text-ink/55">
                  Del tacógrafo: {vehiculo.km.toLocaleString("es-UY")} · lectura del {fmtDate(vehiculo.lectura)}. Se puede corregir.
                </span>
              </label>
              <label className="block sm:col-span-2">
                <span className="label">Observaciones</span>
                <input className="input min-h-[44px]" value={obs} onChange={(e) => setObs(e.target.value)} />
              </label>
            </div>
          </Paso>
        )}

        {op === "otro" && (
          <Paso n={paso++} titulo="¿A qué vehículo?">
            <input
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por matrícula: 4325, GTP 4325…"
              className="input min-h-[44px] text-base"
              autoComplete="off"
            />
            <ul className="grid max-h-56 gap-1 overflow-y-auto sm:grid-cols-2">
              {vehiculosParaElegir.map((v) => (
                <li key={v.patente}>
                  <button
                    type="button"
                    data-destino-vehiculo={v.patente}
                    onClick={() => {
                      setDestPat(v.patente);
                      setDestPos(null);
                    }}
                    aria-pressed={destPat === v.patente}
                    className={`flex min-h-[48px] w-full flex-col justify-center border px-3 py-1 text-left ${destPat === v.patente ? "border-navy bg-brand-100" : "border-ink/[.2] bg-white hover:bg-ink/[.04]"}`}
                  >
                    <span className="font-cond text-lg font-semibold leading-tight">{v.patente}</span>
                    <span className="text-xs text-ink/55">{v.disposicion?.nombre}</span>
                  </button>
                </li>
              ))}
              {vehiculosParaElegir.length === 0 && <li className="px-1 py-2 text-sm text-ink/60">Ninguna matrícula coincide.</li>}
            </ul>
          </Paso>
        )}

        {muevo && vDest?.disposicion && (
          <Paso n={paso++} titulo={`¿A qué posición${op === "otro" ? ` de ${vDest.patente}` : ""}?`}>
            <p className="text-sm text-ink/60">Tocá la rueda en el dibujo.</p>
            <div className="papel-de-plano panel -mx-4 border-x-0 px-0 py-3 sm:mx-0 sm:border-x">
              <VistaSuperior
                disposicion={vDest.disposicion}
                posiciones={cubiertasPorPosicion(vDest)}
                seleccionada={destPos}
                onSeleccionar={(n) => {
                  if (vDest.patente === vehiculo.patente && n === numero) return;
                  setDestPos(n);
                }}
                modeloResaltado={null}
              />
            </div>
            {destPos != null && (
              <p data-destino-elegido className="text-sm font-semibold text-ink">
                {vDest.patente} · posición {destPos} · {nombreDePos(vDest, destPos)}:{" "}
                {quienEsta ? <span className="text-st-amberTx">ocupada por {quienEsta.codigo ?? "una cubierta sin código"} ({MODELOS[quienEsta.modeloId]?.nombre})</span> : <span className="text-st-greenTx">libre</span>}
              </p>
            )}
          </Paso>
        )}

        {muevo && quienEsta && (
          <Paso n={paso++} titulo="Ya hay una cubierta ahí: ¿qué pasa con ella?">
            <div role="radiogroup" className="space-y-2">
              <Opcion
                data-ocupada="intercambio"
                activa={ocupada === "intercambio"}
                onClick={() => setOcupada("intercambio")}
                titulo={`Intercambio: pasa a la posición ${numero} de ${vehiculo.patente}`}
                detalle="Las dos cubiertas cambian de lugar."
              />
              <Opcion data-ocupada="stock" activa={ocupada === "stock"} onClick={() => setOcupada("stock")} titulo="Va al stock de usadas" />
              <Opcion data-ocupada="baja" activa={ocupada === "baja"} onClick={() => setOcupada("baja")} titulo="Se da de baja, con un motivo" />
              {ocupada === "baja" && (
                <div role="radiogroup" className="flex flex-wrap gap-2 pl-7">
                  {MOTIVOS.map((m) => (
                    <button
                      key={m}
                      type="button"
                      role="radio"
                      aria-checked={ocupadaMotivo === m}
                      onClick={() => setOcupadaMotivo(m)}
                      className={`min-h-[44px] border px-3 text-sm font-semibold ${ocupadaMotivo === m ? "border-navy bg-navy text-bg" : "border-ink/[.25] bg-white text-ink/75"}`}
                    >
                      {TEXTO_DE_BAJA[m]}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </Paso>
        )}

        {op && quedaLibre && (
          <Paso n={paso++} titulo={`¿Qué cubierta ponés en el lugar de la ${numero}?`}>
            <ElegirReemplazo stock={stock} rem={rem} setRem={setRem} remUid={remUid} setRemUid={setRemUid} modelo={modelo} setModelo={setModelo} codigo={codigo} setCodigo={setCodigo} conVacia />
          </Paso>
        )}

        <div className="flex flex-wrap items-center gap-3 border-t border-ink/10 pt-4">
          <button type="button" data-confirmar-movimiento onClick={confirmar} disabled={!valido} className="btn btn-primary min-h-[44px]">
            Confirmar
          </button>
          <button type="button" onClick={onCerrar} className="btn btn-secondary min-h-[44px]">
            Cancelar
          </button>
          {!valido && op && <span className="text-sm text-ink/55">{muevo && destPos == null ? "Falta elegir la posición." : "Falta completar los datos."}</span>}
        </div>
      </div>
    </Dialogo>
  );
}

/** Poner una cubierta en una posición que quedó vacía. */
export function PonerCubierta({ vehiculo, numero, nombre, onCerrar }: { vehiculo: Vehiculo; numero: number; nombre: string; onCerrar: () => void }) {
  const flota = useFlotaConLoCargado(useFlota().flota);
  const stock = useStock();
  const [fecha, setFecha] = useState(HOY);
  const [km, setKm] = useState(String(vehiculo.km));
  const [rem, setRem] = useState<"vacia" | "stock" | "manual">("stock");
  const [remUid, setRemUid] = useState<string | null>(null);
  const [modelo, setModelo] = useState(Object.keys(MODELOS)[0]);
  const [codigo, setCodigo] = useState("");
  const kmNumero = Number(km.replace(",", "."));
  const valido = kmNumero > 0 && !!fecha && rem !== "vacia" && reemplazoValido(rem, remUid);
  return (
    <Dialogo titulo={`Poner una cubierta en la ${numero}`} onCerrar={onCerrar}>
      <div className="space-y-5">
        <p className="text-sm text-ink/60">
          {vehiculo.patente} · {nombre}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="label">Fecha</span>
            <input type="date" className="input min-h-[44px]" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </label>
          <label className="block">
            <span className="label">Km de {vehiculo.patente}</span>
            <input inputMode="decimal" className="input min-h-[44px] tabular-nums" value={km} onChange={(e) => setKm(e.target.value.replace(/[^\d.,]/g, ""))} />
          </label>
        </div>
        <ElegirReemplazo stock={stock} rem={rem} setRem={setRem} remUid={remUid} setRemUid={setRemUid} modelo={modelo} setModelo={setModelo} codigo={codigo} setCodigo={setCodigo} conVacia={false} />
        <div className="flex gap-3 border-t border-ink/10 pt-4">
          <button
            type="button"
            data-confirmar-poner
            disabled={!valido}
            onClick={() => {
              ponerCubierta(flota, { patente: vehiculo.patente, posicion: numero, fecha, km: kmNumero, reemplazo: aReemplazo(rem, remUid, modelo, codigo) });
              onCerrar();
            }}
            className="btn btn-primary min-h-[44px]"
          >
            Poner la cubierta
          </button>
          <button type="button" onClick={onCerrar} className="btn btn-secondary min-h-[44px]">
            Cancelar
          </button>
        </div>
      </div>
    </Dialogo>
  );
}
