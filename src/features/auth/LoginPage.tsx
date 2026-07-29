import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../lib/auth";
import { ApiError } from "../../lib/api";
import { TruckMark } from "../../components/AppShell";

type Mode = "chofer" | "oficina";

export function LoginPage() {
  const { loginDriver, loginOffice } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("chofer");
  const [plate, setPlate] = useState("");
  const [pin, setPin] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (mode === "chofer") await loginDriver(plate, pin);
      else await loginOffice(email, password);
      navigate("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo iniciar sesión");
    } finally {
      setLoading(false);
    }
  }

  const inputCls =
    "h-12 w-full border border-bg/25 bg-bg/[.08] px-3 text-bg outline-none placeholder:text-bg/40 focus:border-brand";
  const labelCls =
    "mb-2 block font-cond text-[12px] font-semibold uppercase tracking-[0.12em] text-bg/65";

  return (
    <div className="grid min-h-full place-items-center bg-bg px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="blueprint elev-md bg-navy p-7">
          <i className="corner tl" />
          <i className="corner tr" />
          <i className="corner bl" />
          <i className="corner br" />

          <div className="mb-6 flex items-center gap-3">
            <span className="grid h-11 w-11 flex-none place-items-center bg-brand">
              <TruckMark size={24} />
            </span>
            <div>
              <div className="font-cond text-3xl font-semibold leading-none tracking-[0.04em] text-bg">
                FLETA
              </div>
              <p className="mt-1 text-[13px] text-bg/60">Control de viajes de flota</p>
            </div>
          </div>

          {/* Selector de modo */}
          <div className="mb-5 grid grid-cols-2 border border-bg/20">
            {(["chofer", "oficina"] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m);
                  setError("");
                }}
                className={`py-2.5 font-cond text-sm font-semibold uppercase tracking-[0.08em] ${
                  mode === m ? "bg-brand text-bg" : "text-bg/60"
                }`}
              >
                {m === "chofer" ? "Chofer" : "Oficina"}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="flex flex-col gap-4">
            {mode === "chofer" ? (
              <>
                <div>
                  <label className={labelCls}>Patente del camión</label>
                  <input
                    className={inputCls}
                    value={plate}
                    onChange={(e) => setPlate(e.target.value)}
                    placeholder="STZ 4821"
                    autoCapitalize="characters"
                    required
                  />
                </div>
                <div>
                  <label className={labelCls}>PIN</label>
                  <input
                    className={`${inputCls} tracking-[0.4em]`}
                    type="password"
                    inputMode="numeric"
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                    placeholder="••••"
                    required
                  />
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className={labelCls}>Email</label>
                  <input
                    className={inputCls}
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="tu@empresa.uy"
                    required
                  />
                </div>
                <div>
                  <label className={labelCls}>Contraseña</label>
                  <input
                    className={inputCls}
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                  />
                </div>
              </>
            )}

            {error && (
              <p className="border-l-4 border-st-redDot bg-st-redBg px-3 py-2 text-sm text-st-redTx">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-1 h-14 border border-brand bg-brand font-cond text-xl font-semibold uppercase tracking-[0.08em] text-bg transition hover:bg-brand-600 disabled:opacity-50"
            >
              {loading ? "Ingresando…" : "Entrar"}
            </button>
          </form>
        </div>

        <div className="panel mt-6 p-4 text-sm">
          <i className="corner tl" />
          <i className="corner br" />
          <p className="mb-2 font-cond font-semibold uppercase tracking-[0.1em] text-brand-700">
            Usuarios de demo
          </p>
          {mode === "chofer" ? (
            <ul className="space-y-1.5">
              {[
                { name: "Carlos", plate: "STZ 4821" },
                { name: "Marta", plate: "BQL 7390" },
                { name: "Diego", plate: "MRC 1177" },
              ].map((d) => (
                <li key={d.plate} className="flex items-center justify-between gap-2">
                  <span className="text-ink/55">{d.name}</span>
                  <button
                    type="button"
                    className="font-mono text-brand-700 hover:underline"
                    onClick={() => {
                      setPlate(d.plate);
                      setPin("1234");
                    }}
                  >
                    {d.plate} · PIN 1234
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <ul className="space-y-1.5">
              {[
                { rol: "Encargado", email: "ops@demo.uy" },
                { rol: "Administrador", email: "admin@demo.uy" },
              ].map((u) => (
                <li key={u.email} className="flex items-center justify-between gap-2">
                  <span className="text-ink/55">{u.rol}</span>
                  <button
                    type="button"
                    className="font-mono text-brand-700 hover:underline"
                    onClick={() => {
                      setEmail(u.email);
                      setPassword("demo1234");
                    }}
                  >
                    {u.email} · demo1234
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
