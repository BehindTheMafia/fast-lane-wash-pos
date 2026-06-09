import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Navigate } from "react-router-dom";
import { BubbleBackground } from "@/components/animate-ui/components/backgrounds/bubble";

const Login = () => {
  const { signIn, user, profile, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-papaya-whip to-background bg-[length:400%_400%] animate-gradient-slow">
        <div className="relative">
          <div className="w-16 h-16 border-4 border-brick-red/20 border-t-brick-red rounded-full animate-spin"></div>
          <div className="absolute inset-0 flex items-center justify-center">
            <i className="fa-solid fa-car-side text-brick-red text-xl animate-pulse" />
          </div>
        </div>
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
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-background">
      <BubbleBackground
        interactive={false}
        className="absolute inset-0 !bg-background !bg-none"
        bubbleOpacity={0.18}
        colors={{
          first: '240, 225, 195', // crema cálido
          second: '228, 212, 185', // arena
          third: '122, 0, 0',      // rojo vino
          fourth: '12, 28, 45',    // navy
          fifth: '215, 198, 170',  // beige oscuro
          sixth: '40, 50, 60',     // gris oscuro
        }}
      />

      {/* Main Glassmorphism Card */}
      <div className="relative w-full max-w-md mx-4 animate-scale-in z-10">
        <div className="backdrop-blur-2xl bg-white/60 border border-white/50 shadow-[0_8px_30px_rgb(0,0,0,0.12)] rounded-3xl p-8 lg:p-10 transition-all duration-300">
          
          {/* Header Section */}
          <div className="text-center mb-8">
            <div className="flex justify-center items-center gap-4 mb-6">
              <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-steel-blue to-deep-space-blue shadow-lg transform -rotate-6 transition-transform hover:rotate-0 duration-300">
                <i className="fa-solid fa-car-side text-2xl text-white" />
              </div>
              <div className="h-8 w-[2px] bg-foreground/20 rounded-full"></div>
              <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-brick-red to-molten-lava shadow-lg transform rotate-6 transition-transform hover:rotate-0 duration-300">
                <i className="fa-solid fa-scissors text-2xl text-white" />
              </div>
            </div>
            <h1 className="text-4xl font-extrabold text-foreground tracking-tight mb-2">
              EL RAPIDO
            </h1>
            <h2 className="text-sm font-medium tracking-widest text-muted-foreground uppercase letter-spacing-2">
              Autolavado <span className="text-brick-red font-bold">&</span> Barbería
            </h2>
          </div>

          {/* Form Section */}
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-1">
              <label className="text-xs font-bold text-foreground/80 uppercase tracking-wider ml-1">
                Correo Electrónico
              </label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none transition-colors duration-300 group-focus-within:text-steel-blue text-muted-foreground">
                  <i className="fa-solid fa-envelope" />
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-11 pr-4 py-3.5 bg-white/70 border border-white/80 rounded-2xl text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-steel-blue/50 focus:bg-white transition-all duration-300 shadow-sm"
                  placeholder="admin@elrapido.com"
                  required
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-foreground/80 uppercase tracking-wider ml-1">
                Contraseña
              </label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none transition-colors duration-300 group-focus-within:text-steel-blue text-muted-foreground">
                  <i className="fa-solid fa-lock" />
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-11 pr-4 py-3.5 bg-white/70 border border-white/80 rounded-2xl text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-steel-blue/50 focus:bg-white transition-all duration-300 shadow-sm"
                  placeholder="••••••••"
                  required
                />
              </div>
            </div>

            {error && (
              <div className="bg-destructive/10 border border-destructive/20 text-destructive p-3.5 rounded-2xl text-sm flex items-start gap-3 animate-fade-in shadow-sm">
                <i className="fa-solid fa-circle-exclamation mt-0.5" />
                <span className="leading-tight font-medium">{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="group relative w-full overflow-hidden rounded-2xl bg-foreground text-background font-bold py-4 transition-all duration-300 disabled:opacity-70 disabled:cursor-not-allowed hover:shadow-xl hover:-translate-y-0.5 cursor-pointer"
            >
              <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-molten-lava via-brick-red to-molten-lava opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-[length:200%_auto] animate-gradient"></div>
              <span className="relative flex items-center justify-center gap-2">
                {submitting ? (
                  <>
                    <i className="fa-solid fa-circle-notch fa-spin" />
                    Autenticando...
                  </>
                ) : (
                  <>
                    Ingresar al Sistema
                    <i className="fa-solid fa-arrow-right-to-bracket transition-transform duration-300 group-hover:translate-x-1" />
                  </>
                )}
              </span>
            </button>
          </form>

          {/* Footer Links */}
          <div className="mt-8 pt-6 border-t border-border/40">
            <div className="flex flex-col items-center gap-3">
              <a
                href="/create-admin"
                className="text-sm font-medium text-secondary hover:text-brick-red transition-colors duration-300 inline-flex items-center gap-2 group cursor-pointer"
              >
                <i className="fa-solid fa-user-shield group-hover:scale-110 transition-transform duration-300" />
                Configurar Administrador
              </a>
              <a 
                href="/db-validation" 
                className="text-xs text-muted-foreground hover:text-foreground transition-colors duration-300 cursor-pointer"
              >
                Validar Base de Datos
              </a>
            </div>
          </div>
        </div>

        {/* System Version */}
        <div className="mt-6 text-center">
          <p className="text-xs font-medium text-foreground/50 tracking-wide">
            EL RAPIDO POS v2.0 • {new Date().getFullYear()}
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
