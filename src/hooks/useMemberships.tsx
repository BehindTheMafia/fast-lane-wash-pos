import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface Membership {
    id: number;
    customer_id: number;
    plan_id: number;
    washes_used: number;
    total_washes_allowed: number;
    bonus_washes_earned: number;
    vehicle_type_id: number | null;
    expires_at: string | null;
    created_at: string;
    active: boolean;
    service_id: number;
    customers?: {
        name: string;
        phone: string | null;
        plate: string | null;
    };
    membership_plans?: {
        name: string;
        discount_percent: number;
        wash_count: number;
        duration_days: number;
    };
    vehicle_types?: {
        name: string;
    };
    services?: {
        id: number;
        name: string;
        description: string | null;
    };
}

export interface MembershipWithStatus extends Membership {
    days_remaining: number;
    status: 'active' | 'expired' | 'expiring_soon' | 'pending';
}

export function useMemberships(customerId?: string) {
    const queryClient = useQueryClient();

    // Get all memberships for a customer (both active and inactive)
    const { data: memberships, isLoading } = useQuery({
        queryKey: ['memberships', customerId],
        queryFn: async () => {
            let query = supabase
                .from('customer_memberships')
                .select(`
          *,
          customers(name, phone, plate),
          membership_plans(name, discount_percent, wash_count, duration_days),
          vehicle_types(name)
        `);

            if (customerId) {
                query = query.eq('customer_id', Number(customerId));
            }

            const { data, error } = await query.order('created_at', { ascending: false });

            if (error) throw error;

            console.log('[useMemberships] Raw data from DB:', data);

            // Fetch services separately and join manually
            if (data && data.length > 0) {
                const serviceIds = [...new Set((data as any[]).map((m: any) => m.service_id).filter(Boolean))];

                console.log('[useMemberships] Service IDs found:', serviceIds);

                if (serviceIds.length > 0) {
                    const { data: servicesData, error: servicesError } = await supabase
                        .from('services')
                        .select('id, name, description')
                        .in('id', serviceIds);

                    if (servicesError) {
                        console.error('[useMemberships] Error fetching services:', servicesError);
                    } else {
                        console.log('[useMemberships] Services data:', servicesData);
                    }

                    // Manually join services to memberships
                    const membershipsWithServices = (data as any[]).map((membership: any) => ({
                        ...membership,
                        services: servicesData?.find((s: any) => s.id === membership.service_id) || null
                    }));

                    console.log('[useMemberships] Loaded memberships with services:', membershipsWithServices);
                    return membershipsWithServices as any as Membership[];
                } else {
                    console.warn('[useMemberships] No service_id found in memberships! Returning memberships without services.');
                }
            }

            console.log('[useMemberships] Loaded memberships (no services):', data);
            return data as any as Membership[];
        },
        enabled: true,
    });

    // Get membership with status details
    const getMembershipWithStatus = (membership: Membership): MembershipWithStatus => {
        // Pending membership: active=false AND (washes_used=0 or null)
        // This is a queued renewal waiting for the previous membership to finish
        if (!membership.active && (!membership.washes_used || membership.washes_used === 0)) {
            return {
                ...membership,
                days_remaining: 0,
                status: 'pending',
            };
        }

        // Washes exhausted → expired (regardless of time)
        if (membership.washes_used >= membership.total_washes_allowed && membership.total_washes_allowed > 0) {
            return {
                ...membership,
                days_remaining: 0,
                status: 'expired',
            };
        }

        if (!membership.expires_at) {
            return {
                ...membership,
                days_remaining: 0,
                status: 'expired',
            };
        }

        const now = new Date();
        const expiresAt = new Date(membership.expires_at);
        const diffTime = expiresAt.getTime() - now.getTime();
        const days_remaining = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));

        let status: 'active' | 'expired' | 'expiring_soon' | 'pending' = 'active';
        if (days_remaining === 0 || expiresAt < now) {
            status = 'expired';
        } else if (days_remaining <= 7) {
            status = 'expiring_soon';
        }

        return {
            ...membership,
            days_remaining,
            status,
        };
    };

    // Check if membership is expired
    const isMembershipExpired = (membership: Membership): boolean => {
        if (!membership.expires_at) return true;
        const now = new Date();
        const expiresAt = new Date(membership.expires_at);
        return expiresAt < now;
    };

    // Calculate days remaining
    const getDaysRemaining = (membership: Membership): number => {
        if (!membership.expires_at) return 0;
        const now = new Date();
        const expiresAt = new Date(membership.expires_at);
        const diffTime = expiresAt.getTime() - now.getTime();
        return Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
    };

    // Apply membership discount (36%)
    const applyMembershipDiscount = (price: number, membership: Membership): number => {
        const discountPercent = membership.membership_plans?.discount_percent || 36;
        return price * (1 - discountPercent / 100);
    };

    // Check if there are washes available
    const hasWashesAvailable = (membership: Membership): boolean => {
        return membership.washes_used < membership.total_washes_allowed;
    };

    // Activate a pending membership (set active=true and calculate expires_at)
    const activatePendingMembership = async (pendingMembershipId: number) => {
        // Get the pending membership's plan to calculate duration
        const { data: pendingData } = await supabase
            .from('customer_memberships')
            .select('plan_id, membership_plans(duration_days, wash_count)')
            .eq('id', pendingMembershipId)
            .single();

        const durationDays = (pendingData as any)?.membership_plans?.duration_days || 28;

        const now = new Date();
        const expiresAt = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);

        const { error } = await supabase
            .from('customer_memberships')
            .update({
                active: true,
                expires_at: expiresAt.toISOString(),
            })
            .eq('id', pendingMembershipId);

        if (error) {
            console.error('[useMemberships] Error activating pending membership:', error);
            throw error;
        }

        console.log(`[useMemberships] Pending membership ${pendingMembershipId} activated, expires: ${expiresAt.toISOString()}`);
    };

    // Check and activate pending memberships for a customer when their active membership is exhausted/expired
    const checkAndActivatePending = async (customerId: number) => {
        // Find pending memberships for this customer (active=false, washes_used=0, no expires_at)
        // Look for the first pending membership (not active, washes_used=0 or null)
        const { data: pendingMemberships } = await supabase
            .from('customer_memberships')
            .select('id, created_at')
            .eq('customer_id', customerId)
            .eq('active', false)
            .or('washes_used.eq.0,washes_used.is.null')
            .order('created_at', { ascending: true })
            .limit(1);

        if (pendingMemberships && pendingMemberships.length > 0) {
            console.log(`[useMemberships] Found pending membership ${pendingMemberships[0].id} for customer ${customerId}, activating...`);

            // Step 1: Deactivate all old finished memberships for this customer
            // (exhausted or time-expired ones that still have active=true)
            const { data: oldMemberships } = await supabase
                .from('customer_memberships')
                .select('id, washes_used, total_washes_allowed, expires_at')
                .eq('customer_id', customerId)
                .eq('active', true);

            if (oldMemberships) {
                for (const old of oldMemberships) {
                    const washesExhausted = old.washes_used >= old.total_washes_allowed;
                    const timeExpired = old.expires_at ? new Date(old.expires_at) < new Date() : false;

                    if (washesExhausted || timeExpired) {
                        console.log(`[useMemberships] Deactivating old membership ${old.id} (exhausted=${washesExhausted}, expired=${timeExpired})`);
                        await supabase
                            .from('customer_memberships')
                            .update({ active: false })
                            .eq('id', old.id);
                    }
                }
            }

            // Step 2: Activate the pending membership
            await activatePendingMembership(pendingMemberships[0].id);

            // Step 3: Refresh the data
            queryClient.invalidateQueries({ queryKey: ['memberships'] });
        }
    };

    // Record a wash
    const recordWashMutation = useMutation({
        mutationFn: async ({
            membershipId,
            ticketId,
            serviceId,
            isBonus = false,
        }: {
            membershipId: number;
            ticketId: number;
            serviceId: number;
            isBonus?: boolean;
        }) => {
            // Create wash record
            const { error: washError } = await supabase
                .from('membership_washes')
                .insert({
                    membership_id: membershipId,
                    ticket_id: ticketId,
                    service_id: serviceId,
                    is_bonus: isBonus,
                });

            if (washError) throw washError;

            // Increment washes_used - fetch current value first
            const { data: currentMembership } = await supabase
                .from('customer_memberships')
                .select('washes_used, total_washes_allowed, customer_id')
                .eq('id', membershipId)
                .single();

            const newWashesUsed = (currentMembership?.washes_used || 0) + 1;

            const { error: updateError } = await supabase
                .from('customer_memberships')
                .update({ washes_used: newWashesUsed })
                .eq('id', membershipId);

            if (updateError) throw updateError;

            // If washes are now exhausted, check for pending memberships to activate
            if (currentMembership && newWashesUsed >= (currentMembership.total_washes_allowed || 0)) {
                console.log(`[useMemberships] Membership ${membershipId} washes exhausted (${newWashesUsed}/${currentMembership.total_washes_allowed}), checking for pending...`);
                await checkAndActivatePending(currentMembership.customer_id);
            }

            return { success: true };
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['memberships'] });
        },
    });

    // Renew membership — creates a NEW pending membership instead of updating the existing one
    // The new membership will activate when the current one expires or runs out of washes
    const renewMembershipMutation = useMutation({
        mutationFn: async ({
            membershipId,
            vehicleTypeId,
        }: {
            membershipId: number;
            vehicleTypeId?: number;
        }) => {
            // Fetch the current membership to get plan, customer, service info
            const { data: membershipData } = await supabase
                .from('customer_memberships')
                .select('customer_id, plan_id, service_id, vehicle_type_id, active, washes_used, total_washes_allowed, expires_at, membership_plans(duration_days, wash_count)')
                .eq('id', membershipId)
                .single();

            if (!membershipData) throw new Error('Membresía no encontrada');

            const washCount = (membershipData as any)?.membership_plans?.wash_count || 8;
            const currentlyActive = (membershipData as any).active;
            const washesExhausted = (membershipData as any).washes_used >= (membershipData as any).total_washes_allowed;
            const isExpired = (membershipData as any).expires_at 
                ? new Date((membershipData as any).expires_at) < new Date() 
                : true;
            const isCurrentlyFinished = !currentlyActive || washesExhausted || isExpired;

            // Check if there's already a pending membership for this customer
            const { data: existingPending } = await supabase
                .from('customer_memberships')
                .select('id')
                .eq('customer_id', (membershipData as any).customer_id)
                .eq('active', false)
                .eq('washes_used', 0);

            if (existingPending && existingPending.length > 0) {
                throw new Error('Ya existe una membresía pendiente para este cliente. Espera a que se active.');
            }

            const finalVehicleTypeId = vehicleTypeId || (membershipData as any).vehicle_type_id;

            if (isCurrentlyFinished) {
                // If the current membership is already finished, activate immediately
                const durationDays = (membershipData as any)?.membership_plans?.duration_days || 28;
                const now = new Date();
                const expiresAt = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);

                const { error } = await supabase
                    .from('customer_memberships')
                    .insert({
                        customer_id: (membershipData as any).customer_id,
                        plan_id: (membershipData as any).plan_id,
                        service_id: (membershipData as any).service_id,
                        vehicle_type_id: finalVehicleTypeId,
                        total_washes_allowed: washCount,
                        washes_used: 0,
                        bonus_washes_earned: 0,
                        active: true,
                        expires_at: expiresAt.toISOString(),
                    });

                if (error) throw error;
                console.log('[useMemberships] Current membership finished → new membership activated immediately');
            } else {
                // Current membership is still active → create as PENDING
                // expires_at = null, active = false → it will be activated when the current one finishes
                const { error } = await supabase
                    .from('customer_memberships')
                    .insert({
                        customer_id: (membershipData as any).customer_id,
                        plan_id: (membershipData as any).plan_id,
                        service_id: (membershipData as any).service_id,
                        vehicle_type_id: finalVehicleTypeId,
                        total_washes_allowed: washCount,
                        washes_used: 0,
                        bonus_washes_earned: 0,
                        active: false,
                        expires_at: null,
                    });

                if (error) throw error;
                console.log('[useMemberships] Current membership still active → new membership queued as PENDING');
            }

            return { success: true };
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['memberships'] });
        },
    });

    // Create new membership
    const createMembershipMutation = useMutation({
        mutationFn: async ({
            customerId,
            planId,
            vehicleTypeId,
            serviceId,
        }: {
            customerId: number;
            planId: number;
            vehicleTypeId: number;
            serviceId: number;
        }) => {
            // Fetch plan details to set correct wash count and expiry
            const { data: planData, error: planErr } = await supabase
                .from('membership_plans')
                .select('wash_count, duration_days')
                .eq('id', planId)
                .single();

            if (planErr) throw planErr;

            const washCount = planData?.wash_count ?? 8;
            const durationDays = planData?.duration_days ?? 28;
            const expiresAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString();

            const { error } = await supabase
                .from('customer_memberships')
                .insert({
                    customer_id: customerId,
                    plan_id: planId,
                    vehicle_type_id: vehicleTypeId,
                    service_id: serviceId,
                    total_washes_allowed: washCount,   // ← Correcto según el plan
                    expires_at: expiresAt,             // ← Calculado desde duration_days
                });

            if (error) throw error;

            return { success: true };
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['memberships'] });
        },
    });

    return {
        memberships,
        isLoading,
        getMembershipWithStatus,
        isMembershipExpired,
        getDaysRemaining,
        applyMembershipDiscount,
        hasWashesAvailable,
        checkAndActivatePending,
        recordWash: recordWashMutation.mutateAsync,
        renewMembership: renewMembershipMutation.mutateAsync,
        createMembership: createMembershipMutation.mutateAsync,
        isRecordingWash: recordWashMutation.isPending,
        isRenewing: renewMembershipMutation.isPending,
        isCreating: createMembershipMutation.isPending,
    };
}
