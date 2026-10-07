import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { InstalarApp } from "./InstalarApp";
import { AvisoVersionNueva } from "./AvisoVersionNueva";
import { AvisoReintentando } from "./AvisoReintentando";
import { ROLE_LABEL, ROLES } from "@shared/domain";

export function TruckMark({ size = 20, stroke = "#f2f2f3" }: { size?: number; stroke?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={stroke} strokeWidth={1.5}>
      <path d="M1 6h11v10H1z" />
      <path d="M12 9h4.5l3 3.5V16H12z" />
      <circle cx="6" cy="18" r="2" />
      <circle cx="17" cy="18" r="2" />
    </svg>
  );
}

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid h-9 w-9 flex-none place-items-center bg-brand">
        <TruckMark />
      </span>
      <span className="font-cond text-[22px] font-semibold tracking-[0.06em] text-bg">TSM</span>
    </div>
  );
}

interface NavItem {
  to: string;
  label: string;
}

/**
 * El menú va en grupos, no en una lista corrida.
 *
 * Eran nueve entradas y quedaron once cuando Clientes y Proveedores se separaron de la
 * Libreta. Once renglones iguales, uno abajo del otro, obligan a leerlos todos cada vez: no
 * hay forma de saltar directo a lo que se busca. Los grupos son los tres momentos distintos
 * en que se usa la app —mirar el día, curar los datos, administrar la empresa— y la mayoría
 * de los días sólo se toca el primero.
 *
 * El primero va sin título a propósito: es lo que se usa siempre y no necesita que le
 * expliquen qué es.
 */
interface NavGroup {
  titulo?: string;
  items: NavItem[];
}

/** Lo del día: lo ven operaciones y admin. */
const DIA: NavGroup = {
  items: [
      { to: "/panel", label: "Resumen" },
      { to: "/panel/control", label: "Control" },
      { to: "/panel/viajes", label: "Viajes" },
      { to: "/panel/resumen-cliente", label: "Por cliente" },
      // Maqueta del módulo de Taller (datos de ejemplo): sólo oficina, para que Rodrigo la toque.
      { to: "/panel/taller", label: "Taller (maqueta)" },
  ],
};

/**
 * Qué ve operaciones (rol encargado), según el dibujo de Rodrigo del 16/9: "todo Resumen, más
 * Choferes y Camiones". Plantillas, clientes, proveedores, lugares y usuarios quedan para admin:
 * son los datos con los que se arma y se factura cada viaje.
 */
const OPS_NAV: NavGroup[] = [
  DIA,
  {
    titulo: "Administración",
    items: [
      { to: "/admin/choferes", label: "Choferes" },
      { to: "/admin/camiones", label: "Camiones" },
    ],
  },
];

/**
 * Qué ve el "solo mirar": Viajes, Consumo, Camiones (sin ningún control de edición) y el Taller (maqueta).
 *
 * "A él le hacemos que vea SOLAMENTE LOS VIAJES (…). En principio solo viajes y ta, ahí le
 * queda bien facilito." — Rodrigo, 19/9. Y el 22/9: "Solo esas dos cosas: Viajes y Consumo."
 * Dos renglones no necesitan grupos ni títulos, y el Resumen no va porque es la pantalla que
 * además muestra cobros: el Consumo es su propia pantalla, sin eso.
 */
const LECTOR_NAV: NavGroup[] = [
  {
    items: [
      { to: "/panel/viajes", label: "Viajes" },
      { to: "/panel/consumo", label: "Consumo" },
      // 7/10/2026: Raúl, el mecánico, tiene que ver los camiones. Sólo mirar: la lista y la ficha no le muestran
      // ningún botón de edición y el servidor le contesta 403 a cualquier escritura.
      { to: "/admin/camiones", label: "Camiones" },
      { to: "/panel/taller", label: "Taller (maqueta)" },
    ],
  },
];

const ADMIN_NAV: NavGroup[] = [
  DIA,
  {
    titulo: "Datos",
    items: [
      { to: "/panel/plantillas", label: "Plantillas" },
      // Clientes y Proveedores separados: eran dos cosas distintas metidas en la misma
      // pantalla, y la palabra "cliente" significaba las dos según dónde se la mirara.
      { to: "/panel/clientes", label: "Clientes" },
      { to: "/panel/proveedores", label: "Proveedores" },
      { to: "/panel/libreta", label: "Lugares" },
    ],
  },
  {
    titulo: "Administración",
    items: [
      { to: "/admin/choferes", label: "Choferes" },
      { to: "/admin/camiones", label: "Camiones" },
      { to: "/admin/usuarios", label: "Usuarios" },
    ],
  },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (!user) return <>{children}</>;
  if (user.role === ROLES.CHOFER) return <ChoferShell>{children}</ChoferShell>;
  const grupos =
    user.role === ROLES.ADMIN ? ADMIN_NAV : user.role === ROLES.LECTOR ? LECTOR_NAV : OPS_NAV;
  return <DesktopShell grupos={grupos}>{children}</DesktopShell>;
}

// ── Chofer: móvil ──
function ChoferShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col bg-bg">
      <header className="sticky top-0 z-[500] flex items-center gap-3 bg-navy px-4 py-3">
        <Logo />
        <button
          onClick={() => {
            logout();
            navigate("/login");
          }}
          className="ml-auto text-right leading-tight"
        >
          <span className="block text-sm font-semibold text-bg">{user?.name}</span>
          <span className="block text-[11px] text-brand-400">Salir</span>
        </button>
      </header>
      <main className="flex-1 px-4 py-5 pb-24">
        <AvisoReintentando />
        <AvisoVersionNueva />
        <InstalarApp />
        {children}
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-[500] mx-auto grid max-w-md grid-cols-2 border-t border-ink/15 bg-surface">
        <BottomLink to="/" label="Viajes" icon="🚚" />
        <BottomLink to="/surtida" label="Surtida" icon="⛽" />
      </nav>
    </div>
  );
}

function BottomLink({ to, label, icon }: { to: string; label: string; icon: string }) {
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        `flex flex-col items-center justify-center gap-1 py-3 font-cond text-[12px] font-semibold uppercase tracking-[0.1em] ${
          isActive ? "border-t-[3px] border-brand text-brand-700" : "text-ink/50"
        }`
      }
    >
      <span className="text-lg leading-none">{icon}</span>
      {label}
    </NavLink>
  );
}

// ── Oficina: escritorio ──
function DesktopShell({ grupos, children }: { grupos: NavGroup[]; children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const doLogout = () => {
    logout();
    navigate("/login");
  };
  // En el celular la barra es horizontal y con scroll: ahí los títulos de grupo estorbarían
  // más de lo que ordenan, así que va corrida.
  const items = grupos.flatMap((g) => g.items);
  return (
    <div className="flex min-h-full">
      <aside className="sticky top-0 hidden h-screen w-60 flex-none flex-col bg-navy py-5 md:flex">
        <div className="px-5 pb-6">
          <Logo />
        </div>
        <nav className="flex flex-col">
          {grupos.map((g, i) => (
            <div key={g.titulo ?? "principal"} className={i > 0 ? "mt-5" : undefined}>
              {g.titulo && (
                <div className="px-5 pb-1.5 font-cond text-[11px] font-semibold uppercase tracking-[0.14em] text-bg/35">
                  {g.titulo}
                </div>
              )}
              {g.items.map((it) => (
                <NavLink
                  key={it.to}
                  to={it.to}
                  end={it.to === "/panel"}
                  className={({ isActive }) =>
                    `flex items-center gap-3 border-l-[3px] px-5 py-2.5 font-cond text-[15px] font-semibold uppercase tracking-[0.08em] ${
                      isActive ? "border-brand bg-brand/20 text-bg" : "border-transparent text-bg/65 hover:bg-white/5 hover:text-bg"
                    }`
                  }
                >
                  {it.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="mt-auto border-t border-white/10 px-5 pt-4">
          <div className="font-cond text-[13px] font-semibold uppercase tracking-[0.08em] text-bg">
            {user?.name}
          </div>
          {/* El rol con su nombre de pantalla. Decía `user.role` crudo y ahí abajo iba a
              quedar "lector", que no es como se le explicó a nadie: es "Solo mirar". */}
          <div className="mt-0.5 text-[12px] text-bg/55">{user ? ROLE_LABEL[user.role] : ""}</div>
          <button
            onClick={doLogout}
            className="mt-3 block font-cond text-[13px] font-semibold uppercase tracking-[0.08em] text-brand-400 hover:text-bg"
          >
            Cerrar sesión
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-[500] flex items-center gap-3 bg-navy px-4 py-3 md:hidden">
          <Logo />
          <button onClick={doLogout} className="ml-auto font-cond text-sm font-semibold uppercase tracking-[0.08em] text-brand-400">
            Salir
          </button>
        </header>
        <BarraDeMenuEnCelular items={items} />
        <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-6">
          <AvisoVersionNueva />
          <InstalarApp />
          {children}
        </main>
      </div>
    </div>
  );
}

/**
 * El menú de oficina en el celular: una barra que se desliza dentro de su propio lugar.
 *
 * Son hasta once opciones y entran cuatro, así que la quinta aparece cortada y nada dice que hay más:
 * Camiones, Choferes y Usuarios quedaban escondidas, y quien mira desde el teléfono podía creer que no
 * existen. Dos ayudas, sin cambiar cómo funciona la barra:
 *
 * - Un degradé en el borde donde hay más para ver. Se va cuando ya no hay más: si deslizó hasta el final,
 *   el de la derecha desaparece y aparece el de la izquierda. Un degradé que queda de más miente.
 *   Con un menú corto que entra entero (el del solo mirar) no aparece ninguno.
 * - La opción activa se centra al entrar a la pantalla: abrir Camiones, que está al final, la muestra
 *   marcada en vez de dejar la barra corrida al principio con la opción activa escondida.
 */
function BarraDeMenuEnCelular({ items }: { items: NavItem[] }) {
  const barra = useRef<HTMLElement>(null);
  const [hayMas, setHayMas] = useState({ izq: false, der: false });
  const { pathname } = useLocation();

  const medir = useCallback(() => {
    const el = barra.current;
    if (!el) return;
    // 1 px de tolerancia: el navegador redondea el scroll y en pantallas con zoom nunca llega justo.
    const izq = el.scrollLeft > 1;
    const der = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
    setHayMas((prev) => (prev.izq === izq && prev.der === der ? prev : { izq, der }));
  }, []);

  // Al entrar a una pantalla: la opción activa a la vista, en el medio.
  const centrarLaActiva = useCallback(() => {
    const el = barra.current;
    const activa = el?.querySelector<HTMLElement>('[aria-current="page"]');
    if (el && activa) {
      const centrada = activa.offsetLeft - (el.clientWidth - activa.offsetWidth) / 2;
      el.scrollLeft = Math.max(0, centrada);
    }
    medir();
  }, [medir]);

  useEffect(() => {
    centrarLaActiva();
    // Las opciones cambian de ancho cuando carga la tipografía del menú: centrada antes de eso, la
    // última (Usuarios) quedaba con el borde derecho cortado. Se vuelve a centrar cuando está lista.
    let vigente = true;
    document.fonts?.ready.then(() => vigente && centrarLaActiva());
    return () => {
      vigente = false;
    };
  }, [pathname, centrarLaActiva]);

  useEffect(() => {
    window.addEventListener("resize", medir);
    return () => window.removeEventListener("resize", medir);
  }, [medir]);

  const degradado = "pointer-events-none absolute inset-y-0 w-10 from-surface via-surface/80 to-transparent";
  return (
    <div className="relative md:hidden">
      <nav
        ref={barra}
        onScroll={medir}
        className="relative flex items-center gap-1 overflow-x-auto border-b border-ink/10 bg-surface px-3 py-2"
      >
        {items.map((it) => (
          <NavLink
            key={it.to}
            to={it.to}
            end={it.to === "/panel"}
            className={({ isActive }) =>
              `flex shrink-0 items-center gap-1.5 px-3 py-1.5 font-cond text-sm font-semibold uppercase tracking-[0.06em] ${
                isActive ? "bg-navy text-bg" : "text-ink/60"
              }`
            }
          >
            {it.label}
          </NavLink>
        ))}
      </nav>
      {hayMas.izq && <div aria-hidden className={`${degradado} left-0 bg-gradient-to-r`} />}
      {hayMas.der && <div aria-hidden className={`${degradado} right-0 bg-gradient-to-l`} />}
    </div>
  );
}
