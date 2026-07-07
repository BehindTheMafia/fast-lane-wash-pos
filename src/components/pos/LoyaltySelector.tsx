import { useState } from "react";
import {
  useAvailableRewards,
  REWARD_SERVICE_MAP,
  type LoyaltyReward,
  type LoyaltyTicketItem,
} from "@/hooks/useLoyaltyV3";

interface AvailableService {
  id: number;
  name: string;
}

interface Props {
  customerId: number | null;
  customerName: string;
  selectedVehicleId: number;
  vehicleLabel: string;
  services: AvailableService[] | undefined;
  servicePrices: any[] | undefined;
  selectedReward: LoyaltyReward | null;
  onRewardSelect: (reward: LoyaltyReward | null, item: LoyaltyTicketItem | null) => void;
}

export default function LoyaltySelector({
  customerId,
  selectedVehicleId,
  vehicleLabel,
  services,
  servicePrices,
  selectedReward,
  onRewardSelect,
}: Props) {
  const { data: rewards = [], isLoading } = useAvailableRewards(customerId);
  const [showSelector, setShowSelector] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  if (!customerId || isLoading || rewards.length === 0) return null;

  /** Resolve the fixed service that this reward maps to */
  const resolveService = (reward: LoyaltyReward): { service: AvailableService; price: number } | null => {
    const pattern = REWARD_SERVICE_MAP[reward.reward_slug];
    if (!pattern || !services) return null;
    const service = services.find(s =>
      s.name.toLowerCase().includes(pattern.toLowerCase())
    );
    if (!service) return null;
    let price = 0;
    if (servicePrices && selectedVehicleId) {
      const priceEntry = servicePrices.find(
        (p: any) => p.service_id === service.id && p.vehicle_type_id === selectedVehicleId
      );
      // For extras (uniform price regardless of vehicle), try without vehicle filter
      if (!priceEntry) {
        const anyPrice = servicePrices.find((p: any) => p.service_id === service.id);
        price = anyPrice ? Number(anyPrice.price) : 0;
      } else {
        price = Number(priceEntry.price);
      }
    } else if (servicePrices) {
      // No vehicle selected — get first price available for this service
      const anyPrice = servicePrices.find((p: any) => p.service_id === service.id);
      price = anyPrice ? Number(anyPrice.price) : 0;
    }
    return { service, price };
  };

  const handleSelect = (reward: LoyaltyReward) => {
    setValidationError(null);

    if (selectedReward?.id === reward.id) {
      onRewardSelect(null, null);
      return;
    }

    if (!selectedVehicleId) {
      setValidationError("Selecciona el tipo de vehículo antes de aplicar un premio.");
      return;
    }

    const resolved = resolveService(reward);
    if (!resolved) {
      const pattern = REWARD_SERVICE_MAP[reward.reward_slug];
      setValidationError(
        `No se encontró el servicio "${pattern ?? "?"}" en el catálogo. ` +
        `Verifica que esté activo o configura el precio para este tipo de vehículo.`
      );
      return;
    }

    const item: LoyaltyTicketItem = {
      serviceId: resolved.service.id,
      serviceName: resolved.service.name,
      vehicleTypeId: selectedVehicleId || 0,
      vehicleLabel,
      price: resolved.price,
      discountPercent: 100,
      isLoyaltyRedemption: true,
      loyaltyRewardId: reward.id,
      loyaltyRewardName: reward.reward_name,
      loyaltyOriginalPrice: resolved.price,
    };

    onRewardSelect(reward, item);
    setShowSelector(false);
  };

  const PROGRAM_COLORS: Record<string, string> = {
    premium: "text-amber-600 dark:text-amber-400",
    nitido:  "text-blue-600 dark:text-blue-400",
  };
  const PROGRAM_ICONS: Record<string, string> = {
    premium: "fa-crown",
    nitido:  "fa-droplet",
  };

  return (
    <div className="px-4 py-3 border-b border-border">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-secondary flex items-center gap-1.5">
          <i className="fa-solid fa-gift text-amber-500" />
          Premio{rewards.length > 1 ? "s" : ""} disponible{rewards.length > 1 ? "s" : ""}
          <span className="ml-1 px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 text-[10px] font-bold">
            {rewards.length}
          </span>
        </p>
        <button
          onClick={() => { setShowSelector(!showSelector); setValidationError(null); }}
          className="touch-btn text-xs text-accent hover:underline"
        >
          {showSelector ? "Ocultar" : "Aplicar premio"}
        </button>
      </div>

      {/* Validation error */}
      {validationError && (
        <div className="mb-2 px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/20 text-xs text-destructive flex items-start gap-2">
          <i className="fa-solid fa-triangle-exclamation mt-0.5 shrink-0" />
          <span>{validationError}</span>
        </div>
      )}

      {/* Dropdown */}
      {showSelector && (
        <div className="space-y-2 animate-fade-in">
          <p className="text-[10px] text-muted-foreground px-1 mb-2">
            <i className="fa-solid fa-circle-info mr-1" />
            Selecciona el premio para agregarlo a la factura. El servicio se cobrará a precio normal con descuento 100% del Programa de Lealtad.
          </p>
          {rewards.map((reward) => {
            const isSelected = selectedReward?.id === reward.id;
            const slug = reward.loyalty_programs?.slug ?? "";
            const colorClass = PROGRAM_COLORS[slug] ?? "text-secondary";
            const icon = PROGRAM_ICONS[slug] ?? "fa-gift";
            const svcPattern = REWARD_SERVICE_MAP[reward.reward_slug];
            const resolved = resolveService(reward);

            return (
              <button
                key={reward.id}
                onClick={() => handleSelect(reward)}
                className={`w-full p-3 rounded-lg border-2 text-left transition-all ${
                  isSelected
                    ? "border-amber-500 bg-amber-50 dark:bg-amber-900/20"
                    : "border-border hover:border-amber-400/60"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2 flex-1 min-w-0">
                    <i className={`fa-solid ${icon} text-sm mt-0.5 ${colorClass}`} />
                    <div className="min-w-0">
                      <p className="font-semibold text-sm text-foreground truncate">
                        {reward.reward_name}
                      </p>
                      <p className="text-xs text-secondary mt-0.5">
                        {reward.loyalty_programs?.name} · ganado{" "}
                        {new Date(reward.earned_at).toLocaleDateString("es-NI")}
                      </p>
                      {/* Fixed service mapping */}
                      <div className="mt-1.5 flex items-center gap-1.5 text-[10px]">
                        <i className="fa-solid fa-lock text-muted-foreground" />
                        <span className="text-muted-foreground">Servicio fijo:</span>
                        <span className="font-bold text-foreground">{svcPattern ?? "—"}</span>
                        {resolved ? (
                          <span className="font-bold text-green-600 dark:text-green-400">
                            · C${resolved.price.toFixed(0)} <span className="line-through text-muted-foreground">→</span> C$0
                          </span>
                        ) : (
                          <span className="text-destructive">(servicio no encontrado)</span>
                        )}
                      </div>
                    </div>
                  </div>
                  {isSelected && (
                    <i className="fa-solid fa-circle-check text-amber-500 text-lg shrink-0" />
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Selected reward summary */}
      {selectedReward && !showSelector && (() => {
        const resolved = resolveService(selectedReward);
        return (
          <div className="mt-2 p-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-400/30">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-foreground truncate">
                  <i className="fa-solid fa-gift text-amber-500 mr-1" />
                  {selectedReward.reward_name}
                </p>
                <p className="text-xs text-amber-600 dark:text-amber-400 font-bold mt-0.5">
                  {resolved
                    ? `${resolved.service.name} · C$${resolved.price.toFixed(0)} → C$0.00 (Lealtad -100%)`
                    : "Premio en factura — Descuento 100%"}
                </p>
              </div>
              <button
                onClick={() => { onRewardSelect(null, null); setValidationError(null); }}
                className="touch-btn p-1 text-destructive hover:bg-destructive/10 rounded shrink-0"
              >
                <i className="fa-solid fa-times text-sm" />
              </button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
