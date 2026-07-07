-- ============================================================================
-- LOYALTY V3: Redemption Flow — Canjes como ventas reales
-- Fecha: 2026-07-07
-- Agrega columnas a tickets para rastrear canjes de lealtad.
-- No modifica lógica existente — solo agrega campos nullable.
-- ============================================================================

-- ── 1. Columnas en tickets ───────────────────────────────────────────────────

-- Marca si este ticket es un canje de lealtad
ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS is_loyalty_redemption BOOLEAN NOT NULL DEFAULT false;

-- FK a la recompensa canjeada (nullable para tickets normales)
ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS loyalty_reward_id INT
  REFERENCES public.loyalty_rewards(id) ON DELETE SET NULL;

-- Monto original antes del descuento de lealtad (para reportes de costo real)
ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS loyalty_original_amount NUMERIC(10,2) NOT NULL DEFAULT 0;

-- Índices para reportes
CREATE INDEX IF NOT EXISTS idx_tickets_is_loyalty_redemption ON public.tickets(is_loyalty_redemption);
CREATE INDEX IF NOT EXISTS idx_tickets_loyalty_reward_id     ON public.tickets(loyalty_reward_id);

-- ── 2. ticket_items: discount_reason ────────────────────────────────────────
-- Campo para etiquetar el origen del descuento en cada ítem
ALTER TABLE public.ticket_items
  ADD COLUMN IF NOT EXISTS discount_reason TEXT DEFAULT NULL;
-- Valores posibles: 'loyalty_redemption' | 'membership' | 'manual' | NULL

COMMENT ON COLUMN public.ticket_items.discount_reason IS
  'Origen del descuento: loyalty_redemption | membership | manual | NULL';

-- ── 3. Actualizar loyalty_programs.rewards JSONB ─────────────────────────────
-- Agregar service_name_like a cada recompensa para la relación fija reward→service.
-- Este campo NO puede editarse desde UI — está hardcoded en el seed.

UPDATE public.loyalty_programs
SET rewards = '[
  {"at":5,"reward":"Lavado Nítido GRATIS","reward_slug":"nitido_gratis","service_name_like":"Nítido"},
  {"at":9,"reward":"Tratamiento Cerámico GRATIS","reward_slug":"ceramic_wax_gratis","service_name_like":"Tratamiento Cerámico"}
]'::jsonb
WHERE slug = 'premium';

UPDATE public.loyalty_programs
SET rewards = '[
  {"at":5,"reward":"Lavado Breve GRATIS","reward_slug":"breve_gratis","service_name_like":"Breve"},
  {"at":9,"reward":"Pasteado Meguiar GRATIS","reward_slug":"pasteado_gratis","service_name_like":"Pasteado Meguiar"}
]'::jsonb
WHERE slug = 'nitido';

-- ── 4. RPC: validate_loyalty_redemption ─────────────────────────────────────
-- Validación server-side antes de confirmar el pago.
-- Verifica: reward existe, pertenece al cliente, está disponible, 
-- y el nombre del servicio coincide con service_name_like del reward.
CREATE OR REPLACE FUNCTION public.validate_loyalty_redemption(
  p_reward_id     INT,
  p_customer_id   BIGINT,
  p_service_name  TEXT   -- nombre del servicio en el ticket
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reward       RECORD;
  v_program      RECORD;
  v_reward_def   JSONB;
  v_svc_like     TEXT;
BEGIN
  -- Obtener la recompensa
  SELECT * INTO v_reward FROM public.loyalty_rewards WHERE id = p_reward_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'error', 'reward_not_found');
  END IF;

  -- Verificar que pertenece al cliente
  IF v_reward.customer_id != p_customer_id THEN
    RETURN jsonb_build_object('valid', false, 'error', 'reward_wrong_customer');
  END IF;

  -- Verificar que está disponible
  IF v_reward.status != 'available' THEN
    RETURN jsonb_build_object('valid', false, 'error', 'reward_not_available', 'status', v_reward.status);
  END IF;

  -- Obtener el programa y la definición del reward con service_name_like
  SELECT * INTO v_program FROM public.loyalty_programs WHERE id = v_reward.program_id;

  SELECT value INTO v_reward_def
  FROM jsonb_array_elements(v_program.rewards)
  WHERE value->>'reward_slug' = v_reward.reward_slug
  LIMIT 1;

  IF v_reward_def IS NULL THEN
    RETURN jsonb_build_object('valid', false, 'error', 'reward_definition_not_found');
  END IF;

  v_svc_like := v_reward_def->>'service_name_like';

  -- Verificar que el servicio coincide con el premio (case-insensitive, contiene)
  IF v_svc_like IS NULL OR
     NOT (lower(p_service_name) LIKE '%' || lower(v_svc_like) || '%') THEN
    RETURN jsonb_build_object(
      'valid',        false,
      'error',        'service_mismatch',
      'expected',     v_svc_like,
      'received',     p_service_name,
      'error_msg',    'El premio "' || v_reward.reward_name || '" solo puede canjearse por: ' || v_svc_like
    );
  END IF;

  RETURN jsonb_build_object(
    'valid',              true,
    'reward_name',        v_reward.reward_name,
    'reward_slug',        v_reward.reward_slug,
    'service_name_like',  v_svc_like
  );
END;
$$;

-- ── 5. Protección auditoría: loyalty_redemptions NO deletable ────────────────
-- Eliminar política de DELETE si existe y reemplazar por denegación total
DROP POLICY IF EXISTS "Admin delete loyalty_redemptions" ON public.loyalty_redemptions;
-- No hay política de DELETE para nadie → registros permanentes

-- ── 6. Vista: loyalty_redemption_report ─────────────────────────────────────
-- Vista para reportes que muestra canjes con todos los datos de auditoría
CREATE OR REPLACE VIEW public.loyalty_redemption_report AS
SELECT
  t.id                      AS ticket_id,
  t.ticket_number,
  t.created_at,
  t.is_loyalty_redemption,
  t.loyalty_original_amount AS original_amount,
  t.loyalty_original_amount AS discount_applied,
  t.total                   AS amount_paid,
  c.name                    AS customer_name,
  c.phone                   AS customer_phone,
  c.plate                   AS customer_plate,
  lr.reward_name,
  lr.reward_slug,
  lp.name                   AS program_name,
  lp.slug                   AS program_slug,
  lrd.redeemed_at,
  lrd.notes,
  lrd.overridden_by_admin,
  t.user_id                 AS cashier_id
FROM public.tickets t
LEFT JOIN public.customers c         ON c.id = t.customer_id
LEFT JOIN public.loyalty_rewards lr  ON lr.id = t.loyalty_reward_id
LEFT JOIN public.loyalty_programs lp ON lp.id = lr.program_id
LEFT JOIN public.loyalty_redemptions lrd ON lrd.ticket_id = t.id
WHERE t.is_loyalty_redemption = true
ORDER BY t.created_at DESC;

-- RLS: solo authenticated puede leer la vista
-- (Las vistas heredan RLS de las tablas base en Supabase)

COMMENT ON VIEW public.loyalty_redemption_report IS
  'Vista de auditoría de canjes del programa de lealtad. Registros permanentes.';

