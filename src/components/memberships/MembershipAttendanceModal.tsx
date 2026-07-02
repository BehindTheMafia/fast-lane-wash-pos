import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { niFormatDate, niFormatTime } from "@/utils/niDate";
import type { Membership } from "@/hooks/useMemberships";

interface MembershipAttendanceModalProps {
    membership: Membership;
    onClose: () => void;
}

export default function MembershipAttendanceModal({ membership, onClose }: MembershipAttendanceModalProps) {
    const [washes, setWashes] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadWashes();
    }, []);

    const loadWashes = async () => {
        setLoading(true);
        const { data } = await supabase
            .from('membership_washes')
            .select(`
                id,
                created_at,
                is_bonus,
                service_id,
                ticket_id,
                services ( name ),
                tickets ( ticket_number )
            `)
            .eq('membership_id', membership.id)
            .order('created_at', { ascending: false });

        setWashes(data || []);
        setLoading(false);
    };

    const totalWashes = washes.length;
    const planName = membership.membership_plans?.name || "Plan";
    const customerName = membership.customers?.name || "Cliente";

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content animate-scale-in max-w-lg" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xl font-bold text-foreground">
                        <i className="fa-solid fa-droplet mr-2 text-primary" />
                        Asistencias
                    </h3>
                    <button onClick={onClose} className="touch-btn p-2 hover:bg-muted rounded-lg transition-colors">
                        <i className="fa-solid fa-times text-muted-foreground" />
                    </button>
                </div>

                {/* Customer & Plan Info */}
                <div className="p-4 bg-muted/30 rounded-lg mb-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-secondary mb-1">Cliente</p>
                            <p className="font-semibold text-foreground">{customerName}</p>
                        </div>
                        <div className="text-right">
                            <p className="text-sm text-secondary mb-1">Plan</p>
                            <p className="font-semibold text-foreground">{planName}</p>
                        </div>
                    </div>
                </div>

                {/* Summary */}
                <div className="flex mb-4">
                    <div className="p-3 rounded-lg bg-primary/10 text-center flex-1">
                        <p className="text-2xl font-bold text-primary">{totalWashes}</p>
                        <p className="text-xs text-secondary mt-1">Total lavados usados</p>
                    </div>
                </div>

                {/* Washes List */}
                <div>
                    <p className="text-sm font-semibold text-foreground mb-2 flex items-center gap-1.5">
                        <i className="fa-solid fa-list text-secondary" />
                        Historial de lavados
                        <span className="text-xs font-normal text-muted-foreground">({totalWashes} registros)</span>
                    </p>

                    {loading ? (
                        <div className="flex items-center justify-center py-8">
                            <i className="fa-solid fa-spinner fa-spin text-2xl text-accent" />
                        </div>
                    ) : washes.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                            <i className="fa-solid fa-inbox text-3xl mb-2 opacity-30" />
                            <p className="text-sm">No hay lavados registrados</p>
                            <p className="text-xs mt-1">Los lavados aparecerán aquí cuando el cliente los use.</p>
                        </div>
                    ) : (
                        <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                            {washes.map((wash, idx) => {
                                const serviceName = wash.services?.name || "Servicio";
                                const ticketNumber = wash.tickets?.ticket_number || null;
                                const washDate = niFormatDate(wash.created_at, { day: '2-digit', month: 'short', year: 'numeric' });
                                const washTime = niFormatTime(wash.created_at);

                                return (
                                    <div key={wash.id} className="flex items-center justify-between p-3 rounded-lg bg-background border border-border/50 hover:border-primary/30 transition-colors">
                                        <div className="flex items-center gap-3">
                                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm ${
                                                wash.is_bonus
                                                    ? 'bg-blue-500/10 text-blue-600'
                                                    : 'bg-primary/10 text-primary'
                                            }`}>
                                                <i className={`fa-solid ${wash.is_bonus ? 'fa-gift' : 'fa-droplet'}`} />
                                            </div>
                                            <div>
                                                <p className="text-sm font-semibold text-foreground">{serviceName}</p>
                                                <p className="text-xs text-muted-foreground">
                                                    {washDate} — {washTime}
                                                </p>
                                                {ticketNumber && (
                                                    <p className="text-xs text-secondary mt-0.5">
                                                        <i className="fa-solid fa-receipt mr-1" />
                                                        Ticket: {ticketNumber}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                            wash.is_bonus
                                                ? 'bg-blue-500/10 text-blue-600'
                                                : 'bg-primary/10 text-primary'
                                        }`}>
                                            {wash.is_bonus ? 'Bonus' : 'Normal'}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Progress Info */}
                <div className="mt-4 p-3 bg-muted/20 rounded-lg border border-border/50">
                    <div className="flex items-center justify-between text-sm mb-1">
                        <span className="text-secondary">Progreso del plan</span>
                        <span className="font-semibold text-foreground">
                            {membership.washes_used}/{membership.total_washes_allowed}
                        </span>
                    </div>
                    <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                        <div
                            className="h-full bg-primary rounded-full transition-all"
                            style={{ width: `${Math.min(100, (membership.washes_used / membership.total_washes_allowed) * 100)}%` }}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
