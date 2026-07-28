import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import { Card, Corners, Spinner } from "../../components/ui";
import { fmtDate } from "../../lib/format";

interface Alerts {
  overdue: {
    id: number;
    provider_name: string;
    origin: string;
    destination: string;
    driver_name?: string;
    truck_plate?: string;
    hours: number;
  }[];
  missingPhotos: {
    id: number;
    provider_name: string;
    origin: string;
    destination: string;
    driver_name: string;
    missing: string;
  }[];
  expiringLicenses: { driver_id: number; name: string; license_expiry: string; days: number }[];
  fuelAnomalies: {
    truck_id: number;
    plate: string;
    month: string;
    expected: number;
    actual: number;
    pct: number;
  }[];
}

function Section({
  title,
  count,
  accent,
  empty,
  children,
}: {
  title: string;
  count: number;
  accent: "red" | "amber" | "blue";
  empty: string;
  children: React.ReactNode;
}) {
  const border = { red: "border-l-st-redDot", amber: "border-l-st-amberDot", blue: "border-l-st-blueDot" }[accent];
  const tx = { red: "text-st-redTx", amber: "text-st-amberTx", blue: "text-brand-700" }[accent];
  return (
    <Card className={`border-l-4 ${border}`}>
      <Corners />
      <div className="mb-2 flex items-center justify-between">
        <h2 className={`font-cond text-lg font-semibold ${tx}`}>{title}</h2>
        <span className={`font-cond text-2xl font-semibold ${count > 0 ? tx : "text-ink/30"}`}>{count}</span>
      </div>
      {count === 0 ? <p className="text-sm text-ink/50">{empty}</p> : <div className="space-y-1">{children}</div>}
    </Card>
  );
}

const Row = ({ to, left, right }: { to?: string; left: React.ReactNode; right: React.ReactNode }) => {
  const inner = (
    <div className="flex items-center justify-between gap-3 border-t border-ink/10 py-2 text-sm first:border-t-0">
      <span className="text-ink">{left}</span>
      <span className="shrink-0 text-ink/60">{right}</span>
    </div>
  );
  return to ? (
    <Link to={to} className="block hover:bg-surface">
      {inner}
    </Link>
  ) : (
    inner
  );
};

export function ControlPage() {
  const [a, setA] = useState<Alerts | null>(null);

  useEffect(() => {
    api.get<Alerts>("/reports/alerts").then(setA).catch(() => setA(null));
  }, []);

  if (!a) return <Spinner size={28} />;

  return (
    <div className="space-y-4">
      <div>
        <div className="kicker">Alertas</div>
        <h1 className="text-3xl text-ink">Control</h1>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section
          title="Viajes atrasados / sin cerrar"
          count={a.overdue.length}
          accent="red"
          empty="Ningún viaje lleva más de 24 h sin cerrar."
        >
          {a.overdue.map((t) => (
            <Row
              key={t.id}
              to={`/panel/viajes/${t.id}`}
              left={
                <>
                  {t.origin} → {t.destination}
                  <span className="text-ink/50"> · {t.driver_name}</span>
                </>
              }
              right={`${t.hours} h`}
            />
          ))}
        </Section>

        <Section
          title="Viajes sin foto"
          count={a.missingPhotos.length}
          accent="amber"
          empty="Todos los viajes completados tienen su evidencia."
        >
          {a.missingPhotos.map((t) => (
            <Row
              key={t.id}
              to={`/panel/viajes/${t.id}`}
              left={
                <>
                  {t.origin} → {t.destination}
                  <span className="text-ink/50"> · {t.driver_name}</span>
                </>
              }
              right={`falta ${t.missing}`}
            />
          ))}
        </Section>

        <Section
          title="Licencias por vencer"
          count={a.expiringLicenses.length}
          accent="amber"
          empty="Ninguna licencia vence en los próximos 60 días."
        >
          {a.expiringLicenses.map((d) => (
            <Row
              key={d.driver_id}
              to={`/panel/chofer/${d.driver_id}`}
              left={d.name}
              right={
                <span className={d.days < 0 ? "text-st-redTx" : ""}>
                  {d.days < 0 ? `vencida (${fmtDate(d.license_expiry)})` : `${d.days} días`}
                </span>
              }
            />
          ))}
        </Section>

        <Section
          title="Consumo anómalo"
          count={a.fuelAnomalies.length}
          accent="red"
          empty="Ningún camión supera su rendimiento esperado."
        >
          {a.fuelAnomalies.map((t) => (
            <Row
              key={t.truck_id}
              to={`/panel/camion/${t.truck_id}`}
              left={
                <>
                  {t.plate}
                  <span className="text-ink/50"> · {t.month}</span>
                </>
              }
              right={
                <span className="text-st-redTx">
                  {t.actual} vs {t.expected} L/100 (+{t.pct}%)
                </span>
              }
            />
          ))}
        </Section>
      </div>
    </div>
  );
}
