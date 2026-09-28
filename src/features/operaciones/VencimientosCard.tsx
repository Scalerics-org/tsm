import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { AvisoDeVencimiento } from "@shared/vencimientos";
import { api, mensajeDe } from "../../lib/api";
import { Card } from "../../components/ui";
import { fmtDate } from "../../lib/format";

interface Respuesta {
  dias_para_avisar: number;
  avisos: AvisoDeVencimiento[];
}

/**
 * Documentos vencidos o por vencer, en el Resumen, que es la pantalla que Rodrigo abre todos los días.
 *
 * "SOA del GTP 4382 vence en 12 días": qué, de quién y cuándo, sin códigos. Ámbar cuando faltan
 * hasta 30 días, rojo cuando ya venció. Un vencimiento que sólo se ve entrando a la ficha no lo ve
 * nadie hasta que el camión está parado en la ruta.
 *
 * SÓLO AVISA. No frena ninguna salida: un camión con el SOA vencido sale igual.
 *
 * Sin nada vencido ni por vencer no se muestra: cero avisos es la noticia buena, y una tarjeta
 * vacía en el Resumen sería ruido. Es un pedido aparte del resumen: si falla, el Resumen sigue
 * cargando y esto lo dice en una línea, en vez de callarse (un aviso que no llega sin decir que
 * no llegó es peor que no tenerlo).
 */
export function VencimientosCard() {
  const [r, setR] = useState<Respuesta | null>(null);
  const [falló, setFalló] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    api
      .get<Respuesta>("/reports/vencimientos")
      .then((x) => vigente && setR(x))
      .catch((e) => vigente && setFalló(mensajeDe(e, "No se pudieron cargar los vencimientos.")));
    return () => {
      vigente = false;
    };
  }, []);

  if (falló) {
    return <p className="text-sm text-ink/50">No se pudieron revisar los vencimientos de documentos: {falló}</p>;
  }
  if (!r || r.avisos.length === 0) return null;

  const vencidos = r.avisos.filter((a) => a.estado === "vencido").length;
  return (
    <Card className="space-y-3">
      <div>
        <h2 className="font-cond text-lg font-semibold text-ink">Documentos por vencer</h2>
        <p className="text-sm text-ink/60">
          {vencidos > 0 ? `${vencidos} ya vencido${vencidos > 1 ? "s" : ""}. ` : ""}
          Avisamos desde {r.dias_para_avisar} días antes. Es un aviso: no impide que el camión salga.
        </p>
      </div>
      <ul className="space-y-1.5">
        {r.avisos.map((a) => (
          <li
            key={`${a.de}-${a.id}-${a.documento}`}
            className={`border-l-4 px-3 py-2 text-sm ${
              a.estado === "vencido"
                ? "border-l-st-redDot bg-st-redBg text-st-redTx"
                : "border-l-st-amberDot bg-st-amberBg text-st-amberTx"
            }`}
          >
            <Link
              to={a.de === "camion" ? `/panel/camion/${a.id}` : `/panel/chofer/${a.id}`}
              className="font-medium hover:underline"
            >
              {a.texto}
            </Link>
            <span className="ml-2 text-ink/50">({fmtDate(a.fecha)})</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
