import { useState } from "react";
import { useSelectRewardOption } from "@/hooks/useLoyaltyV3";
import type { LoyaltyReward, LoyaltyRewardOption } from "@/hooks/useLoyaltyV3";
import { getLoyaltyTheme } from "./loyaltyTheme";

interface Props {
  reward: LoyaltyReward;   // Any reward from the group (to get option_group)
  allGroupRewards: LoyaltyReward[]; // Both rewards in the group
  programOptions: LoyaltyRewardOption[]; // From loyalty_programs.rewards JSONB
  customerId: number;
  programSlug: string;
  onClose: () => void;
  onSuccess: () => void;
}

export default function RewardOptionModal({
  reward,
  allGroupRewards,
  programOptions,
  customerId,
  programSlug,
  onClose,
  onSuccess,
}: Props) {
  const theme = getLoyaltyTheme(programSlug);
  const selectOption = useSelectRewardOption();
  const [selected, setSelected] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    if (!selected) return;
    setError(null);
    // Find the reward record that matches the selected option_slug
    const targetReward = allGroupRewards.find(r => r.option_slug === selected || r.reward_slug === selected);
    if (!targetReward) {
      setError("No se encontró el registro de recompensa para esta opción.");
      return;
    }
    try {
      const res = await selectOption.mutateAsync({
        rewardId: targetReward.id,
        optionSlug: selected,
        customerId,
      });
      if (!res.success) {
        setError(res.error ?? "Error al seleccionar opción.");
        return;
      }
      onSuccess();
      onClose();
    } catch (e: any) {
      setError(e.message || "Error al seleccionar opción.");
    }
  };

  const getOptionIcon = (discountPercent: number) =>
    discountPercent === 100 ? "fa-soap" : "fa-percent";

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content animate-scale-in max-w-md w-full"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex flex-col items-center text-center mb-5">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center mb-3"
            style={{ backgroundColor: theme.bg, border: `2px solid ${theme.badgeBorder}` }}
          >
            <i className="fa-solid fa-gift text-3xl" style={{ color: theme.primary }} />
          </div>
          <h2 className="text-xl font-black text-foreground">¡Elige tu recompensa!</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Selecciona <strong>una</strong> opción. La otra quedará invalidada.
          </p>
        </div>

        {/* Options */}
        <div className="space-y-3 mb-5">
          {programOptions.map((opt) => {
            const isSelected = selected === opt.reward_slug;
            const isFree = opt.discount_percent === 100;
            return (
              <button
                key={opt.reward_slug}
                onClick={() => { setSelected(opt.reward_slug); setConfirming(false); }}
                className={`w-full p-4 rounded-2xl border-2 text-left transition-all duration-200 ${
                  isSelected
                    ? "shadow-md scale-[1.01]"
                    : "border-border hover:border-opacity-60"
                }`}
                style={isSelected ? {
                  borderColor: theme.primary,
                  backgroundColor: theme.bg,
                } : {}}
              >
                <div className="flex items-start gap-3">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                    style={{ backgroundColor: isSelected ? theme.primary : "#F3EFE6" }}
                  >
                    <i
                      className={`fa-solid ${getOptionIcon(opt.discount_percent)} text-sm`}
                      style={{ color: isSelected ? "#FFFFFF" : theme.accent }}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-black text-sm" style={{ color: "#002C47" }}>
                      {opt.reward}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: "#456A83" }}>
                      {isFree
                        ? `Servicio ${opt.service_name_like} completamente GRATIS`
                        : `${opt.discount_percent}% de descuento en servicio ${opt.service_name_like}`}
                    </p>
                    <span
                      className="inline-block mt-1.5 text-[10px] px-2 py-0.5 rounded-full font-bold"
                      style={{
                        backgroundColor: isFree ? "#D1FAE5" : "#FEF3C7",
                        color: isFree ? "#065F46" : "#92400E",
                      }}
                    >
                      {isFree ? "100% GRATIS" : `${opt.discount_percent}% DESCUENTO`}
                    </span>
                  </div>
                  {isSelected && (
                    <i className="fa-solid fa-circle-check text-xl shrink-0" style={{ color: theme.primary }} />
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 px-3 py-2 rounded-xl bg-destructive/10 border border-destructive/20 text-xs text-destructive flex items-start gap-2">
            <i className="fa-solid fa-triangle-exclamation mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Warning before confirm */}
        {selected && !confirming && (
          <div className="mb-4 px-3 py-2.5 rounded-xl border text-xs flex items-start gap-2" style={{ backgroundColor: "#FFF9E6", borderColor: "#F59E0B", color: "#92400E" }}>
            <i className="fa-solid fa-triangle-exclamation mt-0.5 shrink-0" />
            <span>
              <strong>Atención:</strong> al confirmar, la opción alternativa quedará <strong>permanentemente invalidada</strong>. Esta acción no se puede deshacer.
            </span>
          </div>
        )}

        {/* Actions */}
        <div className="space-y-2">
          {selected && !confirming && (
            <button
              onClick={() => setConfirming(true)}
              className="w-full h-13 rounded-xl font-bold text-base flex items-center justify-center gap-2 transition-all"
              style={{ backgroundColor: theme.primary, color: "#FFFFFF" }}
            >
              <i className="fa-solid fa-check" />
              Confirmar selección
            </button>
          )}
          {confirming && (
            <button
              onClick={handleConfirm}
              disabled={selectOption.isPending}
              className="w-full h-13 rounded-xl font-bold text-base flex items-center justify-center gap-2 transition-all disabled:opacity-60"
              style={{ backgroundColor: "#DC2626", color: "#FFFFFF" }}
            >
              {selectOption.isPending ? (
                <i className="fa-solid fa-spinner fa-spin" />
              ) : (
                <i className="fa-solid fa-lock" />
              )}
              Sí, confirmar y bloquear alternativa
            </button>
          )}
          <button
            onClick={onClose}
            disabled={selectOption.isPending}
            className="touch-btn w-full h-11 rounded-xl border border-border text-foreground font-semibold hover:bg-muted/50 transition-colors"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
