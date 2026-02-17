import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://dwbfmphghmquxigmczcc.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR3YmZtcGhnaG1xdXhpZ21jemNjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA4NDMzMzIsImV4cCI6MjA4NjQxOTMzMn0.KvBS_ZGY-2JzO9q3AOV5Mb-4S7Bk8rMLZJokRiU5Q3U';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function runMigration() {
    console.log('🚀 Iniciando migración de base de datos...\n');

    try {
        // Step 1: Add customer_id column to tickets table
        console.log('📝 Paso 1: Agregando columna customer_id a la tabla tickets...');
        const { error: alterError } = await supabase.rpc('exec_sql', {
            sql: `
        DO $$ 
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_schema = 'public' 
                AND table_name = 'tickets' 
                AND column_name = 'customer_id'
            ) THEN
                ALTER TABLE public.tickets ADD COLUMN customer_id bigint REFERENCES public.customers(id);
                RAISE NOTICE 'Columna customer_id agregada a tickets';
            ELSE
                RAISE NOTICE 'Columna customer_id ya existe en tickets';
            END IF;
        END $$;
      `
        });

        if (alterError) {
            console.error('❌ Error al agregar columna:', alterError);
            throw alterError;
        }

        console.log('✅ Columna customer_id agregada exitosamente\n');

        // Step 2: Create index for better performance
        console.log('📝 Paso 2: Creando índice para customer_id...');
        const { error: indexError } = await supabase.rpc('exec_sql', {
            sql: 'CREATE INDEX IF NOT EXISTS idx_tickets_customer_id ON public.tickets(customer_id);'
        });

        if (indexError) {
            console.error('❌ Error al crear índice:', indexError);
            throw indexError;
        }

        console.log('✅ Índice creado exitosamente\n');

        // Step 3: Verify the changes
        console.log('📝 Paso 3: Verificando cambios...');
        const { data: columns, error: verifyError } = await supabase
            .from('tickets')
            .select('*')
            .limit(1);

        if (verifyError) {
            console.error('❌ Error al verificar:', verifyError);
        } else {
            console.log('✅ Verificación completada\n');
        }

        console.log('🎉 ¡Migración completada exitosamente!\n');
        console.log('📋 Próximos pasos:');
        console.log('1. Descomenta las líneas en src/pages/Memberships.tsx');
        console.log('2. Recarga la aplicación en el navegador');
        console.log('3. Prueba vender una membresía');
        console.log('4. Verifica que aparezca el cliente y la placa en Reportes\n');

    } catch (error) {
        console.error('❌ Error durante la migración:', error);
        process.exit(1);
    }
}

runMigration();
