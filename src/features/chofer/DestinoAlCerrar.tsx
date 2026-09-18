import { useState } from "react";
import { CAMPO_MODO, type CampoUbicacion, type LibretaEntry, type PickerTipo } from "@shared/domain";
import type { PartesAlCerrar } from "@shared/en-ruta";
import { Field } from "../../components/ui";
import { LibretaPicker } from "../../components/LibretaPicker";

export interface DestinoElegido {
  destino: string;
  destinatario: string;
}

type Parte = keyof DestinoElegido;

const ETIQUETA: Record<Parte, string> = { destino: "Destino", destinatario: "Lugar de descarga" };
const LISTA_POR_DEFECTO: Record<Parte, PickerTipo> = { destino: "lugar", destinatario: "destinatario" };

/**
 * El destino que la plantilla deja para el cierre.
 *
 * "Cuando lleguen: departamento, donde descargo, kilos y foto." — Rodrigo. Se dibuja igual
 * que en la salida (StartTripPage): de la lista si es de libreta, escrito si es texto. Sólo
 * aparecen las partes que el viaje todavía no tiene; un viaje que salió antes del cambio ya
 * trae su destino y no se le vuelve a preguntar.
 */
export function DestinoAlCerrar({
  partes,
  providerId,
  onChange,
}: {
  partes: PartesAlCerrar;
  providerId: number | null;
  onChange: (v: DestinoElegido) => void;
}) {
  const [libreta, setLibreta] = useState<Partial<Record<Parte, LibretaEntry | null>>>({});
  const [textos, setTextos] = useState<Partial<Record<Parte, string>>>({});

  // Se avisa desde cada cambio y no con un efecto: `partes` se arma de nuevo en cada render
  // del padre, y un efecto colgado de eso dispararía el aviso en cada render, sin parar.
  function avisar(lib: typeof libreta, txt: typeof textos) {
    const valor = (p: Parte) =>
      partes[p]?.modo === CAMPO_MODO.TEXTO ? (txt[p] ?? "").trim() : lib[p]?.nombre ?? "";
    onChange({ destino: valor("destino"), destinatario: valor("destinatario") });
  }
  const setTexto = (p: Parte, v: string) => {
    const txt = { ...textos, [p]: v };
    setTextos(txt);
    avisar(libreta, txt);
  };
  const setEntrada = (p: Parte, e: LibretaEntry | null) => {
    const lib = { ...libreta, [p]: e };
    setLibreta(lib);
    avisar(lib, textos);
  };

  const render = (p: Parte, campo: CampoUbicacion | undefined) => {
    if (!campo) return null;
    const label = campo.label ?? ETIQUETA[p];
    if (campo.modo === CAMPO_MODO.TEXTO) {
      return (
        <Field key={p} label={label}>
          <input
            className="input"
            value={textos[p] ?? ""}
            onChange={(e) => setTexto(p, e.target.value)}
            autoCapitalize="words"
          />
        </Field>
      );
    }
    return (
      <LibretaPicker
        key={p}
        tipo={campo.libreta_tipo ?? LISTA_POR_DEFECTO[p]}
        label={label}
        value={libreta[p] ?? null}
        onChange={(e) => setEntrada(p, e)}
        providerId={providerId}
        permiteAlta={campo.permite_alta !== false}
      />
    );
  };

  return (
    <>
      {render("destino", partes.destino)}
      {render("destinatario", partes.destinatario)}
    </>
  );
}
