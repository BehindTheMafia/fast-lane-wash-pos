-- Reject incomplete mixed-payment parts before allocating funds between business lines.
CREATE OR REPLACE FUNCTION public.complete_car_wash_sale(p_request_id uuid,p_payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE cached record; customer bigint; membership bigint; reward int; general boolean; item jsonb; pay jsonb; part jsonb;
 line text; tid bigint; home_id bigint; cross_id bigint; result jsonb; home_receipt jsonb; awards jsonb:='[]'; r jsonb;
 home_total numeric:=0; cross_total numeric:=0; ticket_total numeric; price numeric; original numeric; discount numeric;
 rate numeric; curr text; method text; paid_amount numeric; home_amount numeric; cross_amount numeric; allocated numeric;
 home_remaining numeric; change_due numeric; home_change numeric:=0; cross_change numeric:=0; sid bigint; mem record; pending record;
BEGIN
 PERFORM loyalty_private.require_staff();
 INSERT INTO loyalty_private.sale_requests(request_id,user_id,payload) VALUES(p_request_id,auth.uid(),p_payload) ON CONFLICT DO NOTHING;
 SELECT * INTO cached FROM loyalty_private.sale_requests WHERE request_id=p_request_id FOR UPDATE;
 IF cached.user_id<>auth.uid() OR cached.payload<>p_payload THEN RAISE EXCEPTION 'La solicitud ya existe con otros datos. Reintenta con los datos originales.' USING DETAIL = 'IDEMPOTENCY_CONFLICT'; END IF;
 IF cached.response IS NOT NULL THEN RETURN cached.response; END IF;
 customer:=(p_payload->>'customer_id')::bigint;
 SELECT is_general INTO general FROM public.customers WHERE id=customer FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Cliente inválido'; END IF;
 membership:=(p_payload->>'membership_id')::bigint;
 reward:=(p_payload->>'reward_id')::int;
 pay:=p_payload->'payment';curr:=pay->>'currency';method:=pay->>'method';rate:=(p_payload->>'exchange_rate')::numeric;
 IF curr IS NULL OR curr NOT IN ('NIO','USD') OR method IS NULL OR method NOT IN ('cash','card','transfer','mixed') OR rate IS NULL OR rate<=0 THEN RAISE EXCEPTION 'Pago inválido'; END IF;
 IF jsonb_typeof(p_payload->'items') IS DISTINCT FROM 'array' OR jsonb_array_length(p_payload->'items')=0 THEN RAISE EXCEPTION 'Ticket vacío'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_payload->'items') LOOP
   original:=(item->>'price')::numeric;discount:=(item->>'discount_percent')::numeric;
   IF original IS NULL OR original<0 OR discount IS NULL OR discount<0 OR discount>100 THEN RAISE EXCEPTION 'Precio inválido'; END IF;
   line:=coalesce(item->>'business_line','car_wash');sid:=(item->>'service_id')::bigint;
   IF line NOT IN ('car_wash','barbershop') THEN RAISE EXCEPTION 'Área inválida'; END IF;
   IF sid IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.services WHERE id=sid AND business_line::text=line AND is_active) THEN RAISE EXCEPTION 'Servicio inválido'; END IF;
   price:=round(original*(1-discount/100),2);
   IF line='car_wash' THEN home_total:=home_total+price; ELSE cross_total:=cross_total+price; END IF;
   IF coalesce((item->>'is_loyalty_redemption')::boolean,false) THEN
     r:=public.validate_loyalty_redemption(reward,customer,item->>'service_name');
     IF NOT coalesce((r->>'valid')::boolean,false) OR discount<>(r->>'discount_percent')::numeric THEN RAISE EXCEPTION 'Premio inválido o descuento incorrecto'; END IF;
   END IF;
 END LOOP;
 paid_amount:=(pay->>'amount')::numeric;
 IF paid_amount IS NULL OR abs(paid_amount-round((home_total+cross_total)/CASE WHEN curr='USD' THEN rate ELSE 1 END,2))>0.01 THEN RAISE EXCEPTION 'El pago no coincide con el total'; END IF;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_payload->'items') i WHERE coalesce(i->>'business_line','car_wash')='car_wash') THEN RAISE EXCEPTION 'Agrega un servicio de autolavado'; END IF;
 home_amount:=round(home_total/CASE WHEN curr='USD' THEN rate ELSE 1 END,2);cross_amount:=paid_amount-home_amount;
 change_due:=coalesce((pay->>'change')::numeric,0);
 IF change_due<0 THEN RAISE EXCEPTION 'Cambio inválido'; END IF;
 -- Consume an old benefit before adding this sale's credit; no race on the balance.
 IF coalesce((p_payload->>'use_legacy_reward')::boolean,false) AND NOT public.use_loyalty_free_wash(customer) THEN RAISE EXCEPTION 'No hay pasteado disponible'; END IF;
 FOREACH line IN ARRAY ARRAY['car_wash','barbershop'] LOOP
   IF line='barbershop' AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_payload->'items') i WHERE i->>'business_line'='barbershop') THEN CONTINUE; END IF;
   ticket_total:=CASE WHEN line='car_wash' THEN home_total ELSE cross_total END;
   INSERT INTO public.tickets(ticket_number,user_id,customer_id,vehicle_type_id,vehicle_plate,total,status,business_line,
     is_loyalty_redemption,loyalty_reward_id,loyalty_original_amount)
   VALUES(CASE WHEN line='car_wash' THEN 'T-' ELSE 'B-' END||upper(replace(p_request_id::text,'-','')),
     auth.uid(),customer,CASE WHEN line='car_wash' THEN (p_payload->>'vehicle_type_id')::int END,
     p_payload->>'vehicle_plate',ticket_total,'pending',line::public.business_line,
     line='car_wash' AND reward IS NOT NULL,CASE WHEN line='car_wash' THEN reward END,
     CASE WHEN line='car_wash' THEN (p_payload->>'loyalty_original_amount')::numeric ELSE 0 END) RETURNING id INTO tid;
   IF line='car_wash' THEN home_id:=tid; ELSE cross_id:=tid; END IF;
   FOR item IN SELECT value FROM jsonb_array_elements(p_payload->'items') WHERE coalesce(value->>'business_line','car_wash')=line LOOP
     INSERT INTO public.ticket_items(ticket_id,item_type,service_id,quantity,price,price_snapshot,service_name_snapshot,discount_reason)
     VALUES(tid,'service',(item->>'service_id')::bigint,1,round((item->>'price')::numeric*(1-(item->>'discount_percent')::numeric/100),2),
       (item->>'price')::numeric,item->>'service_name',CASE WHEN coalesce((item->>'is_loyalty_redemption')::boolean,false) THEN 'loyalty_redemption' END);
   END LOOP;
   IF line='car_wash' THEN
     FOR sid IN SELECT DISTINCT ti.service_id FROM public.ticket_items ti JOIN public.services s ON s.id=ti.service_id
       WHERE ti.ticket_id=tid AND NOT coalesce(s.is_extra,false) ORDER BY ti.service_id LOOP
       PERFORM loyalty_private.consume_inventory(sid::int,tid);
     END LOOP;
   END IF;
 END LOOP;
 -- Split mixed parts between both tickets without duplicating the amount or change.
 IF method='mixed' THEN
   IF jsonb_typeof(pay->'mixedPayments') IS DISTINCT FROM 'array' OR jsonb_array_length(pay->'mixedPayments')=0 THEN RAISE EXCEPTION 'Falta el desglose mixto'; END IF;
   IF abs((SELECT coalesce(sum((value->>'amount')::numeric),0) FROM jsonb_array_elements(pay->'mixedPayments'))-paid_amount)>0.01 THEN RAISE EXCEPTION 'Desglose mixto inválido'; END IF;
   home_remaining:=home_amount;
   FOR part IN SELECT value FROM jsonb_array_elements(pay->'mixedPayments') LOOP
     -- SQL NULL comparisons do not evaluate to true. Check missing values
     -- explicitly before least() can turn a NULL amount into an allocation.
     IF part->>'method' IS NULL OR part->>'method' NOT IN ('cash','card','transfer') OR
        (part->>'amount')::numeric IS NULL OR (part->>'amount')::numeric<0 OR
        (part->>'amount')::numeric::text IN ('NaN','Infinity','-Infinity') OR
        coalesce((part->>'change')::numeric,0)<0 OR
        coalesce((part->>'change')::numeric,0)::text IN ('NaN','Infinity','-Infinity') THEN
       RAISE EXCEPTION 'Parte del pago inválida';
     END IF;
     allocated:=least(home_remaining,(part->>'amount')::numeric);home_remaining:=home_remaining-allocated;
     FOREACH tid IN ARRAY ARRAY[home_id,cross_id] LOOP
       IF tid IS NULL THEN CONTINUE; END IF;
       price:=CASE WHEN tid=home_id THEN allocated ELSE (part->>'amount')::numeric-allocated END;
       IF price<=0 THEN CONTINUE; END IF;
       discount:=CASE WHEN (tid=cross_id OR allocated=(part->>'amount')::numeric) THEN coalesce((part->>'change')::numeric,0) ELSE 0 END;
       IF tid=home_id THEN home_change:=home_change+discount;ELSE cross_change:=cross_change+discount;END IF;
       INSERT INTO public.ticket_mixed_payments(ticket_id,method,currency,amount,exchange_rate,amount_nio,applied_nio,change_nio)
       VALUES(tid,part->>'method',curr,price,rate,round(price*CASE WHEN curr='USD' THEN rate ELSE 1 END,2),
         round(price*CASE WHEN curr='USD' THEN rate ELSE 1 END,2),round(discount*CASE WHEN curr='USD' THEN rate ELSE 1 END,2));
     END LOOP;
   END LOOP;
 ELSE
   home_change:=change_due;
 END IF;
 FOREACH tid IN ARRAY ARRAY[home_id,cross_id] LOOP
   IF tid IS NULL THEN CONTINUE; END IF;
   price:=CASE WHEN tid=home_id THEN home_amount ELSE cross_amount END;
   discount:=CASE WHEN tid=home_id THEN home_change ELSE cross_change END;
   INSERT INTO public.payments(ticket_id,amount,currency,payment_method,amount_received,change_amount,exchange_rate)
   VALUES(tid,price,curr,method,price+discount,discount,rate);
   UPDATE public.tickets SET status='paid' WHERE id=tid;
 END LOOP;
 IF membership IS NOT NULL THEN
   SELECT * INTO mem FROM public.customer_memberships WHERE id=membership AND customer_id=customer FOR UPDATE;
   IF NOT FOUND OR NOT mem.active OR mem.expires_at<=now() OR mem.washes_used>=mem.total_washes_allowed OR
     NOT EXISTS(SELECT 1 FROM public.ticket_items WHERE ticket_id=home_id AND service_id=mem.service_id) THEN RAISE EXCEPTION 'Membresía no disponible'; END IF;
   INSERT INTO public.membership_washes(membership_id,ticket_id,service_id,is_bonus) VALUES(membership,home_id,mem.service_id,false);
   UPDATE public.customer_memberships SET washes_used=washes_used+1 WHERE id=membership;
   IF mem.washes_used+1>=mem.total_washes_allowed THEN
     SELECT cm.id,coalesce(mp.duration_days,28) AS days INTO pending FROM public.customer_memberships cm
       LEFT JOIN public.membership_plans mp ON mp.id=cm.plan_id
       WHERE cm.customer_id=customer AND NOT cm.active AND coalesce(cm.washes_used,0)=0
       ORDER BY cm.created_at,cm.id LIMIT 1 FOR UPDATE OF cm;
     IF FOUND THEN
       UPDATE public.customer_memberships SET active=false WHERE customer_id=customer AND active
         AND (washes_used>=total_washes_allowed OR expires_at<now());
       UPDATE public.customer_memberships SET active=true,expires_at=now()+make_interval(days=>pending.days) WHERE id=pending.id;
     END IF;
   END IF;
 END IF;
 IF reward IS NOT NULL THEN PERFORM public.redeem_loyalty_reward(reward,home_id,auth.uid(),'Canjeado en POS'); END IF;
 IF NOT general THEN
   SELECT service_id INTO sid FROM public.ticket_items WHERE ticket_id=home_id AND service_id IS NOT NULL ORDER BY id LIMIT 1;
   IF sid IS NOT NULL THEN PERFORM public.increment_loyalty_visit(customer,home_id,sid); END IF;
   FOR sid IN SELECT DISTINCT service_id FROM loyalty_private.washes(customer) WHERE ticket_id=home_id AND service_id IS NOT NULL LOOP
     r:=public.record_loyalty_v3_wash(customer,home_id,sid::int,auth.uid());awards:=awards||coalesce(r->'rewards_earned','[]');
   END LOOP;
 END IF;
 SELECT to_jsonb(t) INTO home_receipt FROM public.tickets t WHERE id=home_id;
 result:=jsonb_build_object('success',true,'ticket',home_receipt,'rewards_earned',awards);
 UPDATE loyalty_private.sale_requests SET response=result WHERE request_id=p_request_id;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.complete_car_wash_sale(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.complete_car_wash_sale(uuid,jsonb) TO authenticated;

