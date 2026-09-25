/**
 * SubscriptionGuard — wraps the app's main routes.
 *
 * Behaviour:
 *  - If the system is NOT blocked → renders children normally.
 *  - If the system IS blocked      → renders a full-screen lock screen.
 *    The Settings page (/settings) is ALWAYS accessible to admin users
 *    so they can adjust the expiry date or disable the manual lock.
 *    A sign-out button is always visible so any user can log out.
 */

import { useSubscription } from "@/hooks/useSubscription";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "react-router-dom";
import { useState } from "react";

const CONTACT_NUMBERS = "5703-7623 / 5816-4405";

// ─── Lock Screen ──────────────────────────────────────────────────────────────
function SystemLockScreen({ isAdmin }: { isAdmin: boolean }) {
  const { signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    setSigningOut(true);
    await signOut();
    // signOut clears auth state; the router will redirect to /login automatically
  };

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-background/95 backdrop-blur-sm p-6">
      {/* Pulsing warning ring */}
      <div className="relative flex items-center justify-center mb-8">
        <span className="absolute inline-flex h-32 w-32 rounded-full bg-destructive/20 animate-ping" />
        <div className="relative w-28 h-28 rounded-full bg-destructive/10 border-2 border-destructive/30 flex items-center justify-center">
          <i className="fa-solid fa-lock text-5xl text-destructive" />
        </div>
      </div>

      {/* Title */}
      <h1 className="text-2xl font-bold text-foreground text-center mb-3">
        Sistema bloqueado
      </h1>

      {/* Message */}
      <div className="max-w-md w-full bg-destructive/5 border border-destructive/20 rounded-2xl p-6 text-center space-y-3">
        <p className="text-sm text-foreground/80 leading-relaxed">
          Su suscripción ha expirado. Para reactivar su producto, por favor
          comuníquese con Administración a los siguientes números:
        </p>
        <div className="flex items-center justify-center gap-2 py-2">
          <i className="fa-solid fa-phone text-destructive" />
          <span className="text-lg font-bold text-destructive tracking-wide">
            {CONTACT_NUMBERS}
          </span>
        </div>
      </div>

      {/* Admin shortcut */}
      {isAdmin && (
        <div className="mt-6 text-center">
          <p className="text-xs text-muted-foreground mb-2">
            Eres administrador — puedes acceder a la configuración para
            ajustar la suscripción.
          </p>
          <a
            href="/settings"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-accent text-accent-foreground text-sm font-semibold hover:opacity-90 transition-opacity"
          >
            <i className="fa-solid fa-gear" />
            Ir a Configuración
          </a>
        </div>
      )}

      {/* Sign-out — always visible so any user can leave */}
      <div className="mt-8">
        <button
          onClick={handleSignOut}
          disabled={signingOut}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors disabled:opacity-50"
        >
          {signingOut
            ? <i className="fa-solid fa-spinner fa-spin" />
            : <i className="fa-solid fa-right-from-bracket" />
          }
          {signingOut ? "Cerrando sesión..." : "Cerrar sesión"}
        </button>
      </div>
    </div>
  );
}

// ─── Guard ────────────────────────────────────────────────────────────────────
export function SubscriptionGuard({ children }: { children: React.ReactNode }) {
  const { isBlocked, isLoading } = useSubscription();
  const { isAdmin, loading: authLoading } = useAuth();
  const location = useLocation();

  // Admin users at /settings can ALWAYS access it — never block them here.
  // They need to reach Settings to be able to fix the subscription config.
  if (isAdmin && location.pathname === "/settings") {
    return <>{children}</>;
  }

  // While loading the subscription status, render children normally.
  // This prevents any blank-page flash. If the user IS blocked, the lock
  // screen will appear as soon as the status resolves (~200 ms).
  if (isLoading || authLoading) {
    return <>{children}</>;
  }

  // Confirmed blocked → show full-screen lock (children not rendered)
  if (isBlocked) {
    return <SystemLockScreen isAdmin={isAdmin} />;
  }

  return <>{children}</>;
}
