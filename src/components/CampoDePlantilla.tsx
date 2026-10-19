import { FIELD_TYPE, SI_NO, pesoSospechoso, type TripTemplate } from "@shared/domain";
import { Field } from "./ui";

type Campo = TripTemplate["fields"][number];

/**
 * Sí / No en dos botones grandes, para el celular en la ruta (el "Sobrepeso" de la zafra de arroz). Nada viene
 * elegido de entrada: un campo obligatorio no se contesta solo, y "obligatorio" es haber tocado uno. Se puede
 * cambiar de opinión tocando el otro.
 */
export function SiNoBotones({
  valor,
  onChange,
  etiqueta,
}: {
  valor: string;
  onChange: (v: string) => void;
  etiqueta: string;
}) {
  return (
    <div role="group" aria-label={etiqueta} className="grid grid-cols-2 gap-3">
      {[SI_NO.SI, SI_NO.NO].map((opcion) => {
        const elegido = valor === opcion;
        return (
          <button
            key={opcion}
            type="button"
            aria-pressed={elegido}
            onClick={() => onChange(opcion)}
            className={`h-16 border-2 font-cond text-xl font-bold uppercase tracking-[0.08em] transition-colors ${
              elegido ? "border-brand bg-brand text-white" : "border-ink/25 bg-surface text-ink/70 hover:border-brand"
            }`}
          >
            {opcion}
          </button>
        );
      })}
    </div>
  );
}

/** La etiqueta de un campo según sea obligatorio, opcional o de un grupo "alcanza con uno". */
export function etiquetaDeCampo(campo: Campo): string {
  return `${campo.label}${campo.requiere_uno_de ? " (alcanza con uno)" : campo.required ? "" : " (opcional)"}`;
}

/**
 * Un campo propio de la plantilla —remito, hoja de ruta, pallets, peso— como input.
 *
 * Lo usan la pantalla del chofer y el "Nuevo viaje" de oficina. Estaba escrito adentro de la
 * del chofer, y la oficina directamente no lo tenía: su formulario mandaba los campos vacíos,
 * así que toda plantilla con uno obligatorio se rebotaba con "Falta: …" y no se podía cargar
 * desde oficina. Uno solo para los dos, así el peso se tipea igual en las dos pantallas.
 */
export function CampoDePlantilla({
  campo,
  valor,
  onChange,
}: {
  campo: Campo;
  valor: string;
  onChange: (v: string) => void;
}) {
  if (campo.type === FIELD_TYPE.SI_NO) {
    return (
      <Field label={etiquetaDeCampo(campo)}>
        <SiNoBotones valor={valor} onChange={onChange} etiqueta={campo.label} />
      </Field>
    );
  }

  /* El peso va SIEMPRE en kilos enteros, como viene en el remito — el de Casarone
     marca "Neto 29.710". Antes el campo pedía toneladas y el papel decía kilos, así
     que unos convertían de cabeza y otros copiaban: en la base terminaron conviviendo
     29200 y 30000 con 29.539 y 29.7, con mil de diferencia entre unos y otros.
     Sin coma y con teclado numérico entero, ese error no se puede tipear. */
  const esPeso = !!campo.is_weight;
  const avisa = esPeso && pesoSospechoso(Number(valor));
  // Un campo agrupado ("alcanza con uno") no es obligatorio por sí solo, pero tampoco es
  // opcional sin más: llamarlo "opcional" es lo que llevaba a poner un 0 para no dejarlo en
  // blanco. El grupo entero exige uno, así que el label lo dice.
  const etiqueta = campo.requiere_uno_de
    ? " (alcanza con uno)"
    : campo.required
      ? ""
      : " (opcional)";
  return (
    <Field label={`${campo.label}${etiqueta}`}>
      <input
        className="input"
        type={campo.type === "numero" ? "number" : "text"}
        inputMode={esPeso ? "numeric" : campo.type === "numero" ? "decimal" : undefined}
        step={esPeso ? 1 : undefined}
        value={valor}
        onChange={(e) => onChange(esPeso ? e.target.value.replace(/[.,]/g, "") : e.target.value)}
      />
      {/* Avisa, no bloquea: si de verdad llevó 800 kilos, que pueda seguir. */}
      {avisa && (
        <p className="mt-1 text-sm text-st-amberTx">
          ¿{Number(valor).toLocaleString("es-UY")} kilos? Si son toneladas, poné el número
          completo — por ejemplo 29710, como figura en el remito.
        </p>
      )}
    </Field>
  );
}
