-- Ticket, concepts, stock and payment become visible together at commit.
CREATE FUNCTION public.complete_barbershop_sale(p_request_id uuid, p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  cached record; item jsonb; part jsonb; pay jsonb; tid bigint; result jsonb;
  method text; curr text; rate numeric; total numeric := 0; price numeric; qty int;
  amount numeric; received numeric; change_due numeric;
  part_amount numeric; part_received numeric; part_change numeric;
  parts_amount numeric := 0; parts_received numeric := 0; parts_change numeric := 0;
BEGIN
  PERFORM loyalty_private.require_staff();
  IF p_request_id IS NULL OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Solicitud inválida';
  END IF;
  INSERT INTO loyalty_private.sale_requests(request_id,user_id,payload)
    VALUES(p_request_id,auth.uid(),p_payload) ON CONFLICT DO NOTHING;
  SELECT * INTO cached FROM loyalty_private.sale_requests WHERE request_id=p_request_id FOR UPDATE;
  IF cached.user_id<>auth.uid() OR cached.payload<>p_payload THEN
    -- This rejection does not prove that the original request rolled back.
    RAISE EXCEPTION 'Solicitud duplicada con datos diferentes'
      USING DETAIL = 'IDEMPOTENCY_CONFLICT';
  END IF;
  IF cached.response IS NOT NULL THEN RETURN cached.response; END IF;

  pay:=p_payload->'payment'; method:=pay->>'method'; curr:=pay->>'currency';
  rate:=(p_payload->>'exchange_rate')::numeric;
  IF method IS NULL OR method NOT IN ('cash','card','transfer','mixed') OR
    curr IS NULL OR curr NOT IN ('NIO','USD') OR rate IS NULL OR rate<=0 OR
    rate::text IN ('NaN','Infinity','-Infinity') THEN
    RAISE EXCEPTION 'Método de pago inválido';
  END IF;
  IF jsonb_typeof(p_payload->'items') IS DISTINCT FROM 'array' OR
    jsonb_array_length(p_payload->'items')=0 THEN RAISE EXCEPTION 'Ticket vacío'; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_payload->'items') LOOP
    qty:=(item->>'quantity')::int; price:=(item->>'line_total')::numeric;
    IF qty IS NULL OR qty<=0 OR price IS NULL OR price<0 OR price::text IN ('NaN','Infinity','-Infinity') OR
      nullif(btrim(item->>'name'),'') IS NULL OR item->>'item_type' IS NULL OR
      item->>'item_type' NOT IN ('service','product') THEN RAISE EXCEPTION 'Concepto inválido'; END IF;
    IF item->>'item_type'='service' AND (
      item->>'product_id' IS NOT NULL OR (item->>'service_id' IS NOT NULL AND
        NOT EXISTS(SELECT 1 FROM public.services WHERE id=(item->>'service_id')::bigint AND is_active))
    ) THEN RAISE EXCEPTION 'Servicio inválido'; END IF;
    IF item->>'item_type'='product' AND (item->>'product_id' IS NULL OR item->>'service_id' IS NOT NULL) THEN
      RAISE EXCEPTION 'Producto inválido';
    END IF;
    total:=total+round(price,2);
  END LOOP;

  amount:=round((pay->>'amount')::numeric,2);
  received:=round((pay->>'received')::numeric,2);
  change_due:=round((pay->>'change')::numeric,2);
  IF amount IS NULL OR received IS NULL OR change_due IS NULL OR amount<0 OR received<0 OR change_due<0 OR
    amount::text IN ('NaN','Infinity','-Infinity') OR received::text IN ('NaN','Infinity','-Infinity') OR
    change_due::text IN ('NaN','Infinity','-Infinity') OR
    amount<>round(total/CASE WHEN curr='USD' THEN rate ELSE 1 END,2) OR received-change_due<>amount THEN
    RAISE EXCEPTION 'El pago no coincide con el total';
  END IF;
  IF method IN ('card','transfer') AND change_due<>0 THEN RAISE EXCEPTION 'Cambio inválido'; END IF;
  IF method='mixed' THEN
    IF jsonb_typeof(pay->'mixedPayments') IS DISTINCT FROM 'array' OR
      jsonb_array_length(pay->'mixedPayments')<2 THEN RAISE EXCEPTION 'Falta el desglose del pago mixto'; END IF;
    IF (SELECT count(DISTINCT value->>'method') FROM jsonb_array_elements(pay->'mixedPayments'))<2 THEN
      RAISE EXCEPTION 'El pago mixto requiere al menos dos métodos';
    END IF;
    FOR part IN SELECT value FROM jsonb_array_elements(pay->'mixedPayments') LOOP
      part_amount:=round((part->>'amount')::numeric,2);
      part_received:=round((part->>'received')::numeric,2);
      part_change:=round((part->>'change')::numeric,2);
      IF part->>'method' IS NULL OR part->>'method' NOT IN ('cash','card','transfer') OR
        part_amount IS NULL OR part_received IS NULL OR part_change IS NULL OR
        part_amount<=0 OR part_received<0 OR part_change<0 OR
        part_amount::text IN ('NaN','Infinity','-Infinity') OR part_received::text IN ('NaN','Infinity','-Infinity') OR
        part_change::text IN ('NaN','Infinity','-Infinity') OR part_received-part_change<>part_amount OR
        (part->>'method'<>'cash' AND part_change<>0) THEN RAISE EXCEPTION 'Parte del pago inválida'; END IF;
      parts_amount:=parts_amount+part_amount;
      parts_received:=parts_received+part_received;
      parts_change:=parts_change+part_change;
    END LOOP;
    IF parts_amount<>amount OR parts_received<>received OR parts_change<>change_due THEN
      RAISE EXCEPTION 'Desglose mixto inválido';
    END IF;
  END IF;

  INSERT INTO public.tickets(ticket_number,user_id,customer_id,vehicle_type_id,vehicle_plate,total,status,business_line)
  VALUES('B-'||upper(replace(p_request_id::text,'-','')),auth.uid(),(p_payload->>'customer_id')::bigint,NULL,'',total,'pending','barbershop')
  RETURNING id INTO tid;
  FOR item IN SELECT value FROM jsonb_array_elements(p_payload->'items') LOOP
    qty:=(item->>'quantity')::int; price:=round((item->>'line_total')::numeric,2);
    INSERT INTO public.ticket_items(ticket_id,item_type,service_id,product_id,quantity,price,price_snapshot,service_name_snapshot)
    VALUES(tid,(item->>'item_type')::public.ticket_item_type,(item->>'service_id')::bigint,(item->>'product_id')::bigint,qty,price,price/qty,item->>'name');
    IF item->>'item_type'='product' THEN PERFORM public.decrement_product_stock((item->>'product_id')::bigint,qty,tid); END IF;
  END LOOP;
  INSERT INTO public.payments(ticket_id,amount,currency,payment_method,amount_received,change_amount,exchange_rate)
  VALUES(tid,amount,curr,method,received,change_due,rate);
  IF method='mixed' THEN
    FOR part IN SELECT value FROM jsonb_array_elements(pay->'mixedPayments') LOOP
      part_amount:=round((part->>'amount')::numeric,2); part_change:=round((part->>'change')::numeric,2);
      INSERT INTO public.ticket_mixed_payments(ticket_id,method,currency,amount,exchange_rate,amount_nio,applied_nio,change_nio)
      VALUES(tid,part->>'method',curr,part_amount,rate,
        round(part_amount*CASE WHEN curr='USD' THEN rate ELSE 1 END,2),
        round(part_amount*CASE WHEN curr='USD' THEN rate ELSE 1 END,2),
        round(part_change*CASE WHEN curr='USD' THEN rate ELSE 1 END,2));
    END LOOP;
  END IF;
  UPDATE public.tickets SET status='paid' WHERE id=tid;
  SELECT jsonb_build_object('success',true,'ticket',to_jsonb(t)) INTO result FROM public.tickets t WHERE t.id=tid;
  UPDATE loyalty_private.sale_requests SET response=result WHERE request_id=p_request_id;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.complete_barbershop_sale(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.complete_barbershop_sale(uuid,jsonb) TO authenticated;

-- Deferred checks allow pending -> items -> payment -> paid inside the RPC.
-- Historical tickets are checked only when their status/area or payment changes.
CREATE FUNCTION loyalty_private.require_barbershop_payment() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE checked_id bigint;
BEGIN
  IF TG_TABLE_NAME='tickets' THEN
    IF TG_OP='UPDATE' AND OLD.status IS NOT DISTINCT FROM NEW.status AND OLD.business_line IS NOT DISTINCT FROM NEW.business_line THEN RETURN NEW; END IF;
    checked_id:=NEW.id;
  ELSE
    checked_id:=OLD.ticket_id;
  END IF;
  IF EXISTS(SELECT 1 FROM public.tickets t WHERE t.id=checked_id AND t.status='paid' AND t.business_line='barbershop'
    AND NOT EXISTS(SELECT 1 FROM public.payments p WHERE p.ticket_id=t.id AND p.payment_method IN ('cash','card','transfer','mixed'))) THEN
    RAISE EXCEPTION 'No se puede guardar una venta de barbería sin método de pago' USING ERRCODE='23514';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION loyalty_private.require_barbershop_payment() FROM PUBLIC,anon,authenticated;
CREATE CONSTRAINT TRIGGER barbershop_paid_ticket_has_payment AFTER INSERT OR UPDATE ON public.tickets
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION loyalty_private.require_barbershop_payment();
CREATE CONSTRAINT TRIGGER barbershop_paid_ticket_keeps_payment AFTER DELETE OR UPDATE ON public.payments
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION loyalty_private.require_barbershop_payment();
