-- ============================================================
-- FIX CRÍTICO: Corregir políticas RLS de profiles
-- La tabla profiles usa 'id' como FK a auth.users.id
-- Las políticas que usan 'user_id' están bloqueando el acceso
-- ============================================================

-- 1. Ver las políticas actuales
SELECT policyname, cmd, qual, with_check
FROM pg_policies 
WHERE tablename = 'profiles' AND schemaname = 'public';

-- 2. Ver las columnas de profiles para confirmar estructura
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_schema = 'public' AND table_name = 'profiles'
ORDER BY ordinal_position;

-- 3. Corregir la política "Users read own profile"
-- Cambiar de user_id = auth.uid() a id = auth.uid()
DROP POLICY IF EXISTS "Users read own profile" ON public.profiles;

CREATE POLICY "Users read own profile" ON public.profiles 
  FOR SELECT TO authenticated
  USING (id = auth.uid());

-- 4. Corregir la política de admin si también usa user_id
DROP POLICY IF EXISTS "Admin full access profiles" ON public.profiles;

CREATE POLICY "Admin full access profiles" ON public.profiles 
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p2
      WHERE p2.id = auth.uid() AND p2.role::text = 'admin'
    )
  );

-- 5. Verificar que el owner puede leer su perfil ahora
-- (Simular con el user_id del owner)
SELECT id, full_name, role::text, active
FROM public.profiles
WHERE id = (SELECT id FROM auth.users WHERE email = 'owner@elrapido.com');

-- 6. Verificar todas las políticas actualizadas
SELECT policyname, cmd, qual
FROM pg_policies 
WHERE tablename = 'profiles' AND schemaname = 'public';
