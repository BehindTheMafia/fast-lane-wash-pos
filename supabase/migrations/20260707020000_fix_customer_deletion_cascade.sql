-- Fix customer deletion cascade constraints for Loyalty V3

-- 1. loyalty_redemptions.customer_id
ALTER TABLE public.loyalty_redemptions
  DROP CONSTRAINT IF EXISTS loyalty_redemptions_customer_id_fkey;

ALTER TABLE public.loyalty_redemptions
  ADD CONSTRAINT loyalty_redemptions_customer_id_fkey
  FOREIGN KEY (customer_id)
  REFERENCES public.customers(id)
  ON DELETE CASCADE;

-- 2. loyalty_redemptions.reward_id
ALTER TABLE public.loyalty_redemptions
  DROP CONSTRAINT IF EXISTS loyalty_redemptions_reward_id_fkey;

ALTER TABLE public.loyalty_redemptions
  ADD CONSTRAINT loyalty_redemptions_reward_id_fkey
  FOREIGN KEY (reward_id)
  REFERENCES public.loyalty_rewards(id)
  ON DELETE CASCADE;

-- 3. loyalty_wash_log.reward_earned_id
ALTER TABLE public.loyalty_wash_log
  DROP CONSTRAINT IF EXISTS loyalty_wash_log_reward_earned_id_fkey;

ALTER TABLE public.loyalty_wash_log
  ADD CONSTRAINT loyalty_wash_log_reward_earned_id_fkey
  FOREIGN KEY (reward_earned_id)
  REFERENCES public.loyalty_rewards(id)
  ON DELETE SET NULL;
