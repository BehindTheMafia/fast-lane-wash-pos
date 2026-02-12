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
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md animate-fade-in">
        <div className="pos-card p-8">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-accent mb-4">
              <i className="fa-solid fa-car-side text-3xl text-accent-foreground" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">EL RAPIDO AUTOLAVADO</h1>
            <p className="text-secondary mt-1">Sistema POS</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-foreground mb-1">
                <i className="fa-solid fa-envelope mr-2 text-secondary" />Correo
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-touch"
                placeholder="correo@ejemplo.com"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-foreground mb-1">
                <i className="fa-solid fa-lock mr-2 text-secondary" />Contraseña
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-touch"
                placeholder="••••••••"
                required
              />
            </div>

            {error && (
              <div className="bg-destructive/10 text-destructive p-3 rounded-lg text-sm flex items-center gap-2">
                <i className="fa-solid fa-circle-exclamation" />{error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="btn-cobrar w-full flex items-center justify-center gap-2"
            >
              {submitting ? (
                <i className="fa-solid fa-spinner fa-spin" />
              ) : (
                <><i className="fa-solid fa-right-to-bracket" /> Ingresar</>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Login;
