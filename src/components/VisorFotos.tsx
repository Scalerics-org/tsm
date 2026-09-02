import { useCallback, useEffect, useRef, useState } from "react";
import { fetchPhotoUrl } from "../lib/api";

export interface FotoDelVisor {
  r2_key: string;
  titulo: string;
  detalle?: string;
}

/**
 * Descarga una foto de R2 con el token y devuelve una URL utilizable.
 *
 * Está acá y no dentro del <img> porque la usan la miniatura y el visor: el mismo
 * object URL se revoca cuando el componente se va, y si cada uno lo manejara por su lado
 * uno le revocaría la imagen al otro.
 */
export function useFotoUrl(r2Key: string | null) {
  const [url, setUrl] = useState<string | null>(null);
  const [falló, setFalló] = useState(false);

  useEffect(() => {
    if (!r2Key) return;
    let vigente = true;
    let objectUrl: string | null = null;
    setFalló(false);
    setUrl(null);
    fetchPhotoUrl(r2Key)
      .then((u) => {
        if (!vigente) {
          if (u) URL.revokeObjectURL(u);
          return;
        }
        if (!u) return setFalló(true);
        objectUrl = u;
        setUrl(u);
      })
      .catch(() => vigente && setFalló(true));
    return () => {
      vigente = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [r2Key]);

  return { url, falló };
}

const ZOOM_MIN = 1;
const ZOOM_MAX = 6;

/**
 * El visor de fotos de la oficina: pantalla completa, con zoom y rotación.
 *
 * "Estaría bueno que en la parte de oficina Rodrigo pueda agrandar las fotos, porque hoy no
 * se puede." Las miniaturas van recortadas (`object-cover`) y de un remito se ve un pedazo,
 * así que la evidencia estaba pero no se podía leer.
 *
 * LA ROTACIÓN NO ES UN ADORNO. Los remitos se fotografían donde el chofer puede: sobre el
 * asiento, sobre una cama, apoyados en el volante. De los dos que hay en producción, el de
 * SAMAN está tomado de costado — agrandarlo sin poder girarlo no sirve para leer los kilos.
 *
 * El zoom arranca en 1 y llega a 6: un número de remito escrito a mano en papel químico
 * necesita bastante aumento para despejar la duda entre un 3 y un 9.
 */
export function VisorFotos({
  fotos,
  indice,
  onCerrar,
}: {
  fotos: FotoDelVisor[];
  indice: number;
  onCerrar: () => void;
}) {
  const [i, setI] = useState(indice);
  const [zoom, setZoom] = useState(1);
  const [giro, setGiro] = useState(0);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const arrastre = useRef<{ x: number; y: number } | null>(null);

  const foto = fotos[i];
  const { url, falló } = useFotoUrl(foto?.r2_key ?? null);

  // Cambiar de foto vuelve todo a cero: heredar el zoom de la anterior deja al que mira
  // frente a un pedazo de una imagen que todavía no vio entera.
  const ir = useCallback(
    (n: number) => {
      setI(((n % fotos.length) + fotos.length) % fotos.length);
      setZoom(1);
      setGiro(0);
      setPan({ x: 0, y: 0 });
    },
    [fotos.length],
  );

  useEffect(() => {
    const teclas = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCerrar();
      if (e.key === "ArrowRight" && fotos.length > 1) ir(i + 1);
      if (e.key === "ArrowLeft" && fotos.length > 1) ir(i - 1);
      if (e.key === "r" || e.key === "R") setGiro((g) => (g + 90) % 360);
      if (e.key === "+" || e.key === "=") setZoom((z) => Math.min(ZOOM_MAX, z + 0.5));
      if (e.key === "-") setZoom((z) => Math.max(ZOOM_MIN, z - 0.5));
    };
    window.addEventListener("keydown", teclas);
    // Sin esto la página de atrás sigue scrolleando bajo el visor.
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", teclas);
      document.body.style.overflow = overflow;
    };
  }, [i, ir, fotos.length, onCerrar]);

  if (!foto) return null;

  const zoomear = (delta: number) =>
    setZoom((z) => {
      const nuevo = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z + delta));
      if (nuevo === 1) setPan({ x: 0, y: 0 });
      return nuevo;
    });

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-navy/95"
      role="dialog"
      aria-modal="true"
      aria-label={foto.titulo}
    >
      {/* Barra: qué se está mirando y los controles. */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/15 px-4 py-3">
        <div className="min-w-0">
          <div className="truncate font-cond text-lg font-semibold text-white">{foto.titulo}</div>
          {foto.detalle && <div className="truncate text-sm text-white/60">{foto.detalle}</div>}
        </div>

        <div className="flex items-center gap-1">
          <Boton onClick={() => zoomear(-0.5)} titulo="Alejar" disabled={zoom <= ZOOM_MIN}>
            −
          </Boton>
          <span className="w-14 text-center font-cond text-sm tabular-nums text-white/70">
            {Math.round(zoom * 100)}%
          </span>
          <Boton onClick={() => zoomear(0.5)} titulo="Acercar" disabled={zoom >= ZOOM_MAX}>
            +
          </Boton>
          <Boton onClick={() => setGiro((g) => (g + 90) % 360)} titulo="Girar (R)">
            ⟳
          </Boton>
          {url && (
            <a
              href={url}
              download={`${foto.titulo}.jpg`}
              className="grid h-9 w-9 place-items-center border border-white/25 text-white/80 hover:bg-white/10"
              title="Descargar"
            >
              ↓
            </a>
          )}
          <Boton onClick={onCerrar} titulo="Cerrar (Esc)">
            ✕
          </Boton>
        </div>
      </div>

      {/* La imagen. */}
      <div
        className="relative flex flex-1 items-center justify-center overflow-hidden"
        onWheel={(e) => zoomear(e.deltaY < 0 ? 0.3 : -0.3)}
        onPointerDown={(e) => {
          if (zoom <= 1) return;
          arrastre.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!arrastre.current) return;
          setPan({ x: e.clientX - arrastre.current.x, y: e.clientY - arrastre.current.y });
        }}
        onPointerUp={() => (arrastre.current = null)}
        style={{ cursor: zoom > 1 ? (arrastre.current ? "grabbing" : "grab") : "default" }}
      >
        {falló ? (
          <p className="text-white/60">No se pudo cargar la imagen.</p>
        ) : !url ? (
          <div className="h-16 w-16 animate-pulse bg-white/10" />
        ) : (
          <img
            src={url}
            alt={foto.titulo}
            draggable={false}
            className="max-h-full max-w-full select-none"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom}) rotate(${giro}deg)`,
              transition: arrastre.current ? "none" : "transform 120ms ease-out",
            }}
          />
        )}

        {fotos.length > 1 && (
          <>
            <Flecha lado="izq" onClick={() => ir(i - 1)} />
            <Flecha lado="der" onClick={() => ir(i + 1)} />
          </>
        )}
      </div>

      {fotos.length > 1 && (
        <div className="border-t border-white/15 py-2 text-center font-cond text-sm text-white/60">
          {i + 1} de {fotos.length}
        </div>
      )}
    </div>
  );
}

function Boton({
  children,
  onClick,
  titulo,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  titulo: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={titulo}
      aria-label={titulo}
      disabled={disabled}
      className="grid h-9 w-9 place-items-center border border-white/25 text-lg text-white/80 hover:bg-white/10 disabled:opacity-30"
    >
      {children}
    </button>
  );
}

function Flecha({ lado, onClick }: { lado: "izq" | "der"; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={lado === "izq" ? "Anterior" : "Siguiente"}
      className={`absolute top-1/2 -translate-y-1/2 grid h-12 w-12 place-items-center bg-black/40 text-2xl text-white/80 hover:bg-black/60 ${
        lado === "izq" ? "left-3" : "right-3"
      }`}
    >
      {lado === "izq" ? "‹" : "›"}
    </button>
  );
}
