import { useState, ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Link, useLocation, Navigate } from "react-router-dom";

interface NavItem {
  label: string;
  icon: string;
  path: string;
  adminOnly?: boolean;
  adminOrOwner?: boolean;
  adminOrOwnerOrCajero?: boolean;
}

const navItems: NavItem[] = [
  { label: "POS", icon: "fa-cash-register", path: "/pos" },
  { label: "Dashboard", icon: "fa-chart-pie", path: "/dashboard", adminOrOwnerOrCajero: true },
  { label: "Reportes", icon: "fa-file-lines", path: "/reports", adminOrOwner: true },
  { label: "Cierre de Caja", icon: "fa-vault", path: "/cash-close" },
  { label: "Clientes", icon: "fa-users", path: "/customers" },
  { label: "Membresías", icon: "fa-id-card", path: "/memberships" },
  { label: "Recordatorios", icon: "fa-bell", path: "/reminders" },
  { label: "Servicios", icon: "fa-list-check", path: "/services", adminOnly: true },
  { label: "Configuración", icon: "fa-gear", path: "/settings", adminOnly: true },
];

export default function AppLayout({ children }: { children: ReactNode }) {
  const { profile, signOut, loading, user, isAdmin } = useAuth();
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

  const visibleNav = navItems.filter((n) => {
    if (n.adminOnly) return isAdmin;
    if (n.adminOrOwner) return isAdmin || isOwner;
    if (n.adminOrOwnerOrCajero) return isAdmin || isOwner || profile?.role === "cajero";
    return true;
  });

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar desktop */}
      <aside className="hidden lg:flex flex-col w-64 nav-sidebar">
        <div className="p-4 border-b border-sidebar-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-sidebar-accent flex items-center justify-center">
              <i className="fa-solid fa-car-side text-sidebar-foreground" />
            </div>
            <div>
              <h2 className="font-bold text-sm text-sidebar-foreground">EL RAPIDO</h2>
              <p className="text-xs text-sidebar-foreground/70">AUTOLAVADO</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
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
          <aside className="absolute left-0 top-0 bottom-0 w-72 nav-sidebar animate-slide-in-left">
            <div className="p-4 flex items-center justify-between border-b border-sidebar-border">
              <div className="flex items-center gap-3">
                <i className="fa-solid fa-car-side text-sidebar-foreground" />
                <span className="font-bold text-sidebar-foreground">EL RAPIDO</span>
              </div>
              <button onClick={() => setSidebarOpen(false)} className="touch-btn p-2 text-sidebar-foreground">
                <i className="fa-solid fa-xmark" />
              </button>
            </div>
            <nav className="p-3 space-y-1">
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
            <div className="absolute bottom-0 left-0 right-0 p-3 border-t border-sidebar-border">
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
        {/* Top header */}
        <header className="header-bar px-4 py-3 flex items-center gap-4 shadow-md">
          <button
            onClick={() => setSidebarOpen(true)}
            className="touch-btn lg:hidden p-2 text-accent-foreground"
          >
            <i className="fa-solid fa-bars text-lg" />
          </button>
          <h1 className="font-bold text-lg text-accent-foreground flex-1">EL RAPIDO AUTOLAVADO</h1>
          <div className="hidden sm:flex items-center gap-2 text-accent-foreground/80 text-sm">
            <i className="fa-solid fa-user" />
            <span>{profile?.full_name}</span>
            <span className="px-2 py-0.5 rounded-full text-xs bg-sidebar-accent capitalize">{profile?.role}</span>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
