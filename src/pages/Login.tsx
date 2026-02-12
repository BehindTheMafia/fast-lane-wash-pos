import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Navigate } from "react-router-dom";

const Login = () => {
  const { signIn, user, profile, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <i className="fa-solid fa-spinner fa-spin text-4xl text-accent" />
      </div>
    );
  }

  if (user && profile) {
    return <Navigate to={profile.role === "admin" ? "/dashboard" : "/pos"} replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    const { error } = await signIn(email, password);
    if (error) setError(error.message);
    setSubmitting(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-brick-red/10 via-background to-secondary/10 flex items-center justify-center p-4">
      <div className="w-full max-w-md animate-fade-in">
        <div className="bg-card border border-border rounded-2xl shadow-2xl p-8">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-brick-red to-secondary mb-4 shadow-lg">
              <i className="fa-solid fa-car-wash text-3xl text-white" />
            </div>
            <h1 className="text-3xl font-bold text-foreground mb-1">EL RAPIDO</h1>
            <h2 className="text-xl font-semibold text-brick-red mb-2">AUTOLAVADO</h2>
            <p className="text-sm text-muted-foreground">Sistema de Punto de Venta</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-foreground mb-2">
                <i className="fa-solid fa-envelope mr-2 text-secondary" />
                Correo Electrónico
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 bg-background border border-border rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brick-red/50 transition-all"
                placeholder="correo@ejemplo.com"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-foreground mb-2">
                <i className="fa-solid fa-lock mr-2 text-secondary" />
                Contraseña
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 bg-background border border-border rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brick-red/50 transition-all"
                placeholder="••••••••"
                required
              />
            </div>

            {error && (
              <div className="bg-destructive/10 border border-destructive/30 text-destructive p-3 rounded-xl text-sm flex items-center gap-2 animate-shake">
                <i className="fa-solid fa-circle-exclamation" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-brick-red hover:bg-brick-red/90 text-white font-semibold py-3 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg hover:shadow-xl"
            >
              {submitting ? (
                <>
                  <i className="fa-solid fa-spinner fa-spin" />
                  Ingresando...
                </>
              ) : (
                <>
                  <i className="fa-solid fa-right-to-bracket" />
                  Ingresar al Sistema
                </>
              )}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-border">
            <div className="text-center space-y-2">
              <a
                href="/create-admin"
                className="text-sm text-secondary hover:text-brick-red transition-colors inline-flex items-center gap-2"
              >
                <i className="fa-solid fa-user-shield" />
                Crear Usuario Administrador
              </a>
              <div className="text-xs text-muted-foreground">
                <a href="/db-validation" className="hover:text-secondary transition-colors">
                  Validar Base de Datos
                </a>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 text-center text-xs text-muted-foreground">
          <p>© 2026 EL RAPIDO AUTOLAVADO - Sistema POS v1.0</p>
        </div>
      </div>
    </div>
  );
};

export default Login;
