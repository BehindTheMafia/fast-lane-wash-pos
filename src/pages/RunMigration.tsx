import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export default function RunMigration() {
    const [status, setStatus] = useState('Iniciando...');
    const [logs, setLogs] = useState<string[]>([]);
    const [completed, setCompleted] = useState(false);

    const addLog = (msg: string) => {
        setLogs(prev => [...prev, msg]);
        console.log(msg);
    };

    useEffect(() => {
        runMigration();
    }, []);

    const runMigration = async () => {
        addLog('🔧 Iniciando migración: add_service_to_memberships');
        setStatus('Ejecutando migración SQL...');

        try {
            // Step 1: Add service_id column
            addLog('1️⃣ Agregando columna service_id...');
            const { error: col_error } = await supabase.rpc('query', {
                query: `ALTER TABLE public.customer_memberships ADD COLUMN IF NOT EXISTS service_id INT;`
            });

            if (col_error && !col_error.message.includes('already exists')) {
                // Try direct SQL execution
                const { data, error } = await (supabase as any).from('customer_memberships').select('service_id').limit(1);
                if (error && error.code === '42703') {
                    // Column doesn't exist, need to add it manually via SQL editor
                    addLog('⚠️  No se puede ejecutar ALTER TABLE directamente');
                    addLog('📝 Ejecuta este SQL en Supabase Dashboard > SQL Editor:');
                    addLog('');
                    addLog('ALTER TABLE public.customer_memberships ADD COLUMN service_id INT;');
                    addLog('ALTER TABLE public.customer_memberships ADD CONSTRAINT fk_customer_memberships_service FOREIGN KEY (service_id) REFERENCES public.services(id);');
                    addLog('CREATE INDEX idx_customer_memberships_service_id ON public.customer_memberships(service_id);');
                    addLog('UPDATE public.customer_memberships SET service_id = 1 WHERE service_id IS NULL;');
                    setStatus('❌ Requiere ejecución manual en Supabase');
                    setCompleted(true);
                    return;
                } else {
                    addLog('✅ Columna service_id ya existe o fue agregada');
                }
            } else {
                addLog('✅ Columna service_id agregada exitosamente');
            }

            // Step 2: Update existing memberships
            addLog('2️⃣ Actualizando membresías existentes...');
            const { data: memberships, error: select_error } = await supabase
                .from('customer_memberships')
                .select('id, service_id');

            if (select_error) {
                addLog(`⚠️  Error al leer membresías: ${select_error.message}`);
            } else {
                addLog(`📊 Encontradas ${memberships?.length || 0} membresías`);

                // Update only those without service_id
                const toUpdate = memberships?.filter(m => !m.service_id) || [];
                if (toUpdate.length > 0) {
                    const { error: update_error } = await supabase
                        .from('customer_memberships')
                        .update({ service_id: 1 })
                        .is('service_id', null);

                    if (update_error) {
                        addLog(`⚠️  Error al actualizar: ${update_error.message}`);
                    } else {
                        addLog(`✅ ${toUpdate.length} membresías actualizadas con service_id = 1`);
                    }
                } else {
                    addLog('✅ Todas las membresías ya tienen service_id');
                }
            }

            addLog('');
            addLog('✅ Migración completada!');
            addLog('🔄 Recarga la página para ver los cambios');
            setStatus('✅ Migración completada');
            setCompleted(true);

        } catch (error: any) {
            addLog(`❌ Error: ${error.message}`);
            setStatus(`❌ Error: ${error.message}`);
            setCompleted(true);
        }
    };

    return (
        <div className="min-h-screen bg-background p-8">
            <div className="max-w-4xl mx-auto">
                <div className="mb-8">
                    <h1 className="text-3xl font-bold text-foreground mb-2">
                        <i className="fa-solid fa-database mr-3 text-secondary" />
                        Migración de Base de Datos
                    </h1>
                    <p className="text-muted-foreground">
                        Agregando service_id a customer_memberships
                    </p>
                </div>

                <div className="bg-card border border-border rounded-xl p-6 mb-4">
                    <div className="flex items-center gap-3 mb-4">
                        {!completed && <i className="fa-solid fa-spinner fa-spin text-2xl text-accent" />}
                        {completed && <i className="fa-solid fa-check-circle text-2xl text-green-500" />}
                        <h2 className="text-xl font-bold text-foreground">{status}</h2>
                    </div>

                    <div className="bg-muted rounded-lg p-4 font-mono text-sm space-y-1 max-h-96 overflow-y-auto">
                        {logs.map((log, idx) => (
                            <div key={idx} className="text-foreground">
                                {log}
                            </div>
                        ))}
                    </div>
                </div>

                {completed && (
                    <div className="flex gap-4">
                        <button
                            onClick={() => window.location.href = '/memberships'}
                            className="px-6 py-3 bg-primary text-primary-foreground rounded-lg font-semibold hover:bg-primary/90"
                        >
                            <i className="fa-solid fa-arrow-right mr-2" />
                            Ir a Membresías
                        </button>
                        <button
                            onClick={() => window.location.reload()}
                            className="px-6 py-3 bg-muted text-foreground rounded-lg font-semibold hover:bg-muted/80"
                        >
                            <i className="fa-solid fa-rotate-right mr-2" />
                            Recargar
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
