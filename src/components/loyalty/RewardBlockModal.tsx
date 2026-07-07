import type { LoyaltyReward } from "@/hooks/useLoyaltyV3";

interface Props {
  reward: LoyaltyReward;
  serviceName: string;
  isAdmin: boolean;
  isOwner: boolean;
  onRedeem: () => void;
  onCancel: () => void;
  onAdminOverride: () => void;
}

export default function RewardBlockModal({
  reward,
  serviceName,
  isAdmin,
  isOwner,
  onRedeem,
  onCancel,
  onAdminOverride,
}: Props) {
  const canOverride = isAdmin || isOwner;

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div
        className="modal-content animate-scale-in max-w-md w-full"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Icon */}
        <div className="flex flex-col items-center text-center mb-5">
          <div className="w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mb-3">
            <i className="fa-solid fa-gift text-3xl text-amber-500" />
          </div>
          <h2 className="text-xl font-black text-foreground">¡Premio disponible!</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Este cliente ya tiene un premio que incluye este servicio
          </p>
        </div>

        {/* Reward info */}
        <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-300/40 p-4 mb-5 space-y-2">
          <div className="flex items-center gap-2">
            <i className="fa-solid fa-trophy text-amber-500" />
            <span className="font-bold text-sm text-foreground">Premio activo:</span>
          </div>
          <p className="text-base font-black text-amber-700 dark:text-amber-300">
            {reward.reward_name}
          </p>
          <p className="text-xs text-muted-foreground">
            Servicio que se intenta cobrar:{" "}
            <span className="font-semibold text-foreground">{serviceName}</span>
          </p>
          <p className="text-xs text-muted-foreground">
            Ganado el{" "}
            {new Date(reward.earned_at).toLocaleDateString("es-NI", {
              day: "2-digit",
              month: "long",
              year: "numeric",
            })}
          </p>
        </div>

        {/* Warning */}
        <div className="rounded-xl bg-destructive/10 border border-destructive/20 p-3 mb-5">
          <p className="text-xs text-destructive font-semibold flex items-start gap-2">
            <i className="fa-solid fa-triangle-exclamation mt-0.5" />
            No se puede cobrar un servicio que el cliente ya tiene como premio gratuito.
            Canjea el premio o cancela la operación.
          </p>
        </div>

        {/* Actions */}
        <div className="space-y-2">
          <button
            id="reward-block-redeem-btn"
            onClick={onRedeem}
            className="btn-cobrar w-full h-14 text-base font-bold flex items-center justify-center gap-2"
          >
            <i className="fa-solid fa-gift" />
            Canjear premio ahora
          </button>

          <button
            id="reward-block-cancel-btn"
            onClick={onCancel}
            className="touch-btn w-full h-12 rounded-xl border border-border text-foreground font-semibold hover:bg-muted/50 transition-colors"
          >
            Cancelar
          </button>

          {canOverride && (
            <button
              id="reward-block-override-btn"
              onClick={onAdminOverride}
              className="touch-btn w-full h-12 rounded-xl border border-destructive/40 text-destructive font-semibold hover:bg-destructive/5 transition-colors text-sm flex items-center justify-center gap-2"
            >
              <i className="fa-solid fa-unlock" />
              Continuar sin canjear (Admin)
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
