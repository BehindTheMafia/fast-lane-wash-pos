import { useState, ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Link, useLocation, Navigate } from "react-router-dom";
import { useBusinessLine } from "@/contexts/BusinessLineContext";
import { useBusinessSettings } from "@/hooks/useBusinessSettings";
import { BUSINESS_LINE_LABELS, type BusinessLine } from "@/lib/businessLine";

interface NavItem {
  label: string;
  icon: string;
  path: string;
  adminOnly?: boolean;
  adminOrOwner?: boolean;
  adminOrOwnerOrCajero?: boolean;
  carWashOnly?: boolean;
  barbershopOnly?: boolean;
  barbershopOnlyAdminOrOwner?: boolean;
}

const navItems: NavItem[] = [
  { label: "POS", icon: "fa-cash-register", path: "/pos" },
  { label: "Dashboard", icon: "fa-chart-pie", path: "/dashboard", adminOrOwnerOrCajero: true },
  { label: "Reportes", icon: "fa-file-lines", path: "/reports", adminOrOwner: true },
  { label: "Cierre de Caja", icon: "fa-vault", path: "/cash-close" },
  { label: "Clientes", icon: "fa-users", path: "/customers" },
  { label: "Membresías", icon: "fa-id-card", path: "/memberships", carWashOnly: true },
  { label: "Recordatorios", icon: "fa-bell", path: "/reminders", carWashOnly: true },
  { label: "Inventario", icon: "fa-boxes-stacked", path: "/inventory", adminOrOwner: true },
  { label: "Servicios", icon: "fa-list-check", path: "/services", adminOnly: true },
  { label: "Configuración", icon: "fa-gear", path: "/settings", adminOnly: true },
];

function BusinessLineSelector({ compact }: { compact?: boolean }) {
  const { businessLine, setBusinessLine, carWashVisible, barbershopVisible } = useBusinessLine();

  if (!carWashVisible || !barbershopVisible) return null;

  const btn = (line: BusinessLine, icon: string) => (
    <button
      key={line}
      type="button"
      onClick={() => setBusinessLine(line)}
      className={`touch-btn flex-1 px-2 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1 ${
        businessLine === line
          ? "bg-sidebar-accent text-sidebar-foreground"
          : "text-sidebar-foreground/60 hover:bg-sidebar-accent/40"
      }`}
    >
      <i className={`fa-solid ${icon}`} />
      {!compact && BUSINESS_LINE_LABELS[line]}
    </button>
  );

  if (compact) {
    return (
      <div className="flex gap-1 bg-black/20 rounded-lg p-0.5">
        {btn("car_wash", "fa-car-side")}
        {btn("barbershop", "fa-scissors")}
      </div>
    );
  }

  return (
    <div className="px-3 pb-2">
      <p className="text-[10px] uppercase tracking-wide text-sidebar-foreground/50 mb-1 px-1">Línea de negocio</p>
      <div className="flex gap-1 bg-black/20 rounded-lg p-0.5">
        {btn("car_wash", "fa-car-side")}
        {btn("barbershop", "fa-scissors")}
      </div>
    </div>
  );
}

export default function AppLayout({ children }: { children: ReactNode }) {
  const { profile, signOut, loading, user, isAdmin } = useAuth();
  const { businessLine, isBarbershop, carWashVisible, barbershopVisible } = useBusinessLine();
  const { data: settings } = useBusinessSettings();
  const isOwner = profile?.role === "owner";
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <i className="fa-solid fa-spinner fa-spin text-4xl text-accent" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  const overrides: Record<string, boolean> = (profile as any)?.module_overrides ?? {};

  // Map nav path → module key used in overrides
  const pathToKey: Record<string, string> = {
    "/pos": "pos",
    "/dashboard": "dashboard",
    "/reports": "reports",
    "/cash-close": "cashclose",
    "/customers": "customers",
    "/memberships": "memberships",
    "/reminders": "reminders",
    "/inventory": "inventory",
    "/services": "services",
    "/settings": "settings",
  };

  const visibleNav = navItems.filter((n) => {
    const key = pathToKey[n.path];
    // Explicit override takes priority
    if (key !== undefined && overrides[key] === true) return true;
    if (key !== undefined && overrides[key] === false) return false;
    // Default role logic
    if (n.carWashOnly && (!carWashVisible || isBarbershop)) return false;
    if (n.barbershopOnly && (!barbershopVisible || !isBarbershop)) return false;
    if (n.barbershopOnlyAdminOrOwner) return barbershopVisible && isBarbershop && (isAdmin || isOwner);
    if (n.adminOnly) return isAdmin;
    if (n.adminOrOwner) return isAdmin || isOwner;
    if (n.adminOrOwnerOrCajero) return isAdmin || isOwner || profile?.role === "cajero";
    return true;
  });

  const brandName = settings?.business_name || (isBarbershop ? "EL RAPIDO BARBERÍA" : "EL RAPIDO");
  const brandSubtitle = isBarbershop ? "BARBERÍA" : "AUTOLAVADO";
  const headerIcon = isBarbershop ? "fa-scissors" : "fa-car-side";

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar desktop */}
      <aside className="hidden lg:flex flex-col w-64 nav-sidebar">
        <div className="p-4 border-b border-sidebar-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-sidebar-accent flex items-center justify-center">
              <i className={`fa-solid ${headerIcon} text-sidebar-foreground`} />
            </div>
            <div className="min-w-0">
              <h2 className="font-bold text-sm text-sidebar-foreground truncate">{brandName}</h2>
              <p className="text-xs text-sidebar-foreground/70">{brandSubtitle}</p>
            </div>
          </div>
        </div>
        <BusinessLineSelector />
        <nav className="flex-1 p-3 space-y-1 overflow-auto">
          {visibleNav.map((item) => {
            const active = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`touch-btn flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${active
                  ? "bg-sidebar-accent text-sidebar-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                  }`}
              >
                <i className={`fa-solid ${item.icon} w-5 text-center`} />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-sidebar-border">
          <div className="flex items-center gap-3 px-4 py-2">
            <div className="w-8 h-8 rounded-full bg-sidebar-accent flex items-center justify-center">
              <i className="fa-solid fa-user text-xs text-sidebar-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-sidebar-foreground truncate">{profile?.full_name || "Usuario"}</p>
              <p className="text-xs text-sidebar-foreground/60 capitalize">{profile?.role}</p>
            </div>
          </div>
          <button
            onClick={signOut}
            className="touch-btn flex items-center gap-3 px-4 py-3 w-full rounded-xl text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent/50"
          >
            <i className="fa-solid fa-right-from-bracket w-5 text-center" />
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-72 nav-sidebar animate-slide-in-left flex flex-col">
            <div className="p-4 flex items-center justify-between border-b border-sidebar-border">
              <div className="flex items-center gap-3 min-w-0">
                <i className={`fa-solid ${headerIcon} text-sidebar-foreground`} />
                <span className="font-bold text-sidebar-foreground truncate">{brandName}</span>
              </div>
              <button onClick={() => setSidebarOpen(false)} className="touch-btn p-2 text-sidebar-foreground">
                <i className="fa-solid fa-xmark" />
              </button>
            </div>
            <BusinessLineSelector />
            <nav className="p-3 space-y-1 flex-1 overflow-auto">
              {visibleNav.map((item) => {
                const active = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setSidebarOpen(false)}
                    className={`touch-btn flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium ${active ? "bg-sidebar-accent text-sidebar-foreground" : "text-sidebar-foreground/70"
                      }`}
                  >
                    <i className={`fa-solid ${item.icon} w-5 text-center`} />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
            <div className="p-3 border-t border-sidebar-border">
              <button
                onClick={signOut}
                className="touch-btn flex items-center gap-3 px-4 py-3 w-full rounded-xl text-sm text-sidebar-foreground/70"
              >
                <i className="fa-solid fa-right-from-bracket w-5 text-center" />
                Cerrar sesión
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="header-bar px-4 py-3 flex items-center gap-3 shadow-md">
          <button
            onClick={() => setSidebarOpen(true)}
            className="touch-btn lg:hidden p-2 text-accent-foreground"
          >
            <i className="fa-solid fa-bars text-lg" />
          </button>
          <h1 className="font-bold text-lg text-accent-foreground flex-1 truncate">
            {brandName}
          </h1>
          <div className="lg:hidden">
            <BusinessLineSelector compact />
          </div>
          <span className="hidden sm:inline text-xs px-2 py-0.5 rounded-full bg-sidebar-accent/80 text-accent-foreground capitalize">
            {BUSINESS_LINE_LABELS[businessLine]}
          </span>
          <div className="hidden sm:flex items-center gap-2 text-accent-foreground/80 text-sm">
            <i className="fa-solid fa-user" />
            <span>{profile?.full_name}</span>
            <span className="px-2 py-0.5 rounded-full text-xs bg-sidebar-accent capitalize">{profile?.role}</span>
          </div>
        </header>

        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
