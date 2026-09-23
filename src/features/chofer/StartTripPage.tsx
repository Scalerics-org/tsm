import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  CAMPO_MODO,
  FIELD_STAGE,
  PHOTO_KIND,
  requiereFotoCarga,
  type CampoUbicacion,
  type LibretaEntry,
  type Trip,
  type TripTemplate,
} from "@shared/domain";
import { camposDeRuta, destinatarioSeEligeAlCerrar, destinoSeEligeAlCerrar } from "@shared/en-ruta";
import { api, ApiError, mensajeDe } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { Button, Card, Corners, ErrorDeCarga, ErrorText, Field, Spinner } from "../../components/ui";
import { CameraCapture } from "../../components/CameraCapture";
import { LibretaPicker } from "../../components/LibretaPicker";
import { CampoDePlantilla } from "../../components/CampoDePlantilla";
import { compressImage } from "../../lib/image";
import { estimateTravel, fmtDuration, etaClock } from "../../lib/eta";

interface TruckOption {
  id: number;
  plate: string;
}

async function uploadPhoto(tripId: number, file: File, kind: string) {
  const fd = new FormData();
  fd.append("file", await compressImage(file));
  fd.append("trip_id", String(tripId));
  fd.append("kind", kind);
  await api.upload("/photos", fd);
}

export function StartTripPage() {
  const { templateId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [tpl, setTpl] = useState<TripTemplate | null>(null);
  const [optIdx, setOptIdx] = useState("");
  const [otroDest, setOtroDest] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [file, setFile] = useState<File | null>(null);
  const [libreta, setLibreta] = useState<Record<string, LibretaEntry | null>>({});
  // Lo que el chofer escribe en los campos "completar" de la plantilla.
  const [textos, setTextos] = useState<Record<string, string>>({});
  const [trucks, setTrucks] = useState<TruckOption[]>([]);
  const [truckId, setTruckId] = useState("");
  /**
   * Si el camión elegido hace este viaje. Se le pregunta al servidor con la misma lista que
   * arma la pantalla de viajes (`GET /templates?truck=N`), que ya cuenta los viajes propios del
   * camión ("el 4383 hace solo eso"). Con la regla vieja copiada acá, "UAM - Retorno" salía en
   * la lista del 4383 y esta pantalla le trababa el botón.
   *
   * `null` = no se sabe (sin señal): no se traba nada, el alta lo vuelve a controlar.
   */
  const [haceElViaje, setHaceElViaje] = useState<boolean | null>(null);
  useEffect(() => {
    setHaceElViaje(null);
    if (!truckId || !templateId) return;
    let vigente = true;
    api
      .get<{ id: number }[]>(`/templates?truck=${truckId}`)
      .then((ts) => vigente && setHaceElViaje(ts.some((t) => t.id === Number(templateId))))
      .catch(() => vigente && setHaceElViaje(null));
    return () => {
      vigente = false;
    };
  }, [truckId, templateId]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Sin esto, un corte de señal dejaba el spinner girando para siempre: `tpl` quedaba en null
  // y no había ni error ni forma de reintentar. El chofer no podía salir de viaje y lo único
  // que le quedaba era cerrar la app y volver a abrirla.
  const [tplFalló, setTplFalló] = useState<string | null>(null);
  const cargarPlantilla = useCallback(() => {
    setTplFalló(null);
    api
      .get<TripTemplate[]>("/templates")
      .then((list) => {
        const suya = list.find((t) => t.id === Number(templateId));
        if (suya) setTpl(suya);
        else setTplFalló("Este viaje ya no está en tu lista. Volvé y elegilo de nuevo.");
      })
      .catch((e) => setTplFalló(mensajeDe(e)));
  }, [templateId]);
  useEffect(cargarPlantilla, [cargarPlantilla]);

  // Camión asignado por defecto; el chofer puede cambiarlo si hoy maneja otro.
  //
  // Si NO tiene camión asignado no se elige uno por él: antes quedaba puesto el primero de la
  // flota por orden de patente, sin nada que dijera que ése no era el suyo, y el texto de abajo
  // le pide justamente que no lo toque. El viaje, sus kilómetros y sus surtidas terminaban
  // cargados a un camión que no se movió.
  useEffect(() => {
    api
      .get<TruckOption[]>("/trucks/options")
      .then((list) => {
        setTrucks(list);
        setTruckId(user?.truck_id != null ? String(user.truck_id) : "");
      })
      .catch(() => {});
  }, [user?.truck_id]);

  if (!tpl) {
    return tplFalló ? (
      <ErrorDeCarga titulo="No se pudo cargar el viaje." mensaje={tplFalló} onReintentar={cargarPlantilla} />
    ) : (
      <Spinner size={28} />
    );
  }

  const cargaFields = tpl.fields.filter((f) => f.stage === FIELD_STAGE.CARGA);
  const cu = tpl.campos_ubicacion ?? {};
  // Misma regla que valida el cierre en el backend: la pantalla no exige lo que no se exige.
  //
  // En los combinados no se pide al salir: la evidencia va por lugar de carga, y al arrancar
  // todavía no hay ninguna carga a la que pegarla. Pedirla acá deja una foto suelta que no
  // cuenta para el cierre, y el chofer termina sacando cuatro para tres paradas.
  //
  // Tampoco cuando el viaje tiene datos que se piden en el puente: el papel a fotografiar es la
  // hoja del MIC, que se la dan en la frontera. "Hoy sólo donde cargo y le dé iniciar viaje."
  // La saca desde la pantalla del viaje, y el cierre la sigue exigiendo.
  const fotoEnElPuente = camposDeRuta(tpl.fields).length > 0;
  const pideFoto = requiereFotoCarga(tpl) && !tpl.multi_renglon && !fotoEnElPuente;

  /**
   * Valor de una parte según su modo: fijo lo trae la plantilla, libreta lo elige el
   * chofer de una lista, y texto lo escribe (el "completar" de la planilla del cliente).
   */
  const valorDe = (campo: CampoUbicacion | undefined, key: string, fallback: string): string => {
    if (!campo) return fallback;
    if (campo.modo === CAMPO_MODO.FIJO) return campo.valor ?? fallback;
    if (campo.modo === CAMPO_MODO.TEXTO) return (textos[key] ?? "").trim();
    return libreta[key]?.nombre ?? "";
  };

  /**
   * El recorrido lo arman las cargas: cada una trae su propio departamento de salida y de
   * destino, así que no se le pregunta al chofer antes de arrancar. Preguntarlo era pedirle
   * dos veces el mismo dato —con tres cargas eran catorce pasos y dos repetidos— y encima
   * ambiguo: si carga en Artigas y en Salto y descarga todo en Montevideo, no hay un solo
   * "origen del viaje". El backend lo arma con la primera y la última carga.
   *
   * Lo mismo vale para el ORIGEN: `recalcularRecorrido` lo pisa con el de la primera carga, así
   * que la respuesta de acá se tiraba. El chofer elegía "Salto", cargaba en Artigas y el viaje
   * quedaba en Artigas; y al agregar la carga se le pedía otra vez el departamento donde cargó
   * ("Otros Viajes", Rodrigo 22/9). Por eso tampoco se dibuja ni se exige el origen.
   */
  const recorridoPorCarga = !!tpl.multi_renglon && !!tpl.renglon_pide_ubicacion;

  // El destino sale de la libreta solo si la plantilla lo configuró; si no, del par clásico.
  const usaLibretaDestino = !!(cu.destino || cu.destinatario);
  // Los internacionales: "cuando lleguen: departamento, donde descargo…". Al salir no se
  // muestran ni se exigen; el viaje arranca sin destino y se lo pide el cierre.
  const destinoAlCerrar = destinoSeEligeAlCerrar(cu);
  const destinatarioAlCerrar = destinatarioSeEligeAlCerrar(cu);
  const opt = optIdx !== "" ? tpl.dest_options[Number(optIdx)] : null;

  const origenFinal = valorDe(cu.origen, "origen", tpl.origin);
  const remitenteFinal = valorDe(cu.remitente, "remitente", tpl.remite ?? "");
  const destinoFinal = destinoAlCerrar
    ? ""
    : usaLibretaDestino
      ? valorDe(cu.destino, "destino", "")
      : opt?.destino ?? "";
  const destinatarioFinal = destinatarioAlCerrar
    ? ""
    : usaLibretaDestino
      ? valorDe(cu.destinatario, "destinatario", "")
    : opt?.destinatario === "Otro" && otroDest.trim()
      ? otroDest.trim()
      : opt?.destinatario ?? "";

  const est = destinoFinal ? estimateTravel(origenFinal, destinoFinal) : null;
  const setLib = (key: string) => (e: LibretaEntry | null) => setLibreta((p) => ({ ...p, [key]: e }));

  const setVal = (k: string, v: string) => setValues((prev) => ({ ...prev, [k]: v }));

  async function confirm() {
    setError("");
    // El desplegable arranca vacío cuando no tiene camión asignado: sin esto el servidor
    // contesta con el mensaje del camión, que no dice qué hacer.
    if (!truckId) return setError("Elegí con qué camión salís.");
    // Los de texto se validan igual que los de lista: si son obligatorios, no pasan vacios.
    if (
      !recorridoPorCarga &&
      cu.origen &&
      cu.origen.modo !== CAMPO_MODO.FIJO &&
      cu.origen.requerido !== false &&
      !origenFinal
    ) {
      return setError("Elegí el origen.");
    }
    if (cu.remitente && cu.remitente.modo !== CAMPO_MODO.FIJO && cu.remitente.requerido !== false && !remitenteFinal) {
      return setError(`Falta: ${cu.remitente.label ?? "el lugar de carga"}.`);
    }
    if (recorridoPorCarga) {
      // Nada que validar: el recorrido todavía no existe y se va a armar con las cargas.
    } else if (usaLibretaDestino) {
      if (!destinoAlCerrar && !destinoFinal) return setError("Elegí el destino.");
      if (
        cu.destinatario &&
        !destinatarioAlCerrar &&
        cu.destinatario.requerido !== false &&
        !destinatarioFinal
      ) {
        return setError("Elegí el destinatario.");
      }
    } else if (!opt) {
      return setError("Elegí el destino.");
    }
    for (const f of cargaFields) {
      if (f.required && !String(values[f.key] ?? "").trim()) return setError(`Cargá ${f.label}.`);
    }
    if (pideFoto && !file) return setError("Sacá la foto de la carga.");

    setBusy(true);
    try {
      const trip = await api.post<Trip>("/trips", {
        template_id: tpl!.id,
        origin: origenFinal,
        remitente: remitenteFinal || undefined,
        destino: destinoFinal,
        destinatario: destinatarioFinal || undefined,
        field_values: values,
        truck_id: truckId ? Number(truckId) : undefined,
      });
      // El viaje ya existe. Si la foto falla —la señal que se corta en el galpón— NO es "no se
      // pudo iniciar": se sigue a la pantalla del viaje, que muestra "Falta la foto de la carga"
      // con su botón para volver a sacarla. Antes el error de la foto caía en el mismo catch y le
      // decía al chofer que el viaje no había arrancado.
      if (file) await uploadPhoto(trip.id, file, PHOTO_KIND.CARGA).catch(() => undefined);
      navigate(`/viaje/${trip.id}`);
    } catch (e) {
      // Si la respuesta se perdió pero el viaje se creó, reintentar da "Todavía tenés un viaje sin
      // cerrar". Por eso, antes de mostrar un error, se busca el viaje abierto: si es de este mismo
      // viaje, se va a él en vez de decirle al chofer lo contrario de lo que pasó.
      const abierto = await api.get<Trip | null>("/trips/active").catch(() => null);
      if (abierto && abierto.template_id === tpl!.id) return navigate(`/viaje/${abierto.id}`);
      setError(e instanceof ApiError ? e.message : "No se pudo iniciar el viaje");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <Link to="/" className="text-sm text-ink/60 hover:text-ink">
        ← Volver
      </Link>
      <div>
        <div className="kicker">{tpl.provider_name}</div>
        <h1 className="text-3xl text-ink">{tpl.name}</h1>
        {tpl.origin && <p className="text-sm text-ink/60">Salida desde {tpl.origin}</p>}
      </div>

      <Card className="space-y-4">
        <Field label="Camión">
          <select className="input" value={truckId} onChange={(e) => setTruckId(e.target.value)}>
            {user?.truck_id == null && <option value="">Elegí el camión…</option>}
            {trucks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.plate}
                {t.id === user?.truck_id ? " (asignado)" : ""}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-ink/50">
            {user?.truck_id == null
              ? "No tenés camión asignado: elegí con cuál estás saliendo."
              : "Cambialo solo si hoy manejás otro camión."}
          </p>
        </Field>
        {/* La lista de viajes se arma con el camión asignado, pero acá lo puede cambiar. Si
            el que eligió no hace este viaje conviene decírselo ahora y no después de llenar
            todo: el alta lo va a rechazar igual. */}
        {haceElViaje === false && (
          <ErrorText>Este viaje no lo hace ese camión. Elegí otro camión o volvé atrás.</ErrorText>
        )}
        {/* Partes que la plantilla resuelve con la libreta. Las fijas ya vienen resueltas. */}
        {!recorridoPorCarga && cu.origen?.modo === CAMPO_MODO.LIBRETA && (
          <LibretaPicker
            tipo={cu.origen.libreta_tipo ?? "lugar"}
            label={cu.origen.label ?? "Origen / Lugar de carga"}
            value={libreta.origen ?? null}
            onChange={setLib("origen")}
            providerId={tpl.provider_id}
            permiteAlta={cu.origen.permite_alta !== false}
          />
        )}
        {/* Los "completar" de la planilla: lugares puntuales que cambian cada viaje. */}
        {!recorridoPorCarga && cu.origen?.modo === CAMPO_MODO.TEXTO && (
          <Field label={cu.origen.label ?? "Origen"}>
            <input
              className="input"
              value={textos.origen ?? ""}
              onChange={(e) => setTextos((p) => ({ ...p, origen: e.target.value }))}
              autoCapitalize="words"
            />
          </Field>
        )}
        {cu.remitente?.modo === CAMPO_MODO.TEXTO && (
          <Field label={cu.remitente.label ?? "Lugar de carga"}>
            <input
              className="input"
              value={textos.remitente ?? ""}
              onChange={(e) => setTextos((p) => ({ ...p, remitente: e.target.value }))}
              autoCapitalize="words"
            />
          </Field>
        )}
        {cu.remitente?.modo === CAMPO_MODO.LIBRETA && (
          <LibretaPicker
            tipo={cu.remitente.libreta_tipo ?? "remitente"}
            label={cu.remitente.label ?? "Remitente"}
            value={libreta.remitente ?? null}
            onChange={setLib("remitente")}
            providerId={tpl.provider_id}
            permiteAlta={cu.remitente.permite_alta !== false}
            soloSeleccionables
          />
        )}

        {/* El selector clásico sólo se dibuja si tiene algo adentro. Un desplegable con una
            única opción "Elegí…" no es un campo: es una pared. Le pasó al combinado genérico,
            que arma el recorrido con las cargas (`recorridoSegunCargas`) y por eso no configura
            destino ni `dest_options`; el chofer veía un campo obligatorio imposible de completar
            y no salía. La validación ya lo contemplaba —ver `recorridoPorCarga` arriba—, era el
            render el que no.

            La condición mira las opciones y NO `recorridoPorCarga`: las cuatro plantillas de Efe
            Roig también arman el recorrido por carga y sin embargo configuran destino de libreta
            a propósito. Colgarse de esa bandera se lo sacaba a las cuatro. */}
        {usaLibretaDestino ? (
          <>
            {destinoAlCerrar && (
              <p className="text-sm text-ink/60">El destino y dónde descargás se eligen al llegar.</p>
            )}
            {cu.destino?.modo === CAMPO_MODO.LIBRETA && !destinoAlCerrar && (
              <LibretaPicker
                tipo={cu.destino.libreta_tipo ?? "lugar"}
                label={cu.destino.label ?? "Destino"}
                value={libreta.destino ?? null}
                onChange={setLib("destino")}
                providerId={tpl.provider_id}
                permiteAlta={cu.destino.permite_alta !== false}
              />
            )}
            {cu.destino?.modo === CAMPO_MODO.TEXTO && !destinoAlCerrar && (
              <Field label={cu.destino.label ?? "Destino"}>
                <input
                  className="input"
                  value={textos.destino ?? ""}
                  onChange={(e) => setTextos((p) => ({ ...p, destino: e.target.value }))}
                  autoCapitalize="words"
                />
              </Field>
            )}
            {cu.destinatario?.modo === CAMPO_MODO.TEXTO && !destinatarioAlCerrar && (
              <Field label={cu.destinatario.label ?? "Lugar de descarga"}>
                <input
                  className="input"
                  value={textos.destinatario ?? ""}
                  onChange={(e) => setTextos((p) => ({ ...p, destinatario: e.target.value }))}
                  autoCapitalize="words"
                />
              </Field>
            )}
            {cu.destinatario?.modo === CAMPO_MODO.LIBRETA && !destinatarioAlCerrar && (
              <LibretaPicker
                tipo={cu.destinatario.libreta_tipo ?? "destinatario"}
                label={cu.destinatario.label ?? "Destinatario"}
                value={libreta.destinatario ?? null}
                onChange={setLib("destinatario")}
                providerId={tpl.provider_id}
                permiteAlta={cu.destinatario.permite_alta !== false}
              />
            )}
          </>
        ) : tpl.dest_options.length > 0 ? (
          <>
            <Field label="Destino">
              <select className="input" value={optIdx} onChange={(e) => setOptIdx(e.target.value)}>
                <option value="">Elegí…</option>
                {tpl.dest_options.map((o, i) => (
                  <option key={i} value={i}>
                    {o.destino}
                    {o.destinatario ? ` · ${o.destinatario}` : ""}
                  </option>
                ))}
              </select>
            </Field>
            {opt?.destinatario === "Otro" && (
              <Field label="¿Qué destinatario?">
                <input className="input" value={otroDest} onChange={(e) => setOtroDest(e.target.value)} />
              </Field>
            )}
          </>
        ) : null}
        {cargaFields.map((f) => (
          <CampoDePlantilla key={f.key} campo={f} valor={values[f.key] ?? ""} onChange={(v) => setVal(f.key, v)} />
        ))}
      </Card>

      {est && (
        <div className="border-l-4 border-l-st-blueDot bg-surface px-4 py-3">
          <div className="font-cond text-[12px] font-semibold uppercase tracking-[0.1em] text-brand-700">
            Tiempo estimado
          </div>
          <div className="font-cond text-2xl font-semibold text-ink">{fmtDuration(est.hours)}</div>
          <div className="text-xs text-ink/55">
            ≈ {est.km} km · llegada aprox. {etaClock(est.hours)}
          </div>
        </div>
      )}

      {/* En el combinado no va: cada carga trae la suya al registrarla. Y en los que tienen
          datos del puente tampoco: esa foto se saca en el puente. */}
      {!tpl.multi_renglon && !fotoEnElPuente && (
        <Card className="space-y-3">
          <Corners />
          <CameraCapture
            label={(tpl.carga_photo_label ?? "Foto de la carga") + (pideFoto ? "" : " (opcional)")}
            onChange={setFile}
          />
        </Card>
      )}

      <ErrorText>{error}</ErrorText>
      <Button
        variant="success"
        loading={busy}
        disabled={haceElViaje === false}
        onClick={confirm}
        className="w-full py-4 text-lg"
      >
        Confirmar salida →
      </Button>
    </div>
  );
}
