import { useState } from "react";

interface MembershipRenewalModalProps {
    membership: {
        id: string;
        customer_name: string;
        plan_name: string;
        vehicle_type_id?: number;
    };
    onConfirm: (membershipId: string, vehicleTypeId: number) => void;
    onClose: () => void;
    isLoading?: boolean;
}

const vehicleTypes = [
    { id: 1, label: "Moto", icon: "fa-motorcycle" },
    { id: 2, label: "Sedán", icon: "fa-car" },
    { id: 3, label: "SUV", icon: "fa-car-side" },
    { id: 4, label: "Pick up", icon: "fa-truck-pickup" },
    { id: 5, label: "Microbús", icon: "fa-van-shuttle" },
    { id: 6, label: "Taxi", icon: "fa-taxi" },
];

export default function MembershipRenewalModal({
    membership,
    onConfirm,
    onClose,
    isLoading = false,
}: MembershipRenewalModalProps) {
    const [selectedVehicleType, setSelectedVehicleType] = useState<number>(
        membership.vehicle_type_id || 2
    );

    const handleConfirm = () => {
        onConfirm(membership.id, selectedVehicleType);
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content animate-scale-in max-w-md" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xl font-bold text-foreground">
                        <i className="fa-solid fa-rotate-right mr-2 text-secondary" />
                        Renovar Membresía
                    </h3>
                    <button
                        onClick={onClose}
                        className="touch-btn p-2 hover:bg-muted rounded-lg transition-colors"
                    >
                        <i className="fa-solid fa-times text-muted-foreground" />
                    </button>
                </div>

                <div className="space-y-4">
                    {/* Membership Info */}
                    <div className="p-4 bg-muted/30 rounded-lg">
                        <p className="text-sm text-secondary mb-1">Cliente</p>
                        <p className="font-semibold text-foreground">{membership.customer_name}</p>
                        <p className="text-xs text-secondary mt-2">Plan</p>
                        <p className="font-semibold text-foreground">{membership.plan_name}</p>
                    </div>

                    {/* Vehicle Type Selection */}
                    <div>
                        <label className="text-sm font-semibold text-foreground block mb-2">
                            Tipo de vehículo
                        </label>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                            {vehicleTypes.map((vt) => (
                                <button
                                    key={vt.id}
                                    onClick={() => setSelectedVehicleType(vt.id)}
                                    className={`p-3 rounded-lg border-2 transition-all ${selectedVehicleType === vt.id
                                        ? 'border-primary bg-primary/10'
                                        : 'border-border hover:border-primary/50'
                                        }`}
                                >
                                    <i className={`fa-solid ${vt.icon} text-2xl ${selectedVehicleType === vt.id ? 'text-primary' : 'text-secondary'
                                        }`} />
                                    <p className="text-xs font-semibold text-foreground mt-1">{vt.label}</p>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Info Alert */}
                    <div className="p-3 bg-accent/10 border border-accent/20 rounded-lg">
                        <div className="flex gap-2">
                            <i className="fa-solid fa-circle-info text-accent mt-0.5" />
                            <div className="text-xs text-foreground">
                                <p className="font-semibold mb-1">Al renovar la membresía:</p>
                                <ul className="list-disc list-inside space-y-0.5 text-secondary">
                                    <li>Se reiniciará el contador de lavados (0/8)</li>
                                    <li>Nueva fecha de expiración: +28 días</li>
                                    <li>Descuento del 36% en lavados elegibles</li>
                                </ul>
                            </div>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-3">
                        <button
                            onClick={onClose}
                            disabled={isLoading}
                            className="flex-1 px-4 py-3 rounded-xl border-2 border-border text-foreground font-semibold hover:bg-muted transition-colors disabled:opacity-50"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleConfirm}
                            disabled={isLoading}
                            className="flex-1 btn-cobrar h-auto py-3 disabled:opacity-50"
                        >
                            {isLoading ? (
                                <>
                                    <i className="fa-solid fa-spinner fa-spin mr-2" />
                                    Renovando...
                                </>
                            ) : (
                                <>
                                    <i className="fa-solid fa-check mr-2" />
                                    Confirmar
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
