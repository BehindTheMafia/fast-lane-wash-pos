-- ══════════════════════════════════════════════════════════════════════════════
-- reverse_loyalty_on_ticket_delete
-- Reverses all loyalty side-effects when a ticket is deleted from Reports.
--
-- What it does (atomically):
--   1. Finds all loyalty_wash_log entries for the ticket
--   2. For each affected program, decrements loyalty_progress counters
--   3. Deletes any loyalty_rewards earned by this ticket IF status='available'
--      (already-redeemed rewards are left intact — can't un-ring that bell)
--   4. Deletes the loyalty_wash_log entries themselves
--
-- Returns: { reversed: bool, washes_removed: int, rewards_removed: int, details: [...] }
-- ══════════════════════════════════════════════════════════════════════════════

-- Ensure authenticated users can delete wash log entries (needed for reversal)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE tablename = 'loyalty_wash_log'
       AND policyname = 'Authenticated delete loyalty_wash_log'
  ) THEN
    CREATE POLICY "Authenticated delete loyalty_wash_log"
      ON public.loyalty_wash_log FOR DELETE TO authenticated USING (true);
  END IF;
END $$;

-- Ensure authenticated users can delete rewards (needed for reversal of un-redeemed rewards)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE tablename = 'loyalty_rewards'
       AND policyname = 'Authenticated delete loyalty_rewards_reversal'
  ) THEN
    CREATE POLICY "Authenticated delete loyalty_rewards_reversal"
      ON public.loyalty_rewards FOR DELETE TO authenticated USING (true);
  END IF;
END $$;

-- ── RPC ──────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.reverse_loyalty_on_ticket_delete(
  p_ticket_id BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wash         RECORD;
  v_washes_removed INT := 0;
  v_rewards_removed INT := 0;
  v_details      JSONB := '[]'::JSONB;
  v_progress     RECORD;
  v_program      RECORD;
  v_new_in_cycle INT;
  v_new_total    INT;
BEGIN
  -- Nothing to do if no wash log entries reference this ticket
  IF NOT EXISTS (
    SELECT 1 FROM public.loyalty_wash_log WHERE ticket_id = p_ticket_id
  ) THEN
    RETURN jsonb_build_object(
      'reversed', false,
      'reason', 'no_loyalty_entries',
      'washes_removed', 0,
      'rewards_removed', 0
    );
  END IF;

  -- Process each wash log entry for this ticket
  FOR v_wash IN
    SELECT * FROM public.loyalty_wash_log
     WHERE ticket_id = p_ticket_id
     ORDER BY id
  LOOP
    -- 1. Decrement loyalty_progress for this program
    SELECT * INTO v_progress
      FROM public.loyalty_progress
     WHERE customer_id = v_wash.customer_id
       AND program_id  = v_wash.program_id
     FOR UPDATE;

    IF FOUND THEN
      -- Get program info for cycle_size
      SELECT * INTO v_program
        FROM public.loyalty_programs
       WHERE id = v_wash.program_id;

      v_new_total := GREATEST(0, v_progress.total_washes - 1);

      -- Decrement washes_in_cycle; handle cycle boundary
      IF v_progress.washes_in_cycle > 0 THEN
        v_new_in_cycle := v_progress.washes_in_cycle - 1;
      ELSE
        -- Was at 0 (cycle just completed), roll back to cycle_size - 1
        v_new_in_cycle := GREATEST(0, COALESCE(v_program.cycle_size, 1) - 1);
      END IF;

      UPDATE public.loyalty_progress
         SET washes_in_cycle = v_new_in_cycle,
             total_washes    = v_new_total,
             updated_at      = now()
       WHERE customer_id = v_wash.customer_id
         AND program_id  = v_wash.program_id;
    END IF;

    -- 2. Remove un-redeemed rewards earned by this wash
    IF v_wash.reward_earned_id IS NOT NULL THEN
      -- Check if part of a choice group — if so, delete all options in the group
      DECLARE
        v_reward_rec RECORD;
      BEGIN
        SELECT * INTO v_reward_rec
          FROM public.loyalty_rewards
         WHERE id = v_wash.reward_earned_id;

        IF FOUND AND v_reward_rec.status = 'available' THEN
          IF v_reward_rec.option_group IS NOT NULL THEN
            -- Delete all options in the choice group that are still available
            DELETE FROM public.loyalty_rewards
             WHERE option_group = v_reward_rec.option_group
               AND status = 'available';
          ELSE
            DELETE FROM public.loyalty_rewards
             WHERE id = v_wash.reward_earned_id
               AND status = 'available';
          END IF;
          v_rewards_removed := v_rewards_removed + 1;
        END IF;
      END;
    END IF;

    v_washes_removed := v_washes_removed + 1;
    v_details := v_details || jsonb_build_object(
      'wash_log_id', v_wash.id,
      'program_id',  v_wash.program_id,
      'customer_id', v_wash.customer_id
    );
  END LOOP;

  -- 3. Delete the wash log entries
  DELETE FROM public.loyalty_wash_log
   WHERE ticket_id = p_ticket_id;

  RETURN jsonb_build_object(
    'reversed',        true,
    'washes_removed',  v_washes_removed,
    'rewards_removed', v_rewards_removed,
    'details',         v_details
  );
END;
$$;

COMMENT ON FUNCTION public.reverse_loyalty_on_ticket_delete IS
  'Reverses loyalty progress, rewards, and wash log when a ticket is deleted from Reports.';
