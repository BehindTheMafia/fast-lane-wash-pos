-- Reports is authoritative. No historical rewards are issued by this migration.
BEGIN;
CREATE INDEX IF NOT EXISTS tickets_report_customer_idx ON public.tickets(customer_id,id) WHERE status='paid' AND business_line='car_wash';
CREATE INDEX IF NOT EXISTS ticket_items_report_ticket_idx ON public.ticket_items(ticket_id);
CREATE INDEX IF NOT EXISTS loyalty_rewards_report_customer_idx ON public.loyalty_rewards(customer_id,program_id);
CREATE SCHEMA IF NOT EXISTS loyalty_private;
REVOKE ALL ON SCHEMA loyalty_private FROM PUBLIC, anon, authenticated;

CREATE FUNCTION loyalty_private.require_staff(p_admin boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.active
      AND p.role::text = ANY(CASE WHEN p_admin THEN ARRAY['admin','owner']
        ELSE ARRAY['admin','owner','cajero','operator','manager'] END)
  ) THEN RAISE EXCEPTION 'Permisos insuficientes' USING ERRCODE = '42501'; END IF;
END $$;

-- The portal's flw_normalize already exists in production. Keep this helper
-- self-contained so installing the POS migration does not require the portal.
CREATE FUNCTION loyalty_private.normalized(p_name text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
 SELECT lower(translate(coalesce(p_name,''), 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun'))
$$;
CREATE FUNCTION loyalty_private.washes(p_customer bigint)
RETURNS TABLE(ticket_id bigint, program_id integer, service_id bigint, created_at timestamptz)
LANGUAGE sql STABLE SET search_path = '' AS $$
 SELECT DISTINCT ON(t.id, lp.id) t.id, lp.id, ti.service_id, t.created_at
 FROM public.tickets t JOIN public.ticket_items ti ON ti.ticket_id=t.id
 LEFT JOIN public.services s ON s.id=ti.service_id
 CROSS JOIN LATERAL (SELECT loyalty_private.normalized(coalesce(nullif(s.name,''),ti.service_name_snapshot)) AS name) n
 JOIN public.loyalty_programs lp ON lp.active AND lp.slug IN ('premium','nitido')
   AND n.name ~ ('\m'||lp.slug||'\M')
 WHERE t.customer_id=p_customer AND t.status='paid' AND t.business_line='car_wash'
   AND (ti.item_type IS NULL OR ti.item_type='service') AND NOT coalesce(s.is_extra,false)
   AND (s.id IS NOT NULL OR n.name ~ '\mlavado\M' OR n.name IN ('premium','nitido','breve'))
 ORDER BY t.id,lp.id,ti.id
$$;

CREATE FUNCTION loyalty_private.eligible_rewards(p_customer bigint)
RETURNS TABLE(id integer) LANGUAGE sql STABLE SET search_path = '' AS $$
 WITH counts AS (
   SELECT p.id, p.cycle_size, count(w.ticket_id)::int AS total
   FROM public.loyalty_programs p LEFT JOIN loyalty_private.washes(p_customer) w ON w.program_id=p.id
   WHERE p.active GROUP BY p.id
 ), matched AS (
   SELECT r.*, (m->>'at')::int AS milestone,
     coalesce(r.option_group,'reward:'||r.id) AS benefit_group
   FROM public.loyalty_rewards r JOIN public.loyalty_programs p ON p.id=r.program_id AND p.active
   JOIN LATERAL jsonb_array_elements(p.rewards) m ON m->>'reward_slug'=r.reward_slug OR EXISTS (
     SELECT 1 FROM jsonb_array_elements(coalesce(m->'options','[]')) o WHERE o->>'reward_slug'=r.reward_slug)
   WHERE r.customer_id=p_customer
 ), groups AS (
   SELECT program_id,milestone,benefit_group,min(earned_at) earned_at,min(id) first_id
   FROM matched GROUP BY program_id,milestone,benefit_group
 ), ranked AS (
   SELECT *,row_number() OVER(PARTITION BY program_id,milestone ORDER BY earned_at,first_id) AS ordinal FROM groups
 )
 SELECT r.id FROM matched r JOIN ranked g USING(program_id,milestone,benefit_group)
 JOIN counts c ON c.id=r.program_id
 WHERE r.status='available' AND (r.expires_at IS NULL OR r.expires_at>now())
   AND g.ordinal <= c.total/c.cycle_size + CASE WHEN c.total%c.cycle_size>=r.milestone THEN 1 ELSE 0 END
   AND EXISTS(SELECT 1 FROM loyalty_private.washes(p_customer) w WHERE w.ticket_id=r.ticket_id AND w.program_id=r.program_id)
$$;

-- Freeze legacy contributions before deleting/moving any ticket. The original
-- visit_number sequence stays in the audit log, matching the public portal.
CREATE TABLE loyalty_private.legacy_credits(
 visit_id uuid PRIMARY KEY REFERENCES public.loyalty_visits(id) ON DELETE CASCADE,
 customer_id bigint NOT NULL, ticket_id bigint, credits int NOT NULL
);
INSERT INTO loyalty_private.legacy_credits
 SELECT id,customer_id,ticket_id,greatest(1,visit_number-coalesce(lag(visit_number) OVER(
   PARTITION BY customer_id ORDER BY visit_number,created_at,id),0)) FROM public.loyalty_visits;

CREATE FUNCTION loyalty_private.reconcile(p_customer bigint) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF p_customer IS NULL THEN RETURN; END IF;
 PERFORM 1 FROM public.customers WHERE id=p_customer FOR UPDATE;
 IF NOT FOUND THEN RETURN; END IF;
 INSERT INTO public.loyalty_progress(customer_id,program_id,total_washes,washes_in_cycle,cycle_number,updated_at)
 SELECT p_customer,p.id,count(w.ticket_id)::int,count(w.ticket_id)::int%p.cycle_size,
        count(w.ticket_id)::int/p.cycle_size,now()
 FROM public.loyalty_programs p LEFT JOIN loyalty_private.washes(p_customer) w ON w.program_id=p.id
 GROUP BY p.id
 ON CONFLICT(customer_id,program_id) DO UPDATE SET total_washes=excluded.total_washes,
 washes_in_cycle=excluded.washes_in_cycle,cycle_number=excluded.cycle_number,updated_at=excluded.updated_at;
 -- The last visit includes Breve too; legacy service credits are a separate ledger.
 UPDATE public.customers SET loyalty_last_visit=(SELECT max(created_at) FROM public.tickets
   WHERE customer_id=p_customer AND status='paid' AND business_line='car_wash') WHERE id=p_customer;
 UPDATE public.customers SET loyalty_visits=coalesce((SELECT sum(lc.credits)::int
   FROM loyalty_private.legacy_credits lc JOIN public.tickets t ON t.id=lc.ticket_id
   WHERE lc.customer_id=p_customer AND t.customer_id=p_customer AND t.status='paid' AND t.business_line='car_wash'),0),
   loyalty_free_washes_earned=coalesce((SELECT sum(lc.credits)::int/8
   FROM loyalty_private.legacy_credits lc JOIN public.tickets t ON t.id=lc.ticket_id
   WHERE lc.customer_id=p_customer AND t.customer_id=p_customer AND t.status='paid' AND t.business_line='car_wash'),0)
 WHERE id=p_customer;
 -- Keep consumed rewards and audit records. Invalid available rewards cannot be used.
 UPDATE public.loyalty_rewards SET status='expired'
 WHERE customer_id=p_customer AND status='available'
 AND id NOT IN (SELECT id FROM loyalty_private.eligible_rewards(p_customer));
END $$;

-- Serialize ticket/item mutations on their customer before reading aggregates.
CREATE FUNCTION loyalty_private.ticket_sync() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE old_customer bigint; new_customer bigint; c bigint;
BEGIN
 IF TG_WHEN='BEFORE' AND current_setting('role',true) IN ('authenticated','anon') THEN
   IF TG_TABLE_NAME='tickets' AND TG_OP='UPDATE' THEN
     PERFORM loyalty_private.require_staff(NOT (OLD.status='pending' AND OLD.user_id=auth.uid()));
   ELSIF TG_TABLE_NAME='ticket_items' AND TG_OP='INSERT' THEN
     PERFORM loyalty_private.require_staff(EXISTS(SELECT 1 FROM public.tickets WHERE id=NEW.ticket_id AND status<>'pending'));
   ELSE
     PERFORM loyalty_private.require_staff(TG_OP<>'INSERT');
   END IF;
 END IF;
 IF TG_TABLE_NAME='tickets' THEN
   IF TG_OP<>'INSERT' THEN old_customer:=OLD.customer_id; END IF;
   IF TG_OP<>'DELETE' THEN new_customer:=NEW.customer_id; END IF;
 ELSE
   IF TG_OP<>'INSERT' THEN SELECT customer_id INTO old_customer FROM public.tickets WHERE id=OLD.ticket_id; END IF;
   IF TG_OP<>'DELETE' THEN SELECT customer_id INTO new_customer FROM public.tickets WHERE id=NEW.ticket_id; END IF;
 END IF;
 FOR c IN SELECT DISTINCT x FROM unnest(ARRAY[old_customer,new_customer]) x WHERE x IS NOT NULL ORDER BY x LOOP
   IF TG_WHEN='BEFORE' THEN PERFORM 1 FROM public.customers WHERE id=c FOR UPDATE;
   ELSE PERFORM loyalty_private.reconcile(c); END IF;
 END LOOP;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
CREATE TRIGGER report_ticket_lock BEFORE INSERT OR UPDATE OR DELETE ON public.tickets FOR EACH ROW EXECUTE FUNCTION loyalty_private.ticket_sync();
CREATE TRIGGER report_ticket_sync AFTER INSERT OR UPDATE OR DELETE ON public.tickets FOR EACH ROW EXECUTE FUNCTION loyalty_private.ticket_sync();
CREATE TRIGGER report_item_lock BEFORE INSERT OR UPDATE OR DELETE ON public.ticket_items FOR EACH ROW EXECUTE FUNCTION loyalty_private.ticket_sync();
CREATE TRIGGER report_item_sync AFTER INSERT OR UPDATE OR DELETE ON public.ticket_items FOR EACH ROW EXECUTE FUNCTION loyalty_private.ticket_sync();

-- Idempotency ledger is separate from editable history; never delete consumed audit.
CREATE TABLE loyalty_private.registrations(
 ticket_id bigint NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
 program_id int NOT NULL REFERENCES public.loyalty_programs(id), PRIMARY KEY(ticket_id,program_id)
);
INSERT INTO loyalty_private.registrations SELECT t.id,p.id FROM public.tickets t
 CROSS JOIN public.loyalty_programs p WHERE t.business_line='car_wash' ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.record_loyalty_v3_wash(p_customer_id bigint,p_ticket_id bigint,p_service_id int,p_user_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE p record; n int; m jsonb; o jsonb; rid int; grp text; earned jsonb:='[]';
BEGIN
 PERFORM loyalty_private.require_staff();
 PERFORM 1 FROM public.customers WHERE id=p_customer_id AND NOT is_general FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('recorded',false,'reason','general_customer'); END IF;
 SELECT lp.* INTO p FROM loyalty_private.washes(p_customer_id) w JOIN public.loyalty_programs lp ON lp.id=w.program_id
 WHERE w.ticket_id=p_ticket_id AND EXISTS (SELECT 1 FROM public.ticket_items ti JOIN public.services s ON s.id=ti.service_id
   WHERE ti.ticket_id=p_ticket_id AND ti.service_id=p_service_id AND NOT coalesce(s.is_extra,false)
   AND loyalty_private.normalized(s.name) ~ ('\m'||lp.slug||'\M')) LIMIT 1;
 IF NOT FOUND THEN RETURN jsonb_build_object('recorded',false,'reason','service_not_in_program'); END IF;
 INSERT INTO loyalty_private.registrations VALUES(p_ticket_id,p.id) ON CONFLICT DO NOTHING;
 IF NOT FOUND THEN RETURN jsonb_build_object('recorded',false,'reason','already_recorded'); END IF;
 PERFORM loyalty_private.reconcile(p_customer_id);
 SELECT total_washes INTO n FROM public.loyalty_progress WHERE customer_id=p_customer_id AND program_id=p.id;
 FOR m IN SELECT value FROM jsonb_array_elements(p.rewards) LOOP
   IF ((n-1)%p.cycle_size)+1 <> (m->>'at')::int THEN CONTINUE; END IF;
   grp:=p.slug||'_'||(m->>'at')||'w_c'||((n-1)/p.cycle_size)::text;
   -- Reserve benefit ordinals even for old rewards without a cycle group.
   IF (SELECT count(DISTINCT coalesce(r.option_group,'reward:'||r.id)) FROM public.loyalty_rewards r
     WHERE r.customer_id=p_customer_id AND r.program_id=p.id AND
       (r.reward_slug=m->>'reward_slug' OR EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(m->'options','[]')) opt WHERE opt->>'reward_slug'=r.reward_slug)))
     >= (n/p.cycle_size + CASE WHEN n%p.cycle_size>=(m->>'at')::int THEN 1 ELSE 0 END) THEN CONTINUE; END IF;
   -- Expired and redeemed benefits reserve the same cycle, too.
   IF EXISTS(SELECT 1 FROM public.loyalty_rewards WHERE customer_id=p_customer_id AND program_id=p.id AND option_group=grp) THEN CONTINUE; END IF;
   FOR o IN SELECT value FROM jsonb_array_elements(coalesce(m->'options',jsonb_build_array(m))) LOOP
     INSERT INTO public.loyalty_rewards(customer_id,program_id,reward_name,reward_slug,ticket_id,option_group,option_slug)
     VALUES(p_customer_id,p.id,o->>'reward',o->>'reward_slug',p_ticket_id,
       CASE WHEN m->>'type'='choice' THEN grp END,CASE WHEN m->>'type'='choice' THEN o->>'reward_slug' END) RETURNING id INTO rid;
     earned:=earned||jsonb_build_array(jsonb_build_object('reward_id',rid,'reward_name',o->>'reward','reward_slug',o->>'reward_slug'));
   END LOOP;
 END LOOP;
 INSERT INTO public.loyalty_wash_log(customer_id,program_id,ticket_id,service_id,wash_number,user_id)
 VALUES(p_customer_id,p.id,p_ticket_id,p_service_id,((n-1)%p.cycle_size)+1,auth.uid());
 RETURN jsonb_build_object('recorded',true,'program',p.name,'program_slug',p.slug,'total_washes',n,
   'washes_in_cycle',n%p.cycle_size,'cycle_number',n/p.cycle_size,'cycle_size',p.cycle_size,'rewards_earned',earned);
END $$;

-- Lock inventory before checking availability; otherwise concurrent sales can
-- both pass a pre-check and consume the last unit. Lock in product-id order.
CREATE FUNCTION loyalty_private.lock_inventory(p_ticket bigint,p_extra_service bigint DEFAULT NULL) RETURNS void
LANGUAGE sql SET search_path = '' AS $$
 SELECT p.id FROM public.products p WHERE p.id IN (
   SELECT sp.product_id FROM public.service_products sp WHERE sp.service_id=p_extra_service
     OR sp.service_id IN (SELECT ti.service_id FROM public.ticket_items ti WHERE ti.ticket_id=p_ticket)
 ) ORDER BY p.id FOR UPDATE
$$;
CREATE FUNCTION loyalty_private.consume_inventory(p_service int,p_ticket bigint) RETURNS void
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
 PERFORM loyalty_private.lock_inventory(p_ticket,p_service);
 IF NOT coalesce((public.check_service_inventory(p_service)->>'ok')::boolean,false) THEN
   RAISE EXCEPTION 'Stock insuficiente para completar el servicio';
 END IF;
 PERFORM public.record_service_inventory(p_service,p_ticket);
END $$;

-- All deletion entry points (Reports, Dashboard and Settings) share rollback.
CREATE FUNCTION loyalty_private.ticket_delete_dependencies() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE m record;
BEGIN
 IF OLD.business_line='car_wash' AND OLD.status='paid' THEN
   PERFORM loyalty_private.lock_inventory(OLD.id); PERFORM public.reverse_service_inventory(OLD.id); END IF;
 FOR m IN SELECT membership_id,count(*) n FROM public.membership_washes WHERE ticket_id=OLD.id GROUP BY membership_id ORDER BY membership_id LOOP
   UPDATE public.customer_memberships SET washes_used=greatest(0,washes_used-m.n::int) WHERE id=m.membership_id;
 END LOOP;
 DELETE FROM public.membership_washes WHERE ticket_id=OLD.id;
 RETURN OLD;
END $$;
CREATE TRIGGER z_report_ticket_dependencies BEFORE DELETE ON public.tickets
 FOR EACH ROW EXECUTE FUNCTION loyalty_private.ticket_delete_dependencies();
CREATE FUNCTION public.delete_report_ticket(p_ticket_id bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 PERFORM loyalty_private.require_staff(true);
 DELETE FROM public.tickets WHERE id=p_ticket_id;
 RETURN jsonb_build_object('success',true,'already_deleted',NOT FOUND);
END $$;

CREATE FUNCTION public.edit_report_ticket(p_ticket_id bigint,p_changes jsonb,p_expected_updated_at timestamptz DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE t record; i record; s record; new_customer bigint; new_service bigint; new_total numeric; method text; payment_currency text; rate numeric; payment_amount numeric;
BEGIN
 PERFORM loyalty_private.require_staff(true);
 SELECT * INTO t FROM public.tickets WHERE id=p_ticket_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Ticket no encontrado'; END IF;
 IF p_expected_updated_at IS NOT NULL AND t.updated_at<>p_expected_updated_at THEN RAISE EXCEPTION 'El ticket cambió. Recarga Reportes e inténtalo nuevamente.'; END IF;
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
 IF (new_service IS NOT NULL OR new_total<>t.total) AND (SELECT count(*) FROM public.ticket_items WHERE ticket_id=p_ticket_id)<>1 THEN
   RAISE EXCEPTION 'El ticket contiene varios conceptos; no se puede asignar el total a un solo servicio.';
 END IF;
 SELECT pay.payment_method,pay.currency,pay.exchange_rate INTO method,payment_currency,rate FROM public.payments pay WHERE ticket_id=p_ticket_id ORDER BY id LIMIT 1;
 method:=coalesce(p_changes->>'payment_method',method,'cash'); payment_currency:=coalesce(p_changes->>'currency',payment_currency,'NIO'); rate:=coalesce(rate,36.5);
 IF NOT EXISTS(SELECT 1 FROM public.payments WHERE ticket_id=p_ticket_id) AND
   (new_total<>t.total OR p_changes ? 'payment_method' OR p_changes ? 'currency') THEN RAISE EXCEPTION 'Falta el pago original del ticket'; END IF;
 IF EXISTS(SELECT 1 FROM public.ticket_mixed_payments WHERE ticket_id=p_ticket_id) OR (SELECT count(*) FROM public.payments WHERE ticket_id=p_ticket_id)>1 THEN
   IF new_total<>t.total OR p_changes ? 'payment_method' OR p_changes ? 'currency' THEN RAISE EXCEPTION 'Conserva el desglose del pago mixto; solo puedes editar los datos del cliente o vehículo.'; END IF;
 ELSE
   IF method NOT IN ('cash','card','transfer') OR payment_currency NOT IN ('NIO','USD') OR rate<=0 THEN RAISE EXCEPTION 'Pago inválido'; END IF;
   payment_amount:=CASE WHEN payment_currency='USD' THEN round(new_total/rate,2) ELSE new_total END;
   IF new_total<>t.total OR p_changes ? 'payment_method' OR p_changes ? 'currency' THEN
     UPDATE public.payments SET amount=payment_amount, currency=payment_currency, payment_method=method,
       amount_received=payment_amount,change_amount=0 WHERE ticket_id=p_ticket_id;
   END IF;
 END IF;
 IF new_service IS NOT NULL THEN
   SELECT * INTO s FROM public.services WHERE id=new_service AND is_active AND business_line=t.business_line;
   IF NOT FOUND OR coalesce(s.is_extra,false) THEN RAISE EXCEPTION 'Servicio inválido'; END IF;
   IF t.business_line='car_wash' THEN PERFORM loyalty_private.lock_inventory(p_ticket_id,new_service); PERFORM public.reverse_service_inventory(p_ticket_id); END IF;
   UPDATE public.ticket_items SET service_id=new_service,service_name_snapshot=s.name,price=new_total WHERE id=i.id;
   IF t.business_line='car_wash' THEN PERFORM loyalty_private.consume_inventory(new_service::int,p_ticket_id); END IF;
 ELSIF new_total<>t.total THEN UPDATE public.ticket_items SET price=new_total WHERE id=i.id;
 END IF;
 UPDATE public.tickets SET customer_id=new_customer,total=new_total,
   vehicle_plate=coalesce(p_changes->>'vehicle_plate',vehicle_plate),
   vehicle_type_id=coalesce((p_changes->>'vehicle_type_id')::int,vehicle_type_id),updated_at=now() WHERE id=p_ticket_id;
 INSERT INTO loyalty_private.registrations SELECT p_ticket_id,p.id FROM public.loyalty_programs p ON CONFLICT DO NOTHING;
 RETURN jsonb_build_object('success',true);
END $$;

-- Compatibility with old clients: reversal is now inseparable from deletion.
CREATE OR REPLACE FUNCTION public.reverse_loyalty_on_ticket_delete(p_ticket_id bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN PERFORM loyalty_private.require_staff(true); RETURN jsonb_build_object('reversed',false,'reason','handled_by_ticket_trigger'); END $$;

-- Remove the obsolete three-argument overload (otherwise PostgREST sees two matches).
DROP FUNCTION IF EXISTS public.increment_loyalty_visit(bigint,bigint,bigint);
CREATE OR REPLACE FUNCTION public.increment_loyalty_visit(p_customer_id bigint,p_ticket_id bigint,p_service_id bigint,p_services_count int DEFAULT 1)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE vid uuid; seq int; earned_before int; c record;
BEGIN
 PERFORM loyalty_private.require_staff();
 PERFORM loyalty_private.reconcile(p_customer_id);
 SELECT * INTO c FROM public.customers WHERE id=p_customer_id AND NOT is_general FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Cliente inválido'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.tickets t JOIN public.ticket_items ti ON ti.ticket_id=t.id
   WHERE t.id=p_ticket_id AND t.customer_id=p_customer_id AND t.status='paid' AND t.business_line='car_wash'
     AND ti.service_id=p_service_id AND ti.item_type='service') THEN RAISE EXCEPTION 'Ticket inválido'; END IF;
 earned_before:=c.loyalty_free_washes_earned;
 IF NOT EXISTS(SELECT 1 FROM loyalty_private.legacy_credits WHERE ticket_id=p_ticket_id) THEN
   SELECT coalesce(max(visit_number),0)+1 INTO seq FROM public.loyalty_visits WHERE customer_id=p_customer_id;
   INSERT INTO public.loyalty_visits(customer_id,ticket_id,service_id,visit_number,earned_free_wash)
   VALUES(p_customer_id,p_ticket_id,p_service_id,seq,(c.loyalty_visits+1)%8=0) RETURNING id INTO vid;
   INSERT INTO loyalty_private.legacy_credits VALUES(vid,p_customer_id,p_ticket_id,1);
 END IF;
 PERFORM loyalty_private.reconcile(p_customer_id);
 SELECT * INTO c FROM public.customers WHERE id=p_customer_id;
 RETURN jsonb_build_object('visit_number',c.loyalty_visits,'earned_free_wash',c.loyalty_free_washes_earned>earned_before,
   'free_washes_available',greatest(0,c.loyalty_free_washes_earned-c.loyalty_free_washes_used));
END $$;
CREATE OR REPLACE FUNCTION public.use_loyalty_free_wash(p_customer_id bigint) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 PERFORM loyalty_private.require_staff(); PERFORM loyalty_private.reconcile(p_customer_id);
 UPDATE public.customers SET loyalty_free_washes_used=loyalty_free_washes_used+1
 WHERE id=p_customer_id AND loyalty_free_washes_earned>loyalty_free_washes_used;
 RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION public.increment_loyalty_visit(bigint,bigint,bigint,int),public.use_loyalty_free_wash(bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.increment_loyalty_visit(bigint,bigint,bigint,int),public.use_loyalty_free_wash(bigint) TO authenticated;
REVOKE INSERT,UPDATE,DELETE ON public.loyalty_visits FROM authenticated,anon;

-- Match the configured option, including accent-normalized service names.
CREATE OR REPLACE FUNCTION public.validate_loyalty_redemption(p_reward_id int,p_customer_id bigint,p_service_name text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r record; opt jsonb;
BEGIN
 PERFORM loyalty_private.require_staff();
 IF NOT EXISTS(SELECT 1 FROM loyalty_private.eligible_rewards(p_customer_id) WHERE id=p_reward_id) THEN
   RETURN jsonb_build_object('valid',false,'error','reward_not_earned','error_msg','Los tickets actuales no respaldan este premio.');
 END IF;
 SELECT * INTO r FROM public.loyalty_rewards WHERE id=p_reward_id;
 SELECT o.value INTO opt FROM public.loyalty_programs lp
 CROSS JOIN LATERAL jsonb_array_elements(lp.rewards) m
 CROSS JOIN LATERAL jsonb_array_elements(coalesce(m->'options',jsonb_build_array(m))) o
 WHERE lp.id=r.program_id AND o.value->>'reward_slug'=r.reward_slug LIMIT 1;
 IF opt->>'service_name_like' IS NULL OR loyalty_private.normalized(p_service_name) NOT LIKE '%'||loyalty_private.normalized(opt->>'service_name_like')||'%' THEN
   RETURN jsonb_build_object('valid',false,'error','service_mismatch','error_msg','El servicio no corresponde al premio.');
 END IF;
 RETURN jsonb_build_object('valid',true,'reward_name',r.reward_name,'reward_slug',r.reward_slug,
   'service_name_like',opt->>'service_name_like','discount_percent',coalesce((opt->>'discount_percent')::int,100));
END $$;

CREATE OR REPLACE FUNCTION public.select_reward_option(p_reward_id int,p_option_slug text,p_customer_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r record;
BEGIN
 PERFORM loyalty_private.require_staff();
 PERFORM 1 FROM public.customers WHERE id=p_customer_id FOR UPDATE;
 SELECT * INTO r FROM public.loyalty_rewards WHERE id=p_reward_id AND customer_id=p_customer_id FOR UPDATE;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM loyalty_private.eligible_rewards(p_customer_id) WHERE id=p_reward_id)
 THEN RAISE EXCEPTION 'Premio no disponible según los tickets actuales'; END IF;
 IF r.option_group IS NULL OR r.option_slug IS DISTINCT FROM p_option_slug THEN RAISE EXCEPTION 'Opción inválida'; END IF;
 IF r.selected_option IS NOT NULL AND r.selected_option<>p_option_slug THEN RAISE EXCEPTION 'Opción ya elegida'; END IF;
 UPDATE public.loyalty_rewards SET selected_option=p_option_slug,selected_at=now() WHERE id=p_reward_id;
 UPDATE public.loyalty_rewards SET status='expired' WHERE customer_id=p_customer_id AND program_id=r.program_id
   AND option_group=r.option_group AND id<>p_reward_id AND status='available';
 RETURN jsonb_build_object('success',true,'selected_option',p_option_slug,'reward_name',r.reward_name);
END $$;

CREATE OR REPLACE FUNCTION public.redeem_loyalty_reward(p_reward_id int,p_ticket_id bigint DEFAULT NULL,
 p_user_id uuid DEFAULT NULL,p_notes text DEFAULT NULL,p_admin_override boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r record; cid bigint;
BEGIN
 PERFORM loyalty_private.require_staff(p_admin_override);
 SELECT customer_id INTO cid FROM public.loyalty_rewards WHERE id=p_reward_id;
 PERFORM 1 FROM public.customers WHERE id=cid FOR UPDATE;
 SELECT * INTO r FROM public.loyalty_rewards WHERE id=p_reward_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Premio no encontrado'; END IF;
 IF EXISTS(SELECT 1 FROM public.loyalty_redemptions WHERE reward_id=p_reward_id AND ticket_id=p_ticket_id) THEN
   RETURN jsonb_build_object('success',true,'already_redeemed',true); END IF;
 IF NOT EXISTS(SELECT 1 FROM loyalty_private.eligible_rewards(cid) WHERE id=p_reward_id) THEN RAISE EXCEPTION 'Premio no disponible según los tickets actuales'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.tickets t JOIN public.ticket_items ti ON ti.ticket_id=t.id
   LEFT JOIN public.services s ON s.id=ti.service_id
   WHERE t.id=p_ticket_id AND t.customer_id=cid AND t.status='paid' AND t.business_line='car_wash'
     AND t.loyalty_reward_id=p_reward_id AND ti.discount_reason='loyalty_redemption'
     AND (public.validate_loyalty_redemption(p_reward_id,cid,coalesce(s.name,ti.service_name_snapshot))->>'valid')::boolean
 ) THEN RAISE EXCEPTION 'El ticket no corresponde al canje de este premio'; END IF;
 UPDATE public.loyalty_rewards SET status='redeemed' WHERE id=p_reward_id;
 UPDATE public.loyalty_rewards SET status='expired' WHERE customer_id=cid AND program_id=r.program_id
   AND option_group=r.option_group AND id<>p_reward_id AND status='available';
 INSERT INTO public.loyalty_redemptions(reward_id,customer_id,ticket_id,user_id,notes,overridden_by_admin)
 VALUES(p_reward_id,cid,p_ticket_id,auth.uid(),p_notes,p_admin_override);
 RETURN jsonb_build_object('success',true,'reward_id',p_reward_id,'reward_name',r.reward_name,'customer_id',cid);
END $$;
REVOKE ALL ON FUNCTION public.validate_loyalty_redemption(int,bigint,text),public.select_reward_option(int,text,bigint),
 public.redeem_loyalty_reward(int,bigint,uuid,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.validate_loyalty_redemption(int,bigint,text),public.select_reward_option(int,text,bigint),
 public.redeem_loyalty_reward(int,bigint,uuid,text,boolean) TO authenticated;
-- Only server functions can change loyalty accounting; reading remains allowed.
REVOKE INSERT,UPDATE,DELETE ON public.loyalty_progress,public.loyalty_rewards,public.loyalty_wash_log,public.loyalty_redemptions FROM authenticated,anon;

-- One sale request commits ticket/items/payment/inventory/membership/loyalty together.
-- Retrying the same request returns its receipt; it cannot sell or award twice.
CREATE TABLE loyalty_private.sale_requests(
 request_id uuid PRIMARY KEY,user_id uuid NOT NULL,payload jsonb NOT NULL,response jsonb
);
CREATE FUNCTION public.complete_car_wash_sale(p_request_id uuid,p_payload jsonb) RETURNS jsonb
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
 IF cached.user_id<>auth.uid() OR cached.payload<>p_payload THEN RAISE EXCEPTION 'La solicitud ya existe con otros datos. Reintenta con los datos originales.'; END IF;
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
     IF part->>'method' NOT IN ('cash','card','transfer') OR (part->>'amount')::numeric<0 THEN RAISE EXCEPTION 'Parte del pago inválida'; END IF;
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

CREATE FUNCTION loyalty_private.protect_customer_balance() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
 IF current_user IN ('authenticated','anon') AND
   (NEW.loyalty_visits IS DISTINCT FROM OLD.loyalty_visits OR
    NEW.loyalty_free_washes_earned IS DISTINCT FROM OLD.loyalty_free_washes_earned OR
    NEW.loyalty_free_washes_used IS DISTINCT FROM OLD.loyalty_free_washes_used OR
    NEW.loyalty_last_visit IS DISTINCT FROM OLD.loyalty_last_visit) THEN
   RAISE EXCEPTION 'El saldo de lealtad se calcula desde los tickets' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER protect_report_customer_balance BEFORE UPDATE ON public.customers FOR EACH ROW
 EXECUTE FUNCTION loyalty_private.protect_customer_balance();

-- Retain the pre-migration counters/statuses for a reviewed rollback if needed.
CREATE TABLE loyalty_private.progress_before_sync AS TABLE public.loyalty_progress;
CREATE TABLE loyalty_private.reward_status_before_sync AS SELECT id,status FROM public.loyalty_rewards;
CREATE TABLE loyalty_private.customer_balance_before_sync AS
 SELECT id,loyalty_visits,loyalty_last_visit,loyalty_free_washes_earned,loyalty_free_washes_used FROM public.customers;
-- Backfill derived progress only; do not create rewards or remove redemption audit.
DO $$ DECLARE c bigint; BEGIN FOR c IN SELECT id FROM public.customers ORDER BY id LOOP PERFORM loyalty_private.reconcile(c); END LOOP; END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA loyalty_private FROM PUBLIC,anon,authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA loyalty_private FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.record_loyalty_v3_wash(bigint,bigint,int,uuid), public.delete_report_ticket(bigint),
 public.edit_report_ticket(bigint,jsonb,timestamptz),public.reverse_loyalty_on_ticket_delete(bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_loyalty_v3_wash(bigint,bigint,int,uuid), public.delete_report_ticket(bigint),
 public.edit_report_ticket(bigint,jsonb,timestamptz),public.reverse_loyalty_on_ticket_delete(bigint) TO authenticated;
COMMIT;
