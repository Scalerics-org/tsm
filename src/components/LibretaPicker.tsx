import { useEffect, useMemo, useRef, useState } from "react";
import {
  TIPO_DEPARTAMENTO,
  normalizeNombre,
  type LibretaEntry,
  type PickerTipo,
} from "@shared/domain";
import { api, ApiError } from "../lib/api";
import { Spinner } from "./ui";

interface Props {
  /** Acepta también "departamento", que no sale de la libreta sino de su propia lista. */
  tipo: PickerTipo;
  label: string;
  value: LibretaEntry | null;
  onChange: (entry: LibretaEntry | null) => void;
  providerId?: number | null;
  /** Excluye agrupadores ("Varios"). Se usa en los renglones, donde el nombre debe ser real. */
  soloSeleccionables?: boolean;
  /** Permite dar de alta desde la ruta si el nombre no está en la libreta. */
  permiteAlta?: boolean;
  /**
   * Departamento ya elegido. Deja en la lista los lugares de ese departamento y los que
   * todavía no tienen ninguno, y el que se dé de alta nace con él.
   */
  departamentoId?: number | null;
  placeholder?: string;
}

/**
 * Selector de libreta: el chofer busca y elige de la lista curada; si no está,
 * lo agrega y sigue viaje sin trabarse. El alta entra como "nuevo" para que la
 * oficina la confirme (eso lo decide el backend, no este componente).
 */
export function LibretaPicker({
  tipo,
  label,
  value,
  onChange,
  providerId,
  soloSeleccionables = false,
  permiteAlta = true,
  departamentoId = null,
  placeholder = "Buscar o escribir…",
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [entries, setEntries] = useState<LibretaEntry[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const esDepartamento = tipo === TIPO_DEPARTAMENTO;

  const url = useMemo(() => {
    if (esDepartamento) return "/departamentos";
    const p = new URLSearchParams({ tipo });
    if (providerId != null) p.set("provider", String(providerId));
    if (soloSeleccionables) p.set("seleccionables", "1");
    if (departamentoId != null) p.set("departamento", String(departamentoId));
    return `/libreta?${p}`;
  }, [esDepartamento, tipo, providerId, soloSeleccionables, departamentoId]);

  // Si cambia el departamento, la lista que había ya no sirve: se descarta para que el
  // próximo abrir vuelva a pedirla. Sin esto, elegir Artigas después de Montevideo seguía
  // mostrando los de Montevideo.
  useEffect(() => {
    setEntries(null);
  }, [url]);

  useEffect(() => {
    if (!open || entries) return;
    api
      .get<LibretaEntry[]>(url)
      .then(setEntries)
      .catch(() => setEntries([]));
  }, [open, entries, url]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const filtradas = useMemo(() => {
    const list = entries ?? [];
    const key = normalizeNombre(query);
    if (!key) return list;
    return list.filter((e) => normalizeNombre(e.nombre).includes(key));
  }, [entries, query]);

  // Solo ofrecemos "agregar" si lo escrito no existe ya (comparando sin acentos ni mayúsculas).
  const yaExiste = useMemo(
    () => (entries ?? []).some((e) => normalizeNombre(e.nombre) === normalizeNombre(query)),
    [entries, query],
  );
  // Los 19 departamentos son una lista cerrada: no se dan de alta desde la ruta.
  const puedeAgregar = permiteAlta && !esDepartamento && query.trim().length >= 2 && !yaExiste;

  function seleccionar(entry: LibretaEntry) {
    onChange(entry);
    setOpen(false);
    setQuery("");
    setError("");
  }

  async function agregar() {
    setError("");
    setBusy(true);
    try {
      const nueva = await api.post<LibretaEntry>("/libreta", {
        tipo,
        nombre: query.trim(),
        provider_id: providerId ?? null,
        departamento_id: departamentoId,
      });
      setEntries((prev) => {
        const rest = (prev ?? []).filter((e) => e.id !== nueva.id);
        return [nueva, ...rest];
      });
      seleccionar(nueva);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo agregar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <span className="label">{label}</span>

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex h-12 w-full items-center justify-between border px-3 text-left ${
          value ? "border-ink/25 bg-bg text-ink" : "border-ink/20 bg-bg text-ink/45"
        }`}
      >
        <span className="truncate font-medium">{value ? value.nombre : "Elegí…"}</span>
        <span className="ml-2 flex-none text-ink/40">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="mt-1 border border-ink/20 bg-surface">
          <input
            ref={inputRef}
            className="h-12 w-full border-b border-ink/15 bg-bg px-3 outline-none placeholder:text-ink/35"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder}
            autoCapitalize="words"
          />

          <div className="max-h-60 overflow-y-auto">
            {entries === null ? (
              <div className="flex justify-center py-5">
                <Spinner size={20} />
              </div>
            ) : filtradas.length === 0 && !puedeAgregar ? (
              <p className="px-3 py-4 text-sm text-ink/50">
                {query
                  ? "No hay coincidencias."
                  : permiteAlta
                    ? "No hay lugares cargados todavía. Escribí el nombre acá arriba y lo agrego."
                    : "La libreta está vacía."}
              </p>
            ) : (
              filtradas.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => seleccionar(e)}
                  className="flex w-full items-center justify-between px-3 py-3 text-left hover:bg-bg"
                >
                  <span className="truncate text-ink">{e.nombre}</span>
                  {e.estado === "nuevo" && (
                    <span className="ml-2 flex-none font-cond text-[10px] font-semibold uppercase tracking-[0.1em] text-st-amberTx">
                      nuevo
                    </span>
                  )}
                </button>
              ))
            )}
          </div>

          {puedeAgregar && (
            <button
              type="button"
              onClick={agregar}
              disabled={busy}
              className="flex w-full items-center gap-2 border-t border-ink/15 bg-bg px-3 py-3 text-left font-semibold text-brand-700 disabled:opacity-50"
            >
              {busy ? <Spinner size={16} /> : <span className="text-lg leading-none">+</span>}
              <span className="truncate">Agregar “{query.trim()}”</span>
            </button>
          )}

          {error && <p className="border-t border-ink/15 bg-st-redBg px-3 py-2 text-sm text-st-redTx">{error}</p>}
        </div>
      )}
    </div>
  );
}
