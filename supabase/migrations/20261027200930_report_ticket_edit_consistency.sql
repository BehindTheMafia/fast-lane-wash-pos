-- Keep the reports editor aligned with protected sale types and recorded tender.
CREATE OR REPLACE FUNCTION public.edit_report_ticket(p_ticket_id bigint,p_changes jsonb,p_expected_updated_at timestamptz DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE t record; i record; s record; new_customer bigint; new_service bigint; new_total numeric; method text; payment_currency text; rate numeric; payment_amount numeric; standard_price numeric;
BEGIN
 PERFORM loyalty_private.require_staff(true);
 SELECT * INTO t FROM public.tickets WHERE id=p_ticket_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Ticket no encontrado'; END IF;
 IF p_expected_updated_at IS NOT NULL AND t.updated_at<>p_expected_updated_at THEN RAISE EXCEPTION 'El ticket cambió. Recarga Reportes e inténtalo nuevamente.'; END IF;
 IF t.ticket_number LIKE 'M-%' OR t.ticket_number LIKE 'MR-%' OR coalesce(t.is_loyalty_redemption,false) OR
    EXISTS(SELECT 1 FROM public.membership_washes WHERE ticket_id=p_ticket_id) OR
    EXISTS(SELECT 1 FROM public.loyalty_redemptions WHERE ticket_id=p_ticket_id) THEN
   RAISE EXCEPTION 'Los tickets de membresía y canje conservan su registro original.';
 END IF;
 new_customer:=coalesce((p_changes->>'customer_id')::bigint,t.customer_id);
 PERFORM 1 FROM public.customers WHERE id IN (t.customer_id,new_customer) ORDER BY id FOR UPDATE;
 new_total:=coalesce((p_changes->>'total')::numeric,t.total);
 new_service:=(p_changes->>'service_id')::bigint;
 SELECT * INTO i FROM public.ticket_items WHERE ticket_id=p_ticket_id AND item_type='service' ORDER BY id LIMIT 1;
 IF new_service IS NOT NULL AND new_service=i.service_id THEN new_service:=NULL; END IF;
 IF new_total<0 THEN RAISE EXCEPTION 'Total inválido'; END IF;
 IF (new_customer IS DISTINCT FROM t.customer_id OR new_service IS NOT NULL OR new_total<>t.total) AND
   (EXISTS(SELECT 1 FROM public.membership_washes WHERE ticket_id=p_ticket_id) OR
    EXISTS(SELECT 1 FROM public.loyalty_redemptions WHERE ticket_id=p_ticket_id)) THEN
   RAISE EXCEPTION 'Este ticket tiene una membresía o un canje. Conserva su registro original.';
 END IF;
 IF (new_service IS NOT NULL OR new_total<>t.total) AND (i.id IS NULL OR (SELECT count(*) FROM public.ticket_items WHERE ticket_id=p_ticket_id)<>1) THEN
   RAISE EXCEPTION 'El ticket contiene varios conceptos; no se puede asignar el total a un solo servicio.';
 END IF;
 SELECT pay.payment_method,pay.currency,pay.exchange_rate INTO method,payment_currency,rate FROM public.payments pay WHERE ticket_id=p_ticket_id ORDER BY id LIMIT 1;
 method:=coalesce(p_changes->>'payment_method',method,'cash'); payment_currency:=coalesce(p_changes->>'currency',payment_currency,'NIO'); rate:=coalesce(rate,36.5);
 IF NOT EXISTS(SELECT 1 FROM public.payments WHERE ticket_id=p_ticket_id) AND
   (new_total<>t.total OR p_changes ? 'payment_method' OR p_changes ? 'currency') THEN RAISE EXCEPTION 'Falta el pago original del ticket'; END IF;
 IF EXISTS(SELECT 1 FROM public.ticket_mixed_payments WHERE ticket_id=p_ticket_id) OR
    EXISTS(SELECT 1 FROM public.payments WHERE ticket_id=p_ticket_id AND payment_method='mixed') OR
    (SELECT count(*) FROM public.payments WHERE ticket_id=p_ticket_id)>1 THEN
   IF new_total<>t.total OR p_changes ? 'payment_method' OR p_changes ? 'currency' THEN RAISE EXCEPTION 'Conserva el desglose del pago mixto; solo puedes editar los datos del cliente o vehículo.'; END IF;
 ELSE
   IF method NOT IN ('cash','card','transfer') OR payment_currency NOT IN ('NIO','USD') OR rate<=0 THEN RAISE EXCEPTION 'Pago inválido'; END IF;
   payment_amount:=CASE WHEN payment_currency='USD' THEN round(new_total/rate,2) ELSE new_total END;
   IF new_total<>t.total OR p_changes ? 'currency' THEN
     UPDATE public.payments SET amount=payment_amount, currency=payment_currency, payment_method=method,
       amount_received=payment_amount,change_amount=0 WHERE ticket_id=p_ticket_id;
   ELSIF p_changes ? 'payment_method' THEN
     UPDATE public.payments SET payment_method=method WHERE ticket_id=p_ticket_id;
   END IF;
 END IF;
 IF new_service IS NOT NULL THEN
   SELECT * INTO s FROM public.services WHERE id=new_service AND is_active AND business_line=t.business_line;
   IF NOT FOUND OR coalesce(s.is_extra,false) THEN RAISE EXCEPTION 'Servicio inválido'; END IF;
   IF t.business_line='car_wash' THEN
     SELECT sp.price INTO standard_price FROM public.service_prices sp
       WHERE sp.service_id=new_service AND sp.vehicle_type_id=coalesce((p_changes->>'vehicle_type_id')::int,t.vehicle_type_id)
       ORDER BY sp.variant_sort,sp.id LIMIT 1;
     IF standard_price IS NULL THEN RAISE EXCEPTION 'El servicio no tiene tarifa para este tipo de vehículo'; END IF;
   END IF;
   IF t.business_line='car_wash' THEN PERFORM loyalty_private.lock_inventory(p_ticket_id,new_service); PERFORM public.reverse_service_inventory(p_ticket_id); END IF;
   UPDATE public.ticket_items SET service_id=new_service,service_name_snapshot=s.name,price=new_total,
     price_snapshot=coalesce(standard_price,new_total),discount_reason=NULL WHERE id=i.id;
   IF t.business_line='car_wash' THEN PERFORM loyalty_private.consume_inventory(new_service::int,p_ticket_id); END IF;
 ELSIF new_total<>t.total THEN UPDATE public.ticket_items SET price=new_total WHERE id=i.id;
 END IF;
 UPDATE public.tickets SET customer_id=new_customer,total=new_total,
   vehicle_plate=coalesce(p_changes->>'vehicle_plate',vehicle_plate),
   vehicle_type_id=coalesce((p_changes->>'vehicle_type_id')::int,vehicle_type_id),updated_at=now() WHERE id=p_ticket_id;
 INSERT INTO loyalty_private.registrations SELECT p_ticket_id,p.id FROM public.loyalty_programs p ON CONFLICT DO NOTHING;
 RETURN jsonb_build_object('success',true);
END $$;
