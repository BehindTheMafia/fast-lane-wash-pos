-- ============================================================================
-- LOYALTY PROGRAM V3: Programas Premium + Nítido independientes
-- Fecha: 2026-07-07
-- Estrategia: SOLO nuevas tablas + 1 columna nullable en services
--             No toca lógica existente. Loyalty v1/v2 se desactiva via flag.
-- ============================================================================

-- ── 0. DESACTIVAR LEGACY LOYALTY (v1/v2) ────────────────────────────────────
-- Agregamos columna para marcar que el módulo legacy está deshabilitado.
-- CarWashPOS verifica este flag antes de llamar increment_loyalty_visit.
ALTER TABLE public.business_settings
  ADD COLUMN IF NOT EXISTS loyalty_legacy_enabled BOOLEAN NOT NULL DEFAULT false;

-- Desactivar el legacy en todos los registros existentes
UPDATE public.business_settings SET loyalty_legacy_enabled = false;

-- ── 1. COLUMNA EN SERVICES: loyalty_program ──────────────────────────────────
-- Identifica a qué programa de lealtad contribuye este servicio.
-- Valores: 'premium' | 'nitido' | NULL (no participa)
-- Es el mínimo cambio necesario para identificar servicios sin hardcodear nombres.
ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS loyalty_program TEXT
  CHECK (loyalty_program IN ('premium', 'nitido') OR loyalty_program IS NULL);

-- Asignar programas a servicios existentes por nombre (seed inicial)
-- Servicio base "Nítido" (id=2) → programa nítido
UPDATE public.services SET loyalty_program = 'nitido'
  WHERE id = 2 AND business_line = 'car_wash';

-- Extras que aplican al programa Premium: "Pasteado Carrocería Premium", "Ceramic Wax"
-- Nota: estos son los servicios que se dan como RECOMPENSA del programa premium
-- El servicio que CUENTA lavadas premium debe tener loyalty_program = 'premium'
-- Por defecto asignamos id=1 (Breve) a ninguno y dejamos que admin configure.
-- Se puede editar desde la pantalla de Servicios.

-- ── 2. TABLAS DEL MÓDULO V3 ──────────────────────────────────────────────────

-- loyalty_programs: catálogo de programas de lealtad (extensible a futuro)
CREATE TABLE IF NOT EXISTS public.loyalty_programs (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL,                  -- "Premium", "Nítido"
  slug       TEXT NOT NULL UNIQUE,           -- "premium", "nitido"
  cycle_size INT  NOT NULL DEFAULT 9,        -- lavadas por ciclo completo
  rewards    JSONB NOT NULL DEFAULT '[]',    -- [{at:5,reward:"Lavado Nítido GRATIS"},{at:9,reward:"Ceramic Wax GRATIS"}]
  active     BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.loyalty_programs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read loyalty_programs"  ON public.loyalty_programs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin write loyalty_programs"         ON public.loyalty_programs FOR ALL    TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Seed: programas iniciales
INSERT INTO public.loyalty_programs (name, slug, cycle_size, rewards) VALUES
  ('Premium', 'premium', 9, '[{"at":5,"reward":"Lavado Nítido GRATIS","reward_slug":"nitido_gratis"},{"at":9,"reward":"Ceramic Wax GRATIS","reward_slug":"ceramic_wax_gratis"}]'),
  ('Nítido',  'nitido',  9, '[{"at":5,"reward":"Lavado Breve GRATIS","reward_slug":"breve_gratis"},  {"at":9,"reward":"Pasteado GRATIS","reward_slug":"pasteado_gratis"}]')
ON CONFLICT (slug) DO NOTHING;

-- loyalty_progress: progreso por cliente × programa
CREATE TABLE IF NOT EXISTS public.loyalty_progress (
  id              SERIAL PRIMARY KEY,
  customer_id     BIGINT NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  program_id      INT    NOT NULL REFERENCES public.loyalty_programs(id),
  washes_in_cycle INT    NOT NULL DEFAULT 0,   -- dentro del ciclo actual (0..cycle_size-1)
  total_washes    INT    NOT NULL DEFAULT 0,   -- acumulado histórico total
  cycle_number    INT    NOT NULL DEFAULT 0,   -- ciclos completados
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (customer_id, program_id)
);

ALTER TABLE public.loyalty_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read loyalty_progress"   ON public.loyalty_progress FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert loyalty_progress" ON public.loyalty_progress FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update loyalty_progress" ON public.loyalty_progress FOR UPDATE TO authenticated USING (true);

-- loyalty_rewards: recompensas ganadas por cliente
CREATE TABLE IF NOT EXISTS public.loyalty_rewards (
  id           SERIAL PRIMARY KEY,
  customer_id  BIGINT NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  program_id   INT    NOT NULL REFERENCES public.loyalty_programs(id),
  reward_name  TEXT   NOT NULL,                           -- "Ceramic Wax GRATIS"
  reward_slug  TEXT   NOT NULL,                           -- "ceramic_wax_gratis"
  status       TEXT   NOT NULL DEFAULT 'available'
               CHECK (status IN ('available','redeemed','expired')),
  earned_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ,
  ticket_id    BIGINT REFERENCES public.tickets(id) ON DELETE SET NULL  -- ticket que generó la recompensa
);

ALTER TABLE public.loyalty_rewards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read loyalty_rewards"   ON public.loyalty_rewards FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert loyalty_rewards" ON public.loyalty_rewards FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update loyalty_rewards" ON public.loyalty_rewards FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Admin delete loyalty_rewards"         ON public.loyalty_rewards FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- loyalty_redemptions: log de canje (auditoría completa)
CREATE TABLE IF NOT EXISTS public.loyalty_redemptions (
  id           SERIAL PRIMARY KEY,
  reward_id    INT    NOT NULL REFERENCES public.loyalty_rewards(id),
  customer_id  BIGINT NOT NULL REFERENCES public.customers(id),
  ticket_id    BIGINT REFERENCES public.tickets(id) ON DELETE SET NULL,
  user_id      UUID   REFERENCES auth.users(id),
  redeemed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes        TEXT,
  overridden_by_admin BOOLEAN DEFAULT false  -- true si admin anuló el bloqueo
);

ALTER TABLE public.loyalty_redemptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read loyalty_redemptions"   ON public.loyalty_redemptions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert loyalty_redemptions" ON public.loyalty_redemptions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Admin delete loyalty_redemptions"         ON public.loyalty_redemptions FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- loyalty_wash_log: log individual de cada lavada registrada (historial)
CREATE TABLE IF NOT EXISTS public.loyalty_wash_log (
  id          SERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  program_id  INT    NOT NULL REFERENCES public.loyalty_programs(id),
  ticket_id   BIGINT REFERENCES public.tickets(id) ON DELETE SET NULL,
  service_id  INT    REFERENCES public.services(id),
  wash_number INT    NOT NULL,  -- número de lavada dentro del ciclo al momento del registro
  reward_earned_id INT REFERENCES public.loyalty_rewards(id),  -- si esta lavada generó recompensa
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id     UUID   REFERENCES auth.users(id)
);

ALTER TABLE public.loyalty_wash_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read loyalty_wash_log"   ON public.loyalty_wash_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert loyalty_wash_log" ON public.loyalty_wash_log FOR INSERT TO authenticated WITH CHECK (true);

-- ── 3. ÍNDICES ───────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_loyalty_progress_customer  ON public.loyalty_progress(customer_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_progress_program   ON public.loyalty_progress(program_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_rewards_customer   ON public.loyalty_rewards(customer_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_rewards_status     ON public.loyalty_rewards(status);
CREATE INDEX IF NOT EXISTS idx_loyalty_wash_log_customer  ON public.loyalty_wash_log(customer_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_wash_log_ticket    ON public.loyalty_wash_log(ticket_id);
CREATE INDEX IF NOT EXISTS idx_services_loyalty_program   ON public.services(loyalty_program);

-- ── 4. RPC: record_loyalty_v3_wash ──────────────────────────────────────────
-- Llamado después de una venta exitosa.
-- p_service_id: ID del servicio vendido
-- Retorna JSONB con el estado actualizado y si se generó recompensa.
CREATE OR REPLACE FUNCTION public.record_loyalty_v3_wash(
  p_customer_id BIGINT,
  p_ticket_id   BIGINT,
  p_service_id  INT,
  p_user_id     UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_program          RECORD;
  v_progress         RECORD;
  v_new_in_cycle     INT;
  v_new_total        INT;
  v_new_cycle_num    INT;
  v_reward_entry     JSONB;
  v_reward_id        INT;
  v_rewards_earned   JSONB := '[]';
  v_reward_item      JSONB;
BEGIN
  -- Obtener el programa al que pertenece este servicio
  SELECT lp.*
    INTO v_program
    FROM public.loyalty_programs lp
    JOIN public.services s ON s.loyalty_program = lp.slug
   WHERE s.id = p_service_id
     AND lp.active = true
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('recorded', false, 'reason', 'service_not_in_program');
  END IF;

  -- Obtener o crear el progreso del cliente para este programa
  INSERT INTO public.loyalty_progress (customer_id, program_id, washes_in_cycle, total_washes, cycle_number)
  VALUES (p_customer_id, v_program.id, 0, 0, 0)
  ON CONFLICT (customer_id, program_id) DO NOTHING;

  SELECT * INTO v_progress
    FROM public.loyalty_progress
   WHERE customer_id = p_customer_id AND program_id = v_program.id
   FOR UPDATE;

  v_new_total    := v_progress.total_washes + 1;
  v_new_in_cycle := v_progress.washes_in_cycle + 1;
  v_new_cycle_num := v_progress.cycle_number;

  -- Verificar si alguna recompensa se debe otorgar en esta posición
  FOR v_reward_entry IN SELECT value FROM jsonb_array_elements(v_program.rewards) LOOP
    IF v_new_in_cycle = (v_reward_entry->>'at')::INT THEN
      -- ¿Ya tiene una recompensa de este tipo disponible? (no duplicar)
      IF NOT EXISTS (
        SELECT 1 FROM public.loyalty_rewards
         WHERE customer_id = p_customer_id
           AND program_id  = v_program.id
           AND reward_slug = v_reward_entry->>'reward_slug'
           AND status      = 'available'
      ) THEN
        INSERT INTO public.loyalty_rewards (customer_id, program_id, reward_name, reward_slug, ticket_id)
        VALUES (
          p_customer_id,
          v_program.id,
          v_reward_entry->>'reward',
          v_reward_entry->>'reward_slug',
          p_ticket_id
        )
        RETURNING id INTO v_reward_id;

        v_reward_item := jsonb_build_object(
          'reward_id',   v_reward_id,
          'reward_name', v_reward_entry->>'reward',
          'reward_slug', v_reward_entry->>'reward_slug'
        );
        v_rewards_earned := v_rewards_earned || v_reward_item;
      END IF;
    END IF;
  END LOOP;

  -- Si completó el ciclo, reiniciar
  IF v_new_in_cycle >= v_program.cycle_size THEN
    v_new_in_cycle  := 0;
    v_new_cycle_num := v_new_cycle_num + 1;
  END IF;

  -- Actualizar progreso
  UPDATE public.loyalty_progress
     SET washes_in_cycle = v_new_in_cycle,
         total_washes    = v_new_total,
         cycle_number    = v_new_cycle_num,
         updated_at      = now()
   WHERE customer_id = p_customer_id AND program_id = v_program.id;

  -- Log individual
  INSERT INTO public.loyalty_wash_log (customer_id, program_id, ticket_id, service_id, wash_number, user_id,
    reward_earned_id)
  VALUES (
    p_customer_id, v_program.id, p_ticket_id, p_service_id, v_new_in_cycle,
    p_user_id,
    CASE WHEN jsonb_array_length(v_rewards_earned) > 0 THEN (v_rewards_earned->0->>'reward_id')::INT ELSE NULL END
  );

  RETURN jsonb_build_object(
    'recorded',        true,
    'program',         v_program.name,
    'program_slug',    v_program.slug,
    'total_washes',    v_new_total,
    'washes_in_cycle', v_new_in_cycle,
    'cycle_number',    v_new_cycle_num,
    'cycle_size',      v_program.cycle_size,
    'rewards_earned',  v_rewards_earned
  );
END;
$$;

-- ── 5. RPC: redeem_loyalty_reward ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.redeem_loyalty_reward(
  p_reward_id   INT,
  p_ticket_id   BIGINT DEFAULT NULL,
  p_user_id     UUID   DEFAULT NULL,
  p_notes       TEXT   DEFAULT NULL,
  p_admin_override BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reward RECORD;
BEGIN
  SELECT * INTO v_reward FROM public.loyalty_rewards WHERE id = p_reward_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'reward_not_found');
  END IF;

  IF v_reward.status != 'available' THEN
    RETURN jsonb_build_object('success', false, 'error', 'reward_not_available', 'status', v_reward.status);
  END IF;

  -- Marcar como canjeada
  UPDATE public.loyalty_rewards
     SET status = 'redeemed'
   WHERE id = p_reward_id;

  -- Registrar en log de canjes
  INSERT INTO public.loyalty_redemptions (reward_id, customer_id, ticket_id, user_id, notes, overridden_by_admin)
  VALUES (p_reward_id, v_reward.customer_id, p_ticket_id, p_user_id, p_notes, p_admin_override);

  RETURN jsonb_build_object(
    'success',      true,
    'reward_id',    p_reward_id,
    'reward_name',  v_reward.reward_name,
    'customer_id',  v_reward.customer_id
  );
END;
$$;

-- ── 6. COMENTARIOS ──────────────────────────────────────────────────────────
COMMENT ON COLUMN public.services.loyalty_program IS
  'Programa de lealtad al que suma este servicio: "premium" | "nitido" | NULL';
COMMENT ON TABLE public.loyalty_programs IS
  'Catálogo de programas de lealtad. Extensible sin modificar lógica existente.';
COMMENT ON TABLE public.loyalty_progress IS
  'Progreso de cada cliente en cada programa de lealtad.';
COMMENT ON TABLE public.loyalty_rewards IS
  'Recompensas ganadas por los clientes. Estados: available | redeemed | expired.';
COMMENT ON TABLE public.loyalty_redemptions IS
  'Log de auditoría de cada canje de recompensa.';
COMMENT ON TABLE public.loyalty_wash_log IS
  'Historial individual de cada lavada registrada en programas de lealtad.';
