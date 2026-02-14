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
}

export interface MembershipWithStatus extends Membership {
    days_remaining: number;
    status: 'active' | 'expired' | 'expiring_soon';
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
          customers!inner(name, phone, plate),
          membership_plans!inner(name, discount_percent, wash_count, duration_days),
          vehicle_types(name)
        `);

            if (customerId) {
                query = query.eq('customer_id', Number(customerId));
            }

            const { data, error } = await query.order('created_at', { ascending: false });

            if (error) throw error;
            return data as any as Membership[];
        },
        enabled: !!customerId || customerId === undefined,
    });

    // Get membership with status details
    const getMembershipWithStatus = (membership: Membership): MembershipWithStatus => {
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

        let status: 'active' | 'expired' | 'expiring_soon' = 'active';
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
                .select('washes_used')
                .eq('id', membershipId)
                .single();

            const { error: updateError } = await supabase
                .from('customer_memberships')
                .update({ washes_used: (currentMembership?.washes_used || 0) + 1 })
                .eq('id', membershipId);

            if (updateError) throw updateError;

            return { success: true };
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['memberships'] });
        },
    });

    // Renew membership
    const renewMembershipMutation = useMutation({
        mutationFn: async ({
            membershipId,
            vehicleTypeId,
        }: {
            membershipId: number;
            vehicleTypeId?: number;
        }) => {
            const now = new Date();
            const expiresAt = new Date(now.getTime() + 28 * 24 * 60 * 60 * 1000);

            const updateData: any = {
                washes_used: 0,
                bonus_washes_earned: 0,
                expires_at: expiresAt.toISOString(),
                active: true,
            };

            if (vehicleTypeId) {
                updateData.vehicle_type_id = vehicleTypeId;
            }

            const { error } = await supabase
                .from('customer_memberships')
                .update(updateData)
                .eq('id', membershipId);

            if (error) throw error;

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
        }: {
            customerId: number;
            planId: number;
            vehicleTypeId: number;
        }) => {
            const { error } = await supabase
                .from('customer_memberships')
                .insert({
                    customer_id: customerId,
                    plan_id: planId,
                    vehicle_type_id: vehicleTypeId,
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
        recordWash: recordWashMutation.mutateAsync,
        renewMembership: renewMembershipMutation.mutateAsync,
        createMembership: createMembershipMutation.mutateAsync,
        isRecordingWash: recordWashMutation.isPending,
        isRenewing: renewMembershipMutation.isPending,
        isCreating: createMembershipMutation.isPending,
    };
}
