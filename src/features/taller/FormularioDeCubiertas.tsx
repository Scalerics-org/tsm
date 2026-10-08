import { useState, type FormEvent } from "react";
import { MODELOS } from "./base";
import { HOY } from "./datos";
import type { CubiertaEnStock } from "./datos-extra";
import { nuevoIdDeStock, numeroDeCantidad } from "./stock-consumibles";
import { altaDeCubiertas, erroresDeCubiertas, type DatosDeCompraDeCubiertas } from "./stock-cubiertas";
import { Campo, Errores } from "./CamposDeStock";

/**
 * El alta de una compra de cubiertas: un modelo, cuántas, y un código opcional por cada una. Todas son de la misma compra
 * (misma fecha, proveedor y estado). `existentes` son los códigos que ya hay en el stock, para no repetir ninguno.
 */
export function FormularioDeAltaDeCubiertas({
  existentes,
  onGuardar,
  onCancelar,
}: {
  existentes: string[];
  onGuardar: (nuevas: CubiertaEnStock[]) => void;
  onCancelar: () => void;
}) {
  const [datos, setDatos] = useState<DatosDeCompraDeCubiertas>({ modeloId: "multi", estado: "nueva", fecha: HOY, proveedor: "", obs: "" });
  const [cantidad, setCantidad] = useState("1");
  const [codigos, setCodigos] = useState<string[]>([""]);
  const [errores, setErrores] = useState<string[]>([]);
  const cambiar = (parcial: Partial<DatosDeCompraDeCubiertas>) => setDatos((d) => ({ ...d, ...parcial }));

  // Una casilla de código por cubierta: si cambia la cantidad, se agregan o se quitan casillas sin perder lo escrito.
  const cambiarCantidad = (texto: string) => {
    const soloNumeros = texto.replace(/\D/g, "");
    setCantidad(soloNumeros);
    const n = Math.min(30, Math.max(0, Math.floor(numeroDeCantidad(soloNumeros))));
    setCodigos((previos) => Array.from({ length: n }, (_, i) => previos[i] ?? ""));
  };
  const cambiarCodigo = (i: number, valor: string) => setCodigos((previos) => previos.map((c, k) => (k === i ? valor : c)));

  function guardar(e: FormEvent) {
    e.preventDefault();
    const hallados = erroresDeCubiertas(datos, codigos, existentes);
    setErrores(hallados);
    if (hallados.length > 0) return;
    onGuardar(altaDeCubiertas(datos, codigos, () => nuevoIdDeStock("st")));
  }

  return (
    <form onSubmit={guardar} className="panel space-y-4 p-4" aria-label="Alta de cubiertas compradas">
      <div className="kicker">Cubiertas compradas</div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo titulo="Modelo">
          <select className="input min-h-[44px]" value={datos.modeloId} onChange={(e) => cambiar({ modeloId: e.target.value })}>
            {Object.values(MODELOS).map((m) => (
              <option key={m.id} value={m.id}>
                {m.nombre} · {m.medida}
              </option>
            ))}
          </select>
        </Campo>
        <Campo titulo="Estado">
          <select className="input min-h-[44px]" value={datos.estado} onChange={(e) => cambiar({ estado: e.target.value as "nueva" | "usada" })}>
            <option value="nueva">Nueva</option>
            <option value="usada">Usada</option>
          </select>
        </Campo>
        <Campo titulo="Cuántas">
          <input inputMode="numeric" className="input min-h-[44px] tabular-nums" value={cantidad} onChange={(e) => cambiarCantidad(e.target.value)} />
        </Campo>
        <Campo titulo="Fecha de compra">
          <input type="date" className="input min-h-[44px]" value={datos.fecha} onChange={(e) => cambiar({ fecha: e.target.value })} />
        </Campo>
        <Campo titulo="Proveedor (opcional)">
          <input className="input min-h-[44px]" value={datos.proveedor} onChange={(e) => cambiar({ proveedor: e.target.value })} />
        </Campo>
        <Campo titulo="Observaciones">
          <input className="input min-h-[44px]" value={datos.obs} onChange={(e) => cambiar({ obs: e.target.value })} />
        </Campo>
      </div>

      {codigos.length > 0 && (
        <fieldset>
          <legend className="label">Código de cada una (opcional, se puede dejar vacío)</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {codigos.map((c, i) => (
              <input
                key={i}
                aria-label={`Código de la cubierta ${i + 1}`}
                placeholder={`Cubierta ${i + 1}`}
                className="input min-h-[44px]"
                value={c}
                onChange={(e) => cambiarCodigo(i, e.target.value)}
              />
            ))}
          </div>
        </fieldset>
      )}

      <Errores errores={errores} />
      <div className="flex flex-wrap gap-3">
        <button type="submit" className="btn btn-primary min-h-[44px]">
          Agregar {codigos.length === 1 ? "cubierta" : `${codigos.length} cubiertas`}
        </button>
        <button type="button" onClick={onCancelar} className="btn btn-secondary min-h-[44px]">
          Cancelar
        </button>
      </div>
    </form>
  );
}

/** Editar una cubierta del stock: su código, modelo, estado, fecha, proveedor y observaciones. El recorrido no se toca. */
export function FormularioDeEdicionDeCubierta({
  c,
  existentes,
  onGuardar,
  onCancelar,
}: {
  c: CubiertaEnStock;
  existentes: string[];
  onGuardar: (cambios: Partial<Pick<CubiertaEnStock, "codigo" | "modeloId" | "estado" | "desde" | "proveedor" | "obs">>) => void;
  onCancelar: () => void;
}) {
  const [codigo, setCodigo] = useState(c.codigo);
  const [modeloId, setModeloId] = useState(c.modeloId);
  const [estado, setEstado] = useState<"nueva" | "usada">(c.estado);
  const [fecha, setFecha] = useState(c.desde ?? HOY);
  const [proveedor, setProveedor] = useState(c.proveedor ?? "");
  const [obs, setObs] = useState(c.obs);
  const [errores, setErrores] = useState<string[]>([]);

  function guardar(e: FormEvent) {
    e.preventDefault();
    const datos = { modeloId, estado, fecha, proveedor, obs };
    const hallados = erroresDeCubiertas(datos, [codigo], existentes);
    setErrores(hallados);
    if (hallados.length > 0) return;
    onGuardar({ codigo, modeloId, estado, desde: fecha, proveedor: proveedor.trim() || undefined, obs });
  }

  return (
    <form onSubmit={guardar} className="panel space-y-4 p-4" aria-label="Editar cubierta">
      <div className="kicker">Editar cubierta</div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo titulo="Código (opcional)">
          <input className="input min-h-[44px]" value={codigo} onChange={(e) => setCodigo(e.target.value)} />
        </Campo>
        <Campo titulo="Modelo">
          <select className="input min-h-[44px]" value={modeloId} onChange={(e) => setModeloId(e.target.value)}>
            {Object.values(MODELOS).map((m) => (
              <option key={m.id} value={m.id}>
                {m.nombre} · {m.medida}
              </option>
            ))}
          </select>
        </Campo>
        <Campo titulo="Estado">
          <select className="input min-h-[44px]" value={estado} onChange={(e) => setEstado(e.target.value as "nueva" | "usada")}>
            <option value="nueva">Nueva</option>
            <option value="usada">Usada</option>
          </select>
        </Campo>
        <Campo titulo="Fecha de compra">
          <input type="date" className="input min-h-[44px]" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </Campo>
        <Campo titulo="Proveedor (opcional)">
          <input className="input min-h-[44px]" value={proveedor} onChange={(e) => setProveedor(e.target.value)} />
        </Campo>
        <Campo titulo="Observaciones">
          <input className="input min-h-[44px]" value={obs} onChange={(e) => setObs(e.target.value)} />
        </Campo>
      </div>
      <Errores errores={errores} />
      <div className="flex flex-wrap gap-3">
        <button type="submit" className="btn btn-primary min-h-[44px]">
          Guardar cambios
        </button>
        <button type="button" onClick={onCancelar} className="btn btn-secondary min-h-[44px]">
          Cancelar
        </button>
      </div>
    </form>
  );
}
