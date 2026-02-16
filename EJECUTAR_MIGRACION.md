# INSTRUCCIONES: Ejecutar Migración SQL

## ⚠️ IMPORTANTE: Ejecutar esta migración en Supabase Dashboard

La migración SQL ya está creada en:
`supabase/migrations/20260216181200_add_service_to_memberships.sql`

**Pasos para ejecutar:**

1. Ve a tu proyecto de Supabase: https://supabase.com/dashboard
2. Navega a **SQL Editor** en el menú lateral
3. Crea una nueva query
4. Copia y pega el siguiente SQL:

```sql
-- Add service_id to customer_memberships
-- This allows tracking which specific service (Lavado Rápido Breve vs Nítido) was purchased

-- 1. Add service_id column to customer_memberships
ALTER TABLE public.customer_memberships
  ADD COLUMN service_id INT;

-- 2. Add foreign key constraint to services table
ALTER TABLE public.customer_memberships
  ADD CONSTRAINT fk_customer_memberships_service
  FOREIGN KEY (service_id) REFERENCES public.services(id);

-- 3. Create index for better query performance
CREATE INDEX idx_customer_memberships_service_id 
  ON public.customer_memberships(service_id);

-- 4. Update existing memberships to default service (Lavado Rápido Breve = 1)
UPDATE public.customer_memberships
SET service_id = 1
WHERE service_id IS NULL;
```

5. Haz clic en **"Run"** o presiona `Ctrl+Enter`
6. Verifica que se ejecute sin errores
7. La migración habrá agregado la columna `service_id` a todas las membresías existentes

**¿Qué hace esta migración?**
- Agrega columna `service_id` para guardar el servicio específico de cada membresía
- Crea relación con la tabla `services`
- Actualiza membresías existentes con servicio por defecto (ID 1 = Lavado Rápido Breve)

**Después de ejecutar:**
- Recarga la aplicación (`http://localhost:8080`)
- Las membresías ahora mostrarán el servicio específico
- El POS solo permitirá usar el servicio correcto
