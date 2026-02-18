-- ============================================================
-- FIX: Agregar 'owner' al enum app_role y corregir perfiles
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- 1. Verificar el estado actual del enum
SELECT enumlabel FROM pg_enum 
WHERE enumtypid = 'public.app_role'::regtype
ORDER BY enumsortorder;

-- 2. Agregar 'owner' al enum si no existe
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumtypid = 'public.app_role'::regtype 
    AND enumlabel = 'owner'
  ) THEN
    ALTER TYPE public.app_role ADD VALUE 'owner';
    RAISE NOTICE 'owner role added to enum';
  ELSE
    RAISE NOTICE 'owner role already exists in enum';
  END IF;
END $$;

-- 3. Verificar perfiles con rol owner
SELECT p.id, p.user_id, p.full_name, p.role, p.active,
       u.email
FROM public.profiles p
JOIN auth.users u ON u.id = p.user_id
WHERE p.role::text = 'owner';

-- 4. Verificar que el usuario owner@elrapido.com tiene el rol correcto
SELECT p.id, p.user_id, p.full_name, p.role::text, p.active,
       u.email
FROM public.profiles p
JOIN auth.users u ON u.id = p.user_id
WHERE u.email = 'owner@elrapido.com';

-- 5. Si el usuario owner@elrapido.com existe pero no tiene rol owner, actualizarlo
-- (Descomentar si es necesario)
-- UPDATE public.profiles 
-- SET role = 'owner'::app_role
-- WHERE user_id = (SELECT id FROM auth.users WHERE email = 'owner@elrapido.com');

-- 6. Verificar la política RLS de profiles para que owner pueda leer su propio perfil
-- La política "Users read own profile" usa user_id = auth.uid() que es correcto
SELECT policyname, cmd, qual 
FROM pg_policies 
WHERE tablename = 'profiles' AND schemaname = 'public';
