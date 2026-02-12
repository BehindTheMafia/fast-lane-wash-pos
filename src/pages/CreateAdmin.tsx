import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';

export default function CreateAdmin() {
    const { signUp } = useAuth();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);

    const [formData, setFormData] = useState({
        email: '',
        password: '',
        confirmPassword: '',
        fullName: ''
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (formData.password !== formData.confirmPassword) {
            setError('Las contraseñas no coinciden');
            return;
        }

        if (formData.password.length < 6) {
            setError('La contraseña debe tener al menos 6 caracteres');
            return;
        }

        setLoading(true);

        try {
            const { error: signUpError } = await signUp(
                formData.email,
                formData.password,
                formData.fullName,
                'admin'
            );

            if (signUpError) {
                throw signUpError;
            }

            setSuccess(true);
            setTimeout(() => {
                navigate('/login');
            }, 2000);
        } catch (err: any) {
            setError(err.message || 'Error al crear el usuario administrador');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-brick-red/10 via-background to-secondary/10 flex items-center justify-center p-4">
            <div className="w-full max-w-md">
                <div className="bg-card border border-border rounded-2xl shadow-2xl p-8">
                    <div className="text-center mb-8">
                        <div className="inline-flex items-center justify-center w-16 h-16 bg-brick-red/10 rounded-full mb-4">
                            <i className="fa-solid fa-user-shield text-3xl text-brick-red" />
                        </div>
                        <h1 className="text-2xl font-bold text-foreground mb-2">
                            Crear Usuario Administrador
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            Configura el primer usuario administrador del sistema
                        </p>
                    </div>

                    {success ? (
                        <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4 text-center">
                            <i className="fa-solid fa-circle-check text-green-500 text-3xl mb-2" />
                            <p className="text-green-600 font-semibold">¡Administrador creado exitosamente!</p>
                            <p className="text-sm text-muted-foreground mt-1">Redirigiendo al login...</p>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} className="space-y-4">
                            {error && (
                                <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-3 text-sm text-destructive">
                                    <i className="fa-solid fa-triangle-exclamation mr-2" />
                                    {error}
                                </div>
                            )}

                            <div>
                                <label className="block text-sm font-medium text-foreground mb-2">
                                    Nombre Completo
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={formData.fullName}
                                    onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                                    className="w-full px-4 py-3 bg-background border border-border rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-brick-red/50"
                                    placeholder="Juan Pérez"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-foreground mb-2">
                                    Correo Electrónico
                                </label>
                                <input
                                    type="email"
                                    required
                                    value={formData.email}
                                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                    className="w-full px-4 py-3 bg-background border border-border rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-brick-red/50"
                                    placeholder="admin@example.com"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-foreground mb-2">
                                    Contraseña
                                </label>
                                <input
                                    type="password"
                                    required
                                    value={formData.password}
                                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                    className="w-full px-4 py-3 bg-background border border-border rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-brick-red/50"
                                    placeholder="••••••••"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-foreground mb-2">
                                    Confirmar Contraseña
                                </label>
                                <input
                                    type="password"
                                    required
                                    value={formData.confirmPassword}
                                    onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                                    className="w-full px-4 py-3 bg-background border border-border rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-brick-red/50"
                                    placeholder="••••••••"
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full bg-brick-red hover:bg-brick-red/90 text-white font-semibold py-3 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {loading ? (
                                    <>
                                        <i className="fa-solid fa-spinner fa-spin" />
                                        Creando...
                                    </>
                                ) : (
                                    <>
                                        <i className="fa-solid fa-user-plus" />
                                        Crear Administrador
                                    </>
                                )}
                            </button>
                        </form>
                    )}

                    <div className="mt-6 text-center">
                        <button
                            onClick={() => navigate('/login')}
                            className="text-sm text-secondary hover:text-brick-red transition-colors"
                        >
                            ¿Ya tienes cuenta? Inicia sesión
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
