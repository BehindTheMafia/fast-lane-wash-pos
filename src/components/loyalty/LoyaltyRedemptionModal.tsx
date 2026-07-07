import { useState } from "react";
import { useRedeemLoyaltyReward } from "@/hooks/useLoyaltyV3";
import type { LoyaltyReward } from "@/hooks/useLoyaltyV3";
import { useAuth } from "@/hooks/useAuth";

interface Props {
  reward: LoyaltyReward;
  customerId: number;
  customerName: string;
  ticketId?: number | null;
  onClose: () => void;
  onSuccess: (rewardName: string) => void;
}

export default function LoyaltyRedemptionModal({
  reward,
  customerId,
  customerName,
  ticketId,
  onClose,
  onSuccess,
}: Props) {
  const { user, isAdmin, isOwner } = useAuth();
  const [notes, setNotes] = useState("");
  const [confirming, setConfirming] = useState(false);
  const redeemMutation = useRedeemLoyaltyReward();

  const handleRedeem = async () => {
    setConfirming(true);
    try {
      const result = await redeemMutation.mutateAsync({
        rewardId: reward.id,
        customerId,
        ticketId: ticketId ?? null,
        userId: user?.id,
        notes: notes.trim() || undefined,
        adminOverride: false,
      });
      if (result.success) {
        onSuccess(reward.reward_name);
        onClose();
      } else {
        alert("Error al canjear: " + (result.error ?? "desconocido"));
      }
    } catch (err: any) {
      alert("Error: " + err.message);
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content animate-scale-in max-w-md w-full"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center">
              <i className="fa-solid fa-gift text-white" />
            </div>
            <div>
              <h2 className="text-lg font-black text-foreground">Canjear Premio</h2>
              <p className="text-xs text-muted-foreground">Confirmar canje de recompensa</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="touch-btn p-2 text-muted-foreground hover:text-foreground"
          >
            <i className="fa-solid fa-xmark text-xl" />
          </button>
        </div>

        {/* Reward summary */}
        <div className="rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-300/40 p-4 mb-4 space-y-2">
          <div className="flex items-start gap-3">
            <i className="fa-solid fa-trophy text-green-500 text-lg mt-0.5" />
            <div>
              <p className="font-black text-base text-green-800 dark:text-green-300">
                {reward.reward_name}
              </p>
              <p className="text-xs text-muted-foreground">
                Programa:{" "}
                <span className="font-semibold">
                  {reward.loyalty_programs?.name ?? `ID ${reward.program_id}`}
                </span>
              </p>
            </div>
          </div>
        </div>

        {/* Customer + audit info */}
        <div className="rounded-xl bg-muted/50 border border-border p-4 mb-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Cliente</span>
            <span className="font-semibold">{customerName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Fecha</span>
            <span className="font-semibold">
              {new Date().toLocaleDateString("es-NI", {
                day: "2-digit",
                month: "long",
                year: "numeric",
              })}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Hora</span>
            <span className="font-semibold">
              {new Date().toLocaleTimeString("es-NI", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>
          {ticketId && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Factura</span>
              <span className="font-semibold">#{ticketId}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted-foreground">Usuario</span>
            <span className="font-semibold capitalize">
              {(isAdmin && "Admin") || (isOwner && "Owner") || "Cajero"}
            </span>
          </div>
        </div>

        {/* Notes */}
        <div className="mb-5">
          <label className="text-xs font-semibold text-foreground block mb-1">
            Observaciones (opcional)
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Ej: Cliente presentó comprobante, servicio aplicado en turno tarde..."
            rows={3}
            className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="touch-btn flex-1 h-12 rounded-xl border border-border font-semibold text-foreground hover:bg-muted/50"
          >
            Cancelar
          </button>
          <button
            id="loyalty-confirm-redeem-btn"
            onClick={handleRedeem}
            disabled={confirming || redeemMutation.isPending}
            className="btn-cobrar flex-1 h-12 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {(confirming || redeemMutation.isPending) ? (
              <i className="fa-solid fa-spinner fa-spin" />
            ) : (
              <i className="fa-solid fa-check" />
            )}
            Confirmar Canje
          </button>
        </div>
      </div>
    </div>
  );
}
