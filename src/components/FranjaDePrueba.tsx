import { useEffect, useLayoutEffect, useRef, useState, type Ref } from "react";
import { ambienteDelServidor } from "../lib/ambiente";

/** La variable CSS con el alto de la franja: las barras fijas de la app la usan para quedar debajo. */
const VARIABLE_ALTO = "--franja-alto";

/** Sólo el dibujo: separado del pedido al servidor para poder mostrarlo y probarlo solo. */
export function FranjaVisible({ franja }: { franja?: Ref<HTMLDivElement> }) {
  return (
    <div
      ref={franja}
      role="status"
      className="fixed inset-x-0 top-0 z-[1000] bg-amber-400 px-3 py-1 text-center font-cond text-[12px] font-bold uppercase leading-tight tracking-[0.06em] text-black"
    >
      AMBIENTE DE PRUEBA — lo que cargues acá no es real
    </div>
  );
}

/**
 * Franja fija arriba de TODAS las pantallas (login, chofer y oficina) cuando la app corre en el
 * ambiente de prueba. En producción no dibuja nada y no toca el diseño.
 *
 * Es una franja fija y no una capa que tape: mide su propio alto (en el celular el texto puede
 * pasar a dos renglones) y lo publica en --franja-alto. El body baja ese alto y las barras
 * pegajosas (`top-[var(--franja-alto,0px)]`) quedan justo debajo, así no tapa ningún botón.
 */
export function FranjaDePrueba() {
  const [enPrueba, setEnPrueba] = useState(false);
  const franja = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let vigente = true;
    ambienteDelServidor().then((a) => vigente && setEnPrueba(a === "prueba"));
    return () => {
      vigente = false;
    };
  }, []);

  useLayoutEffect(() => {
    const el = franja.current;
    if (!enPrueba || !el) return;
    const raiz = document.documentElement;
    const medir = () => raiz.style.setProperty(VARIABLE_ALTO, `${el.offsetHeight}px`);
    medir();
    // Se vuelve a medir cada vez que la franja cambia de alto (girar el celular, cargar la tipografía,
    // achicar la ventana): medir sólo al girar dejaba un alto viejo si el cambio llegaba después.
    const observador = new ResizeObserver(medir);
    observador.observe(el);
    return () => {
      observador.disconnect();
      raiz.style.removeProperty(VARIABLE_ALTO);
    };
  }, [enPrueba]);

  return enPrueba ? <FranjaVisible franja={franja} /> : null;
}
