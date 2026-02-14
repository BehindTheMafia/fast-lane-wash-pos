import { useState } from "react";
import { useMemberships, type Membership } from "@/hooks/useMemberships";
import { getStatusBadgeClass, getStatusLabel, getDaysRemaining } from "@/lib/membershipUtils";

interface MembershipCardProps {
    membership: Membership;
    onRenew?: (membershipId: string) => void;
}

export default function MembershipCard({ membership, onRenew }: MembershipCardProps) {
    const { getMembershipWithStatus } = useMemberships();
    const membershipWithStatus = getMembershipWithStatus(membership);
    const { days_remaining, status } = membershipWithStatus;

    const washProgress = (membership.washes_used / membership.total_washes_allowed) * 100;
    const isExpired = status === 'expired';

    return (
        <div className={`pos-card p-4 ${isExpired ? 'opacity-75' : ''}`}>
            <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                    <h4 className="font-bold text-foreground">{membership.customers?.name}</h4>
                    <p className="text-xs text-secondary mt-0.5">
                        {membership.membership_plans?.name}
                    </p>
                    {membership.vehicle_types && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                            <i className="fa-solid fa-car mr-1" />
                            {membership.vehicle_types.name}
                        </p>
                    )}
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusBadgeClass(status)}`}>
                    {getStatusLabel(status)}
                </span>
            </div>

            {/* Wash Progress */}
            <div className="mb-3">
                <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-secondary">Lavados</span>
                    <span className="font-bold text-foreground">
                        {membership.washes_used}/{membership.total_washes_allowed}
                    </span>
                </div>
                <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                    <div
                        className="h-full bg-primary rounded-full transition-all duration-300"
                        style={{ width: `${Math.min(100, washProgress)}%` }}
                    />
                </div>
            </div>

            {/* Days Remaining */}
            <div className="flex items-center justify-between text-sm mb-3">
                <span className="text-secondary">
                    <i className="fa-solid fa-calendar-days mr-1" />
                    {isExpired ? 'Expiró' : 'Días restantes'}
                </span>
                <span className={`font-bold ${isExpired ? 'text-destructive' : 'text-foreground'}`}>
                    {isExpired ? 'Vencida' : `${days_remaining} días`}
                </span>
            </div>

            {/* Discount Badge */}
            <div className="flex items-center justify-between">
                <span className="px-3 py-1 rounded-full bg-accent/10 text-accent text-xs font-semibold">
                    <i className="fa-solid fa-tag mr-1" />
                    {membership.membership_plans?.discount_percent}% descuento
                </span>

                {/* Renew Button */}
                {isExpired && onRenew && (
                    <button
                        onClick={() => onRenew(membership.id)}
                        className="touch-btn px-3 py-1 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90"
                    >
                        <i className="fa-solid fa-rotate-right mr-1" />
                        Renovar
                    </button>
                )}
            </div>

            {/* Bonus Indicator */}
            {membership.bonus_washes_earned > 0 && (
                <div className="mt-3 pt-3 border-t border-border">
                    <div className="flex items-center gap-2 text-xs text-accent">
                        <i className="fa-solid fa-gift" />
                        <span className="font-semibold">
                            {membership.bonus_washes_earned} lavado{membership.bonus_washes_earned > 1 ? 's' : ''} gratis ganado{membership.bonus_washes_earned > 1 ? 's' : ''}
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
}
