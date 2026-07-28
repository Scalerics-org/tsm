import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./lib/auth";
import { ROLES, type Role } from "@shared/domain";
import { Spinner } from "./components/ui";
import { AppShell } from "./components/AppShell";
import { LoginPage } from "./features/auth/LoginPage";
import { ChoferHome } from "./features/chofer/ChoferHome";
import { ChoferClientePage } from "./features/chofer/ChoferClientePage";
import { StartTripPage } from "./features/chofer/StartTripPage";
import { ChoferTripPage } from "./features/chofer/ChoferTripPage";
import { FuelPage } from "./features/chofer/FuelPage";
import { OpsSummary } from "./features/operaciones/OpsSummary";
import { OpsTripsPage } from "./features/operaciones/OpsTripsPage";
import { OpsTripDetailPage } from "./features/operaciones/OpsTripDetailPage";
import { TemplatesPage } from "./features/operaciones/TemplatesPage";
import { ControlPage } from "./features/operaciones/ControlPage";
import { TruckDetailPage } from "./features/operaciones/TruckDetailPage";
import { DriverDetailPage } from "./features/operaciones/DriverDetailPage";
import { AdminDriversPage } from "./features/admin/AdminDriversPage";
import { AdminTrucksPage } from "./features/admin/AdminTrucksPage";
import { AdminUsersPage } from "./features/admin/AdminUsersPage";

function homePath(role: Role): string {
  return role === ROLES.CHOFER ? "/" : "/panel";
}

function RequireRole({ roles, children }: { roles: Role[]; children: JSX.Element }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (!roles.includes(user.role)) return <Navigate to={homePath(user.role)} replace />;
  return children;
}

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="grid min-h-full place-items-center">
        <Spinner size={32} />
      </div>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  const OPS: Role[] = [ROLES.ENCARGADO, ROLES.ADMIN];
  const CH: Role[] = [ROLES.CHOFER];

  return (
    <AppShell>
      <Routes>
        <Route path="/login" element={<Navigate to={homePath(user.role)} replace />} />

        {/* Chofer */}
        <Route path="/" element={<RequireRole roles={CH}><ChoferHome /></RequireRole>} />
        <Route path="/cliente/:providerId" element={<RequireRole roles={CH}><ChoferClientePage /></RequireRole>} />
        <Route path="/viaje/nuevo/:templateId" element={<RequireRole roles={CH}><StartTripPage /></RequireRole>} />
        <Route path="/viaje/:id" element={<RequireRole roles={CH}><ChoferTripPage /></RequireRole>} />
        <Route path="/surtida" element={<RequireRole roles={CH}><FuelPage /></RequireRole>} />

        {/* Oficina */}
        <Route path="/panel" element={<RequireRole roles={OPS}><OpsSummary /></RequireRole>} />
        <Route path="/panel/control" element={<RequireRole roles={OPS}><ControlPage /></RequireRole>} />
        <Route path="/panel/viajes" element={<RequireRole roles={OPS}><OpsTripsPage /></RequireRole>} />
        <Route path="/panel/viajes/:id" element={<RequireRole roles={OPS}><OpsTripDetailPage /></RequireRole>} />
        <Route path="/panel/camion/:id" element={<RequireRole roles={OPS}><TruckDetailPage /></RequireRole>} />
        <Route path="/panel/chofer/:id" element={<RequireRole roles={OPS}><DriverDetailPage /></RequireRole>} />
        <Route path="/panel/plantillas" element={<RequireRole roles={OPS}><TemplatesPage /></RequireRole>} />

        {/* Admin */}
        <Route path="/admin/choferes" element={<RequireRole roles={[ROLES.ADMIN]}><AdminDriversPage /></RequireRole>} />
        <Route path="/admin/camiones" element={<RequireRole roles={[ROLES.ADMIN]}><AdminTrucksPage /></RequireRole>} />
        <Route path="/admin/usuarios" element={<RequireRole roles={[ROLES.ADMIN]}><AdminUsersPage /></RequireRole>} />

        <Route path="*" element={<Navigate to={homePath(user.role)} replace />} />
      </Routes>
    </AppShell>
  );
}
