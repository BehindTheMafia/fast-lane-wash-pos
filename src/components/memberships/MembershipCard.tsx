import { useState } from "react";
import { useMemberships, type Membership } from "@/hooks/useMemberships";
import { getStatusBadgeClass, getStatusLabel, getDaysRemaining } from "@/lib/membershipUtils";
import { niFormatDate, niFormatTime } from "@/utils/niDate";

interface MembershipCardProps {
    membership: Membership;
    pendingRenewal?: Membership; // The queued renewal for this customer (if any)
    onViewDetails?: (membership: Membership) => void;
    onRenew?: (membershipId: string) => void;
    onEdit?: (membership: Membership) => void;
    onDelete?: (membership: Membership) => void;
    onCancelRenewal?: (membership: Membership) => void;
}

export default function MembershipCard({ membership, pendingRenewal, onViewDetails, onRenew, onEdit, onDelete, onCancelRenewal }: MembershipCardProps) {
    const { getMembershipWithStatus } = useMemberships();
    const membershipWithStatus = getMembershipWithStatus(membership);
    const { days_remaining, status } = membershipWithStatus;

    const washProgress = (membership.washes_used / membership.total_washes_allowed) * 100;
    const isExpired = status === 'expired';
    const hasPendingRenewal = !!pendingRenewal;

    // Format dates with full detail
    const createdDate = membership.created_at
        ? niFormatDate(membership.created_at, { day: '2-digit', month: 'short', year: 'numeric' })
        : '—';
    const createdTime = membership.created_at
        ? niFormatTime(membership.created_at)
        : '';
    const expiresDate = membership.expires_at
        ? niFormatDate(membership.expires_at, { day: '2-digit', month: 'short', year: 'numeric' })
        : '—';
    const expiresTime = membership.expires_at
        ? niFormatTime(membership.expires_at)
        : '';

    // Pending renewal dates
    const renewalDate = pendingRenewal?.created_at
        ? niFormatDate(pendingRenewal.created_at, { day: '2-digit', month: 'short', year: 'numeric' })
        : '';
    const renewalTime = pendingRenewal?.created_at
        ? niFormatTime(pendingRenewal.created_at)
        : '';

    return (
        <div
            className={`pos-card p-4 ${isExpired ? 'opacity-75' : ''} ${onViewDetails ? 'cursor-pointer hover:ring-2 hover:ring-primary/20 transition-all' : ''}`}
            onClick={() => onViewDetails?.(membership)}
        >
            <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                    <h4 className="font-bold text-foreground">
                        {membership.customers?.name}
                        <span className="text-[10px] opacity-20 ml-2 font-normal">v2.1</span>
                    </h4>
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
                <div className="flex flex-col items-end gap-1">
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusBadgeClass(status)}`}>
                        {getStatusLabel(status)}
                    </span>
                    {hasPendingRenewal && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-500/20 text-blue-600">
                            <i className="fa-solid fa-rotate-right mr-1" />Renovada
                        </span>
                    )}
                </div>
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

            {/* Acquisition & Expiration Dates */}
            <div className="mb-3 p-2.5 rounded-lg bg-muted/30 border border-border/50 space-y-2">
                {/* Acquired date/time */}
                <div className="flex items-center justify-between text-xs">
                    <span className="text-secondary flex items-center gap-1.5">
                        <i className="fa-solid fa-calendar-plus text-primary/70" />
                        Adquirida
                    </span>
                    <span className="font-semibold text-foreground">
                        {createdDate} {createdTime && <span className="text-muted-foreground font-normal ml-1">{createdTime}</span>}
                    </span>
                </div>
                {/* Expiration date/time */}
                <div className="flex items-center justify-between text-xs">
                    <span className="text-secondary flex items-center gap-1.5">
                        <i className={`fa-solid fa-calendar-xmark ${isExpired ? 'text-destructive/70' : 'text-accent/70'}`} />
                        Expira
                    </span>
                    <span className={`font-semibold ${isExpired ? 'text-destructive' : 'text-foreground'}`}>
                        {expiresDate} {expiresTime && <span className={`font-normal ml-1 ${isExpired ? 'text-destructive/70' : 'text-muted-foreground'}`}>{expiresTime}</span>}
                    </span>
                </div>
            </div>

            {/* Days Remaining */}
            <div className="flex items-center justify-between text-sm mb-3">
                <span className="text-secondary">
                    <i className="fa-solid fa-clock mr-1" />
                    {isExpired ? 'Expiró' : 'Días restantes'}
                </span>
                <span className={`font-bold ${isExpired ? 'text-destructive' : 'text-foreground'}`}>
                    {isExpired ? 'Vencida' : `${days_remaining} días`}
                </span>
            </div>

            {/* Pending Renewal Banner — embedded in the same card */}
            {hasPendingRenewal && (
                <div className="mb-3 p-3 rounded-lg bg-blue-500/10 border border-blue-400/30 space-y-2">
                    <div className="flex items-center gap-2 text-xs text-blue-600 font-semibold">
                        <i className="fa-solid fa-clock-rotate-left" />
                        Renovación anticipada adquirida
                    </div>
                    <div className="flex items-center justify-between text-xs">
                        <span className="text-blue-600/80 flex items-center gap-1.5">
                            <i className="fa-solid fa-calendar-plus" />
                            Comprada el
                        </span>
                        <span className="font-semibold text-blue-700">
                            {renewalDate} {renewalTime && <span className="font-normal text-blue-600/70 ml-1">{renewalTime}</span>}
                        </span>
                    </div>
                    <p className="text-xs text-blue-600/80 border-t border-blue-400/20 pt-2">
                        <i className="fa-solid fa-circle-info mr-1" />
                        Se activará automáticamente al finalizar esta membresía (lavados agotados o tiempo expirado).
                    </p>
                    {onCancelRenewal && (
                        <button
                            onClick={(e) => { e.stopPropagation(); onCancelRenewal(pendingRenewal); }}
                            className="w-full mt-1 py-1.5 rounded-lg bg-red-500/10 text-red-500 text-xs font-semibold hover:bg-red-500/20 flex items-center justify-center gap-1"
                        >
                            <i className="fa-solid fa-xmark" />
                            Cancelar renovación
                        </button>
                    )}
                </div>
            )}

            {/* Discount Badge */}
            <div className="flex items-center justify-between mb-3">
                <span className="px-3 py-1 rounded-full bg-accent/10 text-accent text-xs font-semibold">
                    <i className="fa-solid fa-tag mr-1" />
                    {membership.membership_plans?.discount_percent}% descuento
                </span>

                {/* Renew Button — only if NO pending renewal exists */}
                {!hasPendingRenewal && onRenew && (
                    <button
                        onClick={(e) => { e.stopPropagation(); onRenew(String(membership.id)); }}
                        className={`touch-btn px-3 py-1 rounded-lg text-xs font-semibold ${
                            isExpired 
                                ? 'bg-primary text-primary-foreground hover:bg-primary/90' 
                                : 'bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 border border-blue-400/30'
                        }`}
                    >
                        <i className="fa-solid fa-rotate-right mr-1" />
                        {isExpired ? 'Renovar' : 'Renovar anticipado'}
                    </button>
                )}
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2 pt-3 border-t border-border">
                {onEdit && (
                    <button
                        onClick={(e) => { e.stopPropagation(); onEdit(membership); }}
                        className="touch-btn flex-1 py-2 rounded-lg bg-secondary/10 text-secondary text-xs font-semibold hover:bg-secondary/20 flex items-center justify-center gap-1"
                    >
                        <i className="fa-solid fa-pen-to-square" />
                        Editar
                    </button>
                )}
                {onDelete && (
                    <button
                        onClick={(e) => { e.stopPropagation(); onDelete(membership); }}
                        className="touch-btn flex-1 py-2 rounded-lg bg-destructive/10 text-destructive text-xs font-semibold hover:bg-destructive/20 flex items-center justify-center gap-1"
                    >
                        <i className="fa-solid fa-trash-can" />
                        Eliminar
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
