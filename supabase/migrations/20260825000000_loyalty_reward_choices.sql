-- ============================================================================
-- LOYALTY REWARD CHOICES: Recompensas con selección de opciones
-- Fecha: 2026-08-25
-- Fases 1-4: Modelo datos + RPCs actualizados
-- ============================================================================

-- ── FASE 1: Columnas en loyalty_rewards ──────────────────────────────────────

ALTER TABLE public.loyalty_rewards
  ADD COLUMN IF NOT EXISTS option_group    TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS option_slug     TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS selected_option TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS selected_at     TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN public.loyalty_rewards.option_group    IS 'Grupo de opciones del mismo milestone. NULL = recompensa fija.';
COMMENT ON COLUMN public.loyalty_rewards.option_slug     IS 'Slug de la opcion especifica de este registro.';
COMMENT ON COLUMN public.loyalty_rewards.selected_option IS 'Opcion seleccionada por el cliente. NULL = sin seleccionar.';
COMMENT ON COLUMN public.loyalty_rewards.selected_at     IS 'Timestamp de seleccion de opcion.';

CREATE INDEX IF NOT EXISTS idx_loyalty_rewards_option_group ON public.loyalty_rewards(option_group)
  WHERE option_group IS NOT NULL;

-- ── FASE 1: Actualizar loyalty_programs.rewards JSONB ────────────────────────

UPDATE public.loyalty_programs
SET rewards = '[
  {
    "at": 5,
    "type": "choice",
    "options": [
      {
        "reward": "Lavado Nitido GRATIS",
        "reward_slug": "nitido_gratis",
        "service_name_like": "Nitido",
        "discount_percent": 100,
        "target_service_slug": null
      },
      {
        "reward": "40% Descuento en Lavado Premium",
        "reward_slug": "nitido_40pct_premium",
        "service_name_like": "Premium",
        "discount_percent": 40,
        "target_service_slug": "premium"
      }
    ]
  },
  {
    "at": 9,
    "type": "fixed",
    "options": [
      {
        "reward": "Tratamiento Ceramico GRATIS",
        "reward_slug": "ceramic_wax_gratis",
        "service_name_like": "Tratamiento",
        "discount_percent": 100,
        "target_service_slug": null
      }
    ]
  }
]'::jsonb
WHERE slug = 'premium';

UPDATE public.loyalty_programs
SET rewards = '[
  {
    "at": 5,
    "type": "choice",
    "options": [
      {
        "reward": "Lavado Breve GRATIS",
        "reward_slug": "breve_gratis",
        "service_name_like": "Breve",
        "discount_percent": 100,
        "target_service_slug": null
      },
      {
        "reward": "40% Descuento en Lavado Nitido",
        "reward_slug": "breve_40pct_nitido",
        "service_name_like": "Nitido",
        "discount_percent": 40,
        "target_service_slug": "nitido"
      }
    ]
  },
  {
    "at": 9,
    "type": "fixed",
    "options": [
      {
        "reward": "Pasteado Meguiar GRATIS",
        "reward_slug": "pasteado_gratis",
        "service_name_like": "Pasteado Meguiar",
        "discount_percent": 100,
        "target_service_slug": null
      }
    ]
  }
]'::jsonb
WHERE slug = 'nitido';

-- ── FASE 2: record_loyalty_v3_wash — genera 2 rewards para type=choice ────────

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
  v_option           JSONB;
  v_option_group     TEXT;
  v_first_reward_id  INT;
  v_fixed_option     JSONB;
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

  v_new_total     := v_progress.total_washes + 1;
  v_new_in_cycle  := v_progress.washes_in_cycle + 1;
  v_new_cycle_num := v_progress.cycle_number;

  -- Verificar si alguna recompensa se debe otorgar en esta posicion
  FOR v_reward_entry IN SELECT value FROM jsonb_array_elements(v_program.rewards) LOOP
    IF v_new_in_cycle = (v_reward_entry->>'at')::INT THEN

      IF COALESCE(v_reward_entry->>'type', 'fixed') = 'choice' THEN
        -- Tipo choice: generar 2 recompensas con el mismo option_group
        v_option_group := v_program.slug || '_' || (v_reward_entry->>'at') || 'w_c' || v_new_cycle_num::TEXT;

        IF NOT EXISTS (
          SELECT 1 FROM public.loyalty_rewards
           WHERE customer_id  = p_customer_id
             AND program_id   = v_program.id
             AND option_group = v_option_group
        ) THEN
          v_first_reward_id := NULL;
          FOR v_option IN SELECT value FROM jsonb_array_elements(v_reward_entry->'options') LOOP
            INSERT INTO public.loyalty_rewards (
              customer_id, program_id, reward_name, reward_slug, ticket_id,
              option_group, option_slug
            )
            VALUES (
              p_customer_id,
              v_program.id,
              v_option->>'reward',
              v_option->>'reward_slug',
              p_ticket_id,
              v_option_group,
              v_option->>'reward_slug'
            )
            RETURNING id INTO v_reward_id;

            IF v_first_reward_id IS NULL THEN
              v_first_reward_id := v_reward_id;
              v_reward_item := jsonb_build_object(
                'reward_id',    v_reward_id,
                'reward_name',  v_option->>'reward',
                'reward_slug',  v_option->>'reward_slug',
                'type',         'choice',
                'option_group', v_option_group
              );
              v_rewards_earned := v_rewards_earned || v_reward_item;
            END IF;
          END LOOP;
        END IF;

      ELSE
        -- Tipo fixed: comportamiento original con primera option
        SELECT value INTO v_fixed_option
          FROM jsonb_array_elements(v_reward_entry->'options')
         LIMIT 1;

        IF v_fixed_option IS NULL THEN
          CONTINUE;
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM public.loyalty_rewards
           WHERE customer_id = p_customer_id
             AND program_id  = v_program.id
             AND reward_slug = v_fixed_option->>'reward_slug'
             AND status      = 'available'
        ) THEN
          INSERT INTO public.loyalty_rewards (customer_id, program_id, reward_name, reward_slug, ticket_id)
          VALUES (
            p_customer_id,
            v_program.id,
            v_fixed_option->>'reward',
            v_fixed_option->>'reward_slug',
            p_ticket_id
          )
          RETURNING id INTO v_reward_id;

          v_reward_item := jsonb_build_object(
            'reward_id',   v_reward_id,
            'reward_name', v_fixed_option->>'reward',
            'reward_slug', v_fixed_option->>'reward_slug',
            'type',        'fixed'
          );
          v_rewards_earned := v_rewards_earned || v_reward_item;
        END IF;
      END IF;

    END IF;
  END LOOP;

  -- Si completo el ciclo, reiniciar
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
  INSERT INTO public.loyalty_wash_log (customer_id, program_id, ticket_id, service_id, wash_number, user_id, reward_earned_id)
  VALUES (
    p_customer_id, v_program.id, p_ticket_id, p_service_id, v_new_in_cycle,
    p_user_id,
    CASE WHEN jsonb_array_length(v_rewards_earned) > 0
         THEN (v_rewards_earned->0->>'reward_id')::INT
         ELSE NULL END
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

-- ── FASE 3: select_reward_option ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.select_reward_option(
  p_reward_id   INT,
  p_option_slug TEXT,
  p_customer_id BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reward RECORD;
BEGIN
  SELECT * INTO v_reward
    FROM public.loyalty_rewards
   WHERE id = p_reward_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'reward_not_found');
  END IF;

  IF v_reward.customer_id != p_customer_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'reward_wrong_customer');
  END IF;

  IF v_reward.status != 'available' THEN
    RETURN jsonb_build_object('success', false, 'error', 'reward_not_available', 'status', v_reward.status);
  END IF;

  IF v_reward.selected_option IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'option_already_selected', 'selected', v_reward.selected_option);
  END IF;

  IF v_reward.option_group IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'reward_is_fixed_not_choice');
  END IF;

  -- Marcar la opcion seleccionada
  UPDATE public.loyalty_rewards
     SET selected_option = p_option_slug,
         selected_at     = now()
   WHERE id = p_reward_id;

  -- Expirar alternativas del mismo grupo
  UPDATE public.loyalty_rewards
     SET status = 'expired'
   WHERE option_group = v_reward.option_group
     AND customer_id  = p_customer_id
     AND id != p_reward_id
     AND status = 'available';

  RETURN jsonb_build_object(
    'success',         true,
    'selected_option', p_option_slug,
    'reward_name',     v_reward.reward_name,
    'group_id',        v_reward.option_group
  );
END;
$$;

-- ── FASE 4: validate_loyalty_redemption — acepta discount_percent < 100 ───────

CREATE OR REPLACE FUNCTION public.validate_loyalty_redemption(
  p_reward_id     INT,
  p_customer_id   BIGINT,
  p_service_name  TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reward       RECORD;
  v_program      RECORD;
  v_milestone    JSONB;
  v_option_def   JSONB;
  v_svc_like     TEXT;
  v_discount_pct INT;
BEGIN
  SELECT * INTO v_reward FROM public.loyalty_rewards WHERE id = p_reward_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'error', 'reward_not_found');
  END IF;

  IF v_reward.customer_id != p_customer_id THEN
    RETURN jsonb_build_object('valid', false, 'error', 'reward_wrong_customer');
  END IF;

  IF v_reward.status != 'available' THEN
    RETURN jsonb_build_object('valid', false, 'error', 'reward_not_available', 'status', v_reward.status);
  END IF;

  SELECT * INTO v_program FROM public.loyalty_programs WHERE id = v_reward.program_id;

  -- Buscar definicion en estructura nueva (milestones con options[])
  v_svc_like     := NULL;
  v_discount_pct := 100;

  FOR v_milestone IN SELECT value FROM jsonb_array_elements(v_program.rewards) LOOP
    IF v_milestone->'options' IS NOT NULL THEN
      FOR v_option_def IN SELECT value FROM jsonb_array_elements(v_milestone->'options') LOOP
        IF v_option_def->>'reward_slug' = v_reward.reward_slug THEN
          v_svc_like     := v_option_def->>'service_name_like';
          v_discount_pct := COALESCE((v_option_def->>'discount_percent')::INT, 100);
          EXIT;
        END IF;
      END LOOP;
    ELSE
      -- Estructura legacy: reward_slug en raiz del milestone
      IF v_milestone->>'reward_slug' = v_reward.reward_slug THEN
        v_svc_like     := v_milestone->>'service_name_like';
        v_discount_pct := 100;
        EXIT;
      END IF;
    END IF;
    EXIT WHEN v_svc_like IS NOT NULL;
  END LOOP;

  IF v_svc_like IS NULL THEN
    RETURN jsonb_build_object('valid', false, 'error', 'reward_definition_not_found');
  END IF;

  IF NOT (lower(p_service_name) LIKE '%' || lower(v_svc_like) || '%') THEN
    RETURN jsonb_build_object(
      'valid',       false,
      'error',       'service_mismatch',
      'expected',    v_svc_like,
      'received',    p_service_name,
      'error_msg',   'El premio "' || v_reward.reward_name || '" solo puede canjearse por: ' || v_svc_like
    );
  END IF;

  RETURN jsonb_build_object(
    'valid',             true,
    'reward_name',       v_reward.reward_name,
    'reward_slug',       v_reward.reward_slug,
    'service_name_like', v_svc_like,
    'discount_percent',  v_discount_pct
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.select_reward_option(INT, TEXT, BIGINT)          TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_loyalty_v3_wash(BIGINT, BIGINT, INT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_loyalty_redemption(INT, BIGINT, TEXT)    TO authenticated;
