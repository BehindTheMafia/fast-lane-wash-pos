BEGIN;

-- Private, server-owned state. Nothing here is exposed through the Data API.
CREATE TABLE loyalty_private.recent_sale_guards (
  fingerprint text PRIMARY KEY,
  ticket_id bigint NOT NULL,
  confirmed_at timestamptz NOT NULL
);
ALTER TABLE loyalty_private.recent_sale_guards ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON loyalty_private.recent_sale_guards FROM PUBLIC, anon, authenticated;

CREATE FUNCTION loyalty_private.sale_fingerprint(p_ticket_id bigint)
RETURNS text LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT encode(sha256(convert_to(jsonb_build_object(
    'area', t.business_line,
    'customer', t.customer_id,
    -- Unidentified walk-ins share a customer record. Scope those to the cashier
    -- so two cashiers serving different walk-ins do not block each other.
    'cashier', CASE WHEN t.customer_id IS NULL OR coalesce(c.is_general, false) THEN t.user_id END,
    'vehicle', CASE WHEN t.business_line = 'car_wash' THEN t.vehicle_type_id END,
    'plate', CASE WHEN t.business_line = 'car_wash'
      THEN regexp_replace(upper(coalesce(t.vehicle_plate, '')), '[^[:alnum:]]', '', 'g') END,
    'kind', CASE WHEN t.ticket_number LIKE 'M-%' OR t.ticket_number LIKE 'MR-%' THEN 'membership_sale' ELSE 'sale' END,
    'total', round(t.total, 2),
    'items', CASE WHEN t.ticket_number LIKE 'M-%' OR t.ticket_number LIKE 'MR-%' THEN '[]'::jsonb ELSE (
      SELECT coalesce(jsonb_agg(jsonb_build_array(x.kind, x.service_id, x.product_id, x.concept, x.quantity, x.amount)
        ORDER BY x.kind, x.service_id, x.product_id, x.concept), '[]'::jsonb)
      FROM (
        SELECT i.item_type::text AS kind, i.service_id, i.product_id,
          CASE WHEN i.service_id IS NULL AND i.product_id IS NULL
            THEN lower(regexp_replace(btrim(coalesce(i.service_name_snapshot, '')), '\s+', ' ', 'g')) ELSE '' END AS concept,
          sum(coalesce(i.quantity, 1)) AS quantity, round(sum(coalesce(i.price, 0)), 2) AS amount
        FROM public.ticket_items i WHERE i.ticket_id = t.id
        GROUP BY 1, 2, 3, 4
      ) x
    ) END
  )::text, 'UTF8')), 'hex')
  FROM public.tickets t LEFT JOIN public.customers c ON c.id = t.customer_id
  WHERE t.id = p_ticket_id;
$$;
REVOKE ALL ON FUNCTION loyalty_private.sale_fingerprint(bigint) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION loyalty_private.prevent_duplicate_sale()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  sale public.tickets%ROWTYPE;
  previous loyalty_private.recent_sale_guards%ROWTYPE;
  signature text;
  original_number text;
  checked_at timestamptz;
  seconds_left int;
BEGIN
  -- Only a new sale or an actual transition to paid is checked. Report edits,
  -- cancellations and reprints must not restart the duplicate window.
  IF TG_OP = 'UPDATE' AND (OLD.status = 'paid' OR NEW.status <> 'paid') THEN RETURN NEW; END IF;
  SELECT * INTO sale FROM public.tickets WHERE id = NEW.id;
  IF NOT FOUND OR sale.status <> 'paid' THEN RETURN NEW; END IF;
  IF auth.uid() IS NOT NULL THEN PERFORM loyalty_private.require_staff(); END IF;

  signature := loyalty_private.sale_fingerprint(sale.id);
  INSERT INTO loyalty_private.recent_sale_guards(fingerprint, ticket_id, confirmed_at)
    VALUES(signature, sale.id, clock_timestamp()) ON CONFLICT DO NOTHING;
  -- A real row lock serializes different UUIDs and cashiers. At stricter
  -- isolation levels a conflicting write fails rather than accepting both.
  SELECT * INTO previous FROM loyalty_private.recent_sale_guards
    WHERE fingerprint = signature FOR UPDATE;
  IF previous.ticket_id = sale.id THEN RETURN NEW; END IF;
  checked_at := clock_timestamp();
  SELECT ticket_number INTO original_number FROM public.tickets
    WHERE id = previous.ticket_id AND status = 'paid';
  IF FOUND AND previous.confirmed_at > checked_at - interval '30 seconds' THEN
    seconds_left := greatest(1, ceil(extract(epoch FROM previous.confirmed_at + interval '30 seconds' - checked_at))::int);
    RAISE EXCEPTION 'Posible venta duplicada. Ya existe el ticket %. No se registró otro cobro. Revisa ese ticket antes de repetir la atención (% segundos).', original_number, seconds_left
      USING ERRCODE = 'P0001', DETAIL = jsonb_build_object(
        'code', 'DUPLICATE_SALE', 'ticket_id', previous.ticket_id,
        'ticket_number', original_number, 'business_line', sale.business_line,
        'retry_after_seconds', seconds_left
      )::text;
  END IF;
  UPDATE loyalty_private.recent_sale_guards SET ticket_id = sale.id, confirmed_at = checked_at
    WHERE fingerprint = signature;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION loyalty_private.prevent_duplicate_sale() FROM PUBLIC, anon, authenticated;

-- Deferred execution sees every final concept, including mixed-area sales.
-- Rejecting here rolls back the entire RPC: stock, benefits, payments and UUID.
CREATE CONSTRAINT TRIGGER prevent_duplicate_paid_sale
AFTER INSERT OR UPDATE OF status ON public.tickets
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION loyalty_private.prevent_duplicate_sale();

-- Cover transactions committed just before installation; preserve all tickets.
INSERT INTO loyalty_private.recent_sale_guards(fingerprint, ticket_id, confirmed_at)
SELECT DISTINCT ON (loyalty_private.sale_fingerprint(t.id))
  loyalty_private.sale_fingerprint(t.id), t.id, t.created_at
FROM public.tickets t
WHERE t.status = 'paid' AND t.created_at > clock_timestamp() - interval '30 seconds'
ORDER BY loyalty_private.sale_fingerprint(t.id), t.created_at DESC, t.id DESC
ON CONFLICT DO NOTHING;

COMMIT;
