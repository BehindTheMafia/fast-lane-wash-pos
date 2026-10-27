-- A custom charge has no catalog service_id, but must have a visible concept.
-- NOT VALID keeps historical rows intact while checking every new or edited row.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.ticket_items'::regclass
      AND conname = 'ticket_service_has_identity'
  ) THEN
    ALTER TABLE public.ticket_items
      ADD CONSTRAINT ticket_service_has_identity
      CHECK (
        item_type IS DISTINCT FROM 'service'::public.ticket_item_type
        OR service_id IS NOT NULL
        OR nullif(btrim(service_name_snapshot), '') IS NOT NULL
      ) NOT VALID;
  END IF;
END $$;

-- Sales from the car-wash POS use T- numbers. Membership sales use M-/MR-
-- and still create their ticket and item through separate API requests.
CREATE OR REPLACE FUNCTION loyalty_private.require_car_wash_ticket_service()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE checked_ticket_id bigint;
BEGIN
  IF TG_TABLE_NAME = 'tickets' THEN
    IF TG_OP = 'UPDATE'
      AND OLD.status IS NOT DISTINCT FROM NEW.status
      AND OLD.business_line IS NOT DISTINCT FROM NEW.business_line
      AND OLD.ticket_number IS NOT DISTINCT FROM NEW.ticket_number THEN
      RETURN NEW;
    END IF;
    checked_ticket_id := NEW.id;
  ELSE
    checked_ticket_id := OLD.ticket_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.tickets t
    WHERE t.id = checked_ticket_id
      AND t.status = 'paid'
      AND t.business_line = 'car_wash'
      AND t.ticket_number LIKE 'T-%'
      AND NOT EXISTS (
        SELECT 1 FROM public.ticket_items ti
        WHERE ti.ticket_id = t.id
          AND ti.item_type = 'service'
          AND (
            ti.service_id IS NOT NULL
            OR nullif(btrim(ti.service_name_snapshot), '') IS NOT NULL
          )
      )
  ) THEN
    RAISE EXCEPTION 'No se puede guardar un ticket pagado sin servicio o concepto.'
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION loyalty_private.require_car_wash_ticket_service() FROM PUBLIC, anon, authenticated;

-- Deferred checks see the final state of the transaction, so the atomic POS
-- function can create a pending ticket, add items, and mark it paid.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.tickets'::regclass
      AND tgname = 'car_wash_paid_ticket_has_service'
  ) THEN
    CREATE CONSTRAINT TRIGGER car_wash_paid_ticket_has_service
    AFTER INSERT OR UPDATE ON public.tickets
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION loyalty_private.require_car_wash_ticket_service();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.ticket_items'::regclass
      AND tgname = 'car_wash_paid_ticket_keeps_service'
  ) THEN
    CREATE CONSTRAINT TRIGGER car_wash_paid_ticket_keeps_service
    AFTER DELETE OR UPDATE ON public.ticket_items
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION loyalty_private.require_car_wash_ticket_service();
  END IF;
END $$;
