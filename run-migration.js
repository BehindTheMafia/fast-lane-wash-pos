import { supabase } from './src/integrations/supabase/client';

async function runMigration() {
    console.log('🔧 Ejecutando migración: add_service_to_memberships...');

    try {
        // 1. Add service_id column
        const { error: col_error } = await supabase.rpc('exec_sql', {
            sql_query: `
                ALTER TABLE public.customer_memberships
                ADD COLUMN IF NOT EXISTS service_id INT;
            `
        });

        if (col_error) {
            console.log('⚠️ Columna service_id:', col_error.message);
        } else {
            console.log('✅ Columna service_id agregada');
        }

        // 2. Add foreign key constraint
        const { error: fk_error } = await supabase.rpc('exec_sql', {
            sql_query: `
                DO $$ 
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM pg_constraint 
                        WHERE conname = 'fk_customer_memberships_service'
                    ) THEN
                        ALTER TABLE public.customer_memberships
                        ADD CONSTRAINT fk_customer_memberships_service
                        FOREIGN KEY (service_id) REFERENCES public.services(id);
                    END IF;
                END $$;
            `
        });

        if (fk_error) {
            console.log('⚠️ Foreign key:', fk_error.message);
        } else {
            console.log('✅ Foreign key agregada');
        }

        // 3. Create index
        const { error: idx_error } = await supabase.rpc('exec_sql', {
            sql_query: `
                CREATE INDEX IF NOT EXISTS idx_customer_memberships_service_id 
                ON public.customer_memberships(service_id);
            `
        });

        if (idx_error) {
            console.log('⚠️ Index:', idx_error.message);
        } else {
            console.log('✅ Index creado');
        }

        // 4. Update existing memberships
        const { error: update_error } = await supabase
            .from('customer_memberships')
            .update({ service_id: 1 })
            .is('service_id', null);

        if (update_error) {
            console.log('⚠️ Update error:', update_error.message);
        } else {
            console.log('✅ Membresías existentes actualizadas');
        }

        console.log('✅ Migración completada!');

    } catch (error) {
        console.error('❌ Error en migración:', error);
    }
}

runMigration();
