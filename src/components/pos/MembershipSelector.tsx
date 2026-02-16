import { useState, useEffect } from "react";
import { useMemberships, type Membership } from "@/hooks/useMemberships";
import { useServices } from "@/hooks/useServices";
import { isServiceEligible, getDaysRemaining } from "@/lib/membershipUtils";

interface MembershipSelectorProps {
    customerId: string | null;
    selectedServiceId?: string | number | null;
    selectedVehicleTypeId?: number | null;
    onMembershipSelect: (membership: Membership | null) => void;
    selectedMembership?: Membership | null;
}

export default function MembershipSelector({
    customerId,
    selectedServiceId,
    selectedVehicleTypeId,
    onMembershipSelect,
    selectedMembership,
}: MembershipSelectorProps) {
    const { memberships, isLoading, getMembershipWithStatus } = useMemberships(customerId || undefined);
    const { data: services } = useServices();
    const [showSelector, setShowSelector] = useState(false);

    // Filter active, non-expired memberships with remaining washes
    const activeMemberships = memberships?.filter((m) => {
        const { status } = getMembershipWithStatus(m);
        return status !== 'expired' && m.washes_used < m.total_washes_allowed && m.active;
    }) || [];

    // Find selected service to extract name for validation
    const selectedService = services?.find((s: any) => s.id === selectedServiceId);

    // Check if selected service is eligible (by ID or Name)
    // NOTE: For memberships, we don't need a manually selected service since the membership includes its own service
    const isEligible = selectedServiceId ? isServiceEligible(selectedServiceId, selectedService?.name) : true;

    // Check if selected vehicle type matches membership vehicle type
    const vehicleTypeMatches = selectedMembership && selectedVehicleTypeId
        ? selectedMembership.vehicle_type_id === selectedVehicleTypeId
        : true;

    // Auto-deselect if service is not eligible or vehicle type doesn't match
    useEffect(() => {
        if (selectedMembership && selectedServiceId && !isEligible) {
            onMembershipSelect(null);
        }
        if (selectedMembership && selectedVehicleTypeId && !vehicleTypeMatches) {
            onMembershipSelect(null);
        }
    }, [selectedServiceId, isEligible, selectedVehicleTypeId, vehicleTypeMatches]);

    if (!customerId || isLoading) return null;

    if (activeMemberships.length === 0) {
        return null; // No active memberships
    }

    return (
        <div className="px-4 py-3 border-b border-border">
            <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-secondary">
                    <i className="fa-solid fa-id-card mr-1" />
                    Membresía disponible
                </p>
                <button
                    onClick={() => setShowSelector(!showSelector)}
                    className="touch-btn text-xs text-accent hover:underline"
                >
                    {showSelector ? 'Ocultar' : 'Seleccionar'}
                </button>
            </div>

            {showSelector && (
                <div className="space-y-2 animate-fade-in">
                    {activeMemberships.map((membership) => {
                        const { days_remaining, status } = getMembershipWithStatus(membership);
                        const isSelected = selectedMembership?.id === membership.id;
                        const washesRemaining = membership.total_washes_allowed - membership.washes_used;
                        const vehicleMatches = !selectedVehicleTypeId || membership.vehicle_type_id === selectedVehicleTypeId;
                        // Memberships can always be used - they include their own service
                        const canUse = vehicleMatches;

                        return (
                            <button
                                key={membership.id}
                                onClick={() => onMembershipSelect(isSelected ? null : membership)}
                                disabled={!canUse}
                                className={`w-full p-3 rounded-lg border-2 text-left transition-all ${isSelected
                                    ? 'border-primary bg-primary/10'
                                    : 'border-border hover:border-primary/50'
                                    } ${!canUse ? 'opacity-50 cursor-not-allowed' : ''}`}
                            >
                                <div className="flex items-start justify-between">
                                    <div className="flex-1">
                                        <p className="font-semibold text-sm text-foreground">
                                            {membership.membership_plans?.name}
                                        </p>
                                        <p className="text-xs text-secondary mt-0.5">
                                            {membership.vehicle_types?.name}
                                        </p>
                                        {!vehicleMatches && selectedVehicleTypeId && (
                                            <p className="text-xs text-destructive mt-1 flex items-center">
                                                <i className="fa-solid fa-triangle-exclamation mr-1" />
                                                Membresía solo para {membership.vehicle_types?.name}
                                            </p>
                                        )}
                                    </div>
                                    {isSelected && (
                                        <i className="fa-solid fa-circle-check text-primary text-lg" />
                                    )}
                                </div>

                                <div className="flex items-center gap-4 mt-2 text-xs">
                                    <span className="px-2 py-1 rounded-full bg-accent/10 text-accent font-semibold">
                                        {membership.membership_plans?.discount_percent}% desc.
                                    </span>
                                    <span className="text-secondary">
                                        <i className="fa-solid fa-droplet mr-1" />
                                        {washesRemaining} lavados
                                    </span>
                                    <span className={`text-secondary ${status === 'expiring_soon' ? 'text-yellow-600' : ''}`}>
                                        <i className="fa-solid fa-calendar-days mr-1" />
                                        {days_remaining}d
                                    </span>
                                </div>
                            </button>
                        );
                    })}
                </div>
            )}

            {/* Selected Membership Summary */}
            {selectedMembership && !showSelector && (
                <div className="mt-2 p-2 bg-primary/10 rounded-lg border border-primary/20">
                    <div className="flex items-center justify-between">
                        <div className="flex-1">
                            <p className="text-xs font-semibold text-foreground">
                                {selectedMembership.membership_plans?.name}
                            </p>
                            <p className="text-xs text-accent font-bold mt-0.5">
                                <i className="fa-solid fa-check-circle mr-1" />
                                Lavado incluido en membresía - C$0
                            </p>
                        </div>
                        <button
                            onClick={() => onMembershipSelect(null)}
                            className="touch-btn p-1 text-destructive hover:bg-destructive/10 rounded"
                        >
                            <i className="fa-solid fa-times text-sm" />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
