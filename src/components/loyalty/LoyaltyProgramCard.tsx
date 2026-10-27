import { useState } from "react";
import type { LoyaltyProgress, LoyaltyProgram, LoyaltyReward, LoyaltyRewardOption } from "@/hooks/useLoyaltyV3";
import { getLoyaltyTheme } from "./loyaltyTheme";
import RewardOptionModal from "./RewardOptionModal";

interface Props {
  progress: LoyaltyProgress | undefined;
  program: LoyaltyProgram;
  rewards: LoyaltyReward[];
  customerId?: number;
}

export default function LoyaltyProgramCard({ progress, program, rewards, customerId }: Props) {
  const theme = getLoyaltyTheme(program.slug);
  const cycleSize = program.cycle_size;
  const inCycle = progress?.washes_in_cycle ?? 0;
  const totalWashes = progress?.total_washes ?? 0;
  const cycleNum = progress?.cycle_number ?? 0;

  const [choiceModal, setChoiceModal] = useState<{
    reward: LoyaltyReward;
    allGroupRewards: LoyaltyReward[];
    programOptions: LoyaltyRewardOption[];
  } | null>(null);

  const availableRewards = rewards.filter(
    (r) => r.program_id === program.id && r.status === "available"
  );

  // Helper to find reward status for a given milestone
  const getMilestoneRewardStatus = (m: (typeof program.rewards)[0]) => {
    const matchingReward = rewards.find(r => r.program_id === program.id &&
      r.option_group === `${program.slug}_${m.at}w_c${cycleNum}` &&
      r.status !== "expired");
    const isReached = inCycle >= m.at;
    const isRedeemed = isReached && matchingReward?.status === "redeemed";
    const isAvailable = isReached && matchingReward?.status === "available";
    return { matchingReward, isRedeemed, isAvailable, isReached };
  };

  const effectiveInCycle = inCycle;
  const effectiveTotalWashes = totalWashes;
  const pct = Math.min(100, Math.round((inCycle / cycleSize) * 100));

  // Group available rewards by option_group
  // For each choice group: show ONE card with "Elige" button
  // Fixed rewards (no option_group): show normally
  const choiceGroups = new Map<string, LoyaltyReward[]>();
  const fixedAvailable: LoyaltyReward[] = [];

  for (const r of availableRewards) {
    if (r.option_group) {
      const grp = choiceGroups.get(r.option_group) ?? [];
      grp.push(r);
      choiceGroups.set(r.option_group, grp);
    } else {
      fixedAvailable.push(r);
    }
  }

  // Choice groups where selection is already made (only one remains available = selected)
  const selectedChoiceRewards = availableRewards.filter(r => r.option_group && r.selected_option);

  // Next reward threshold calculation: target next milestone that hasn't been redeemed
  const sortedMilestones = [...program.rewards].sort((a, b) => a.at - b.at);
  const nextMilestone = sortedMilestones.find((m) => {
    const { isRedeemed } = getMilestoneRewardStatus(m);
    return !isRedeemed && m.at > effectiveInCycle;
  });

  const nextRewardLabel = nextMilestone?.options?.[0]?.reward ?? nextMilestone?.reward ?? null;
  const washesUntilNext = nextMilestone ? Math.max(1, nextMilestone.at - effectiveInCycle) : 0;

  const handleChoiceClick = (groupRewards: LoyaltyReward[]) => {
    // Find milestone JSONB options for this group
    const firstReward = groupRewards[0];
    // Identify milestone by matching any option slug
    const milestone = program.rewards.find(m =>
      m.options?.some(opt => opt.reward_slug === firstReward.reward_slug || opt.reward_slug === firstReward.option_slug)
    );
    if (!milestone?.options) return;
    setChoiceModal({
      reward: firstReward,
      allGroupRewards: groupRewards,
      programOptions: milestone.options,
    });
  };

  return (
    <div
      className="rounded-2xl border bg-white shadow-md overflow-hidden transition-all duration-300 hover:shadow-lg"
      style={{ borderColor: "#E8DECC" }}
    >
      {/* ── Header with program gradient ── */}
      <div
        className="p-5 relative overflow-hidden text-white"
        style={{ background: theme.gradient }}
      >
        <div className="absolute -top-4 -right-4 w-24 h-24 rounded-full bg-white/10" />
        <div className="absolute -bottom-6 -right-10 w-36 h-36 rounded-full bg-white/5" />

        <div className="relative z-10 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center bg-white/15 backdrop-blur-xs"
                style={{ border: "1px solid rgba(255,255,255,0.2)" }}
              >
                <i className={`fa-solid ${theme.headerIcon} text-white text-sm`} />
              </div>
              <span className="text-white font-black text-xl tracking-tight font-montserrat">
                Programa {program.name}
              </span>
            </div>
            <p className="text-white/80 text-xs font-medium pl-0.5">
              {effectiveTotalWashes} lavadas acumuladas · Ciclo #{cycleNum + 1}
            </p>
          </div>

          {/* Available rewards badge */}
          {availableRewards.length > 0 && (
            <div className="flex flex-col items-end gap-1">
              {/* Choice groups not yet selected */}
              {[...choiceGroups.entries()].map(([grp]) => {
                const rewards = choiceGroups.get(grp)!;
                const alreadySelected = rewards.some(r => r.selected_option);
                if (alreadySelected) return null;
                return (
                  <span
                    key={grp}
                    className="text-xs px-3 py-1 rounded-full font-bold shadow-md flex items-center gap-1.5 animate-pulse"
                    style={{ backgroundColor: "#FFFFFF", color: theme.primary }}
                  >
                    <i className="fa-solid fa-star text-xs" style={{ color: theme.accent }} />
                    ¡Elige tu premio!
                  </span>
                );
              })}
              {/* Fixed or selected rewards */}
              {[...fixedAvailable, ...selectedChoiceRewards].map((r) => (
                <span
                  key={r.id}
                  className="text-xs px-3 py-1 rounded-full font-bold shadow-md flex items-center gap-1.5 animate-pulse"
                  style={{ backgroundColor: "#FFFFFF", color: theme.primary }}
                >
                  <i className="fa-solid fa-gift text-xs" style={{ color: theme.accent }} />
                  Premio disponible
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Body ── */}
      <div className="p-5 space-y-5" style={{ backgroundColor: "#FFFFFF" }}>
        {/* Progress bar section */}
        <div>
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-bold" style={{ color: "#002C47" }}>
              Lavadas en ciclo actual
            </span>
            <span className="text-sm font-black font-montserrat" style={{ color: theme.primary }}>
              {effectiveInCycle} / {cycleSize}
            </span>
          </div>

          <div className="w-full h-3.5 rounded-full overflow-hidden" style={{ backgroundColor: "#F3EFE6" }}>
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${pct}%`, background: theme.progressGradient }}
            />
          </div>

          <div className="flex justify-between mt-1.5 text-xs">
            <span className="font-medium" style={{ color: "#456A83" }}>
              {pct}% del ciclo completado
            </span>
            {nextMilestone && (
              <span className="font-medium" style={{ color: "#456A83" }}>
                {washesUntilNext} {washesUntilNext === 1 ? "lavada" : "lavadas"} para{" "}
                <span className="font-bold" style={{ color: theme.primary }}>
                  {nextRewardLabel}
                </span>
              </span>
            )}
          </div>
        </div>

        {/* ── Milestone dots ── */}
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: "#456A83" }}>
            Progreso del ciclo
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            {Array.from({ length: cycleSize }).map((_, i) => {
              const washPos = i + 1;
              const milestoneForPos = program.rewards.find((r) => r.at === washPos);
              const milestoneStatus = milestoneForPos ? getMilestoneRewardStatus(milestoneForPos) : null;
              const isDone = washPos <= effectiveInCycle || milestoneStatus?.isReached || milestoneStatus?.isRedeemed;
              const isRewardPos = !!milestoneForPos;
              const isRedeemed = milestoneStatus?.isRedeemed;

              return (
                <div
                  key={i}
                  className={`relative flex items-center justify-center rounded-full transition-all duration-300 ${
                    isRewardPos ? "w-9 h-9" : "w-7.5 h-7.5"
                  }`}
                  style={{
                    backgroundColor: isDone ? theme.dotActiveBg : "#FEF2DD",
                    color: isDone ? "#FFFFFF" : "#002C47",
                    border: isRewardPos
                      ? `2px solid ${theme.accent}`
                      : `1.5px solid ${isDone ? theme.primary : "#E8DECC"}`,
                    boxShadow: isRewardPos && isDone ? `0 0 10px ${theme.accent}60` : "none",
                  }}
                  title={
                    isRewardPos
                      ? milestoneForPos?.options?.[0]?.reward ?? milestoneForPos?.reward
                      : `Lavada ${washPos}`
                  }
                >
                  {isRewardPos ? (
                    <i
                      className={`fa-solid ${isRedeemed ? "fa-check" : "fa-gift"} text-xs`}
                      style={{ color: isDone ? "#FFFFFF" : theme.accent }}
                    />
                  ) : (
                    <span className="text-[11px] font-bold">{washPos}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Reward thresholds legend ── */}
        <div className="space-y-2 pt-1 border-t" style={{ borderColor: "#E8DECC" }}>
          <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "#456A83" }}>
            Recompensas del programa
          </p>
          {program.rewards.map((m) => {
            const { isRedeemed, isAvailable, isReached } = getMilestoneRewardStatus(m);
            const isChoice = m.type === "choice";
            const label = isChoice
              ? `${m.at} lavadas → Elige: ${m.options?.map(o => o.reward).join(" ó ")}`
              : `${m.at} lavadas → ${m.options?.[0]?.reward ?? m.reward}`;
            return (
              <div
                key={m.at}
                className="flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs transition-colors"
                style={{
                  backgroundColor: isReached ? theme.bg : "#FEF2DD",
                  border: `1px solid ${isReached ? theme.badgeBorder : "#E8DECC"}`,
                }}
              >
                <span className="flex items-center gap-2 font-medium" style={{ color: "#002C47" }}>
                  <i className="fa-solid fa-gift" style={{ color: theme.accent }} />
                  <span>{label}</span>
                </span>

                {isRedeemed ? (
                  <span className="font-bold flex items-center gap-1.5" style={{ color: theme.primary }}>
                    <i className="fa-solid fa-receipt text-xs" style={{ color: theme.accent }} />
                    Canjeado
                  </span>
                ) : isAvailable ? (
                  <span className="font-bold flex items-center gap-1.5" style={{ color: "#7F0000" }}>
                    <i className="fa-solid fa-star text-xs" style={{ color: "#C89B5A" }} />
                    ¡Premio Disponible!
                  </span>
                ) : isReached ? (
                  <span className="font-bold flex items-center gap-1.5" style={{ color: theme.primary }}>
                    <i className="fa-solid fa-circle-check" style={{ color: theme.accent }} />
                    Alcanzado
                  </span>
                ) : (
                  <span className="font-medium" style={{ color: "#456A83" }}>
                    {Math.max(1, m.at - effectiveInCycle)} restantes
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* ── Active available rewards cards ── */}
        {availableRewards.length > 0 && (
          <div className="space-y-2 pt-1">
            <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "#002C47" }}>
              Beneficios listos para canjear
            </p>

            {/* Choice groups — not yet selected */}
            {[...choiceGroups.entries()].map(([grp, grpRewards]) => {
              const alreadySelected = grpRewards.some(r => r.selected_option);
              if (alreadySelected) return null;
              return (
                <div
                  key={grp}
                  className="flex items-center gap-3 p-3.5 rounded-xl shadow-xs"
                  style={{ backgroundColor: theme.bg, border: `1px solid ${theme.badgeBorder}` }}
                >
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 shadow-xs"
                    style={{ backgroundColor: theme.primary }}
                  >
                    <i className="fa-solid fa-star text-white text-sm" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm" style={{ color: "#002C47" }}>
                      🎁 Premio de 5 lavadas
                    </p>
                    <p className="text-xs" style={{ color: "#456A83" }}>
                      Debes elegir una de las 2 opciones disponibles
                    </p>
                  </div>
                  {customerId && (
                    <button
                      onClick={() => handleChoiceClick(grpRewards)}
                      className="shrink-0 px-3 py-2 rounded-lg text-xs font-bold transition-all hover:opacity-80 active:scale-95"
                      style={{ backgroundColor: theme.primary, color: "#FFFFFF" }}
                    >
                      Elegir
                    </button>
                  )}
                </div>
              );
            })}

            {/* Fixed rewards */}
            {fixedAvailable.map((r) => (
              <div
                key={r.id}
                className="flex items-center gap-3 p-3.5 rounded-xl shadow-xs"
                style={{ backgroundColor: theme.bg, border: `1px solid ${theme.badgeBorder}` }}
              >
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 shadow-xs"
                  style={{ backgroundColor: theme.primary }}
                >
                  <i className="fa-solid fa-gift text-white text-sm" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm truncate" style={{ color: "#002C47" }}>
                    {r.reward_name}
                  </p>
                  <p className="text-xs" style={{ color: "#456A83" }}>
                    Ganado el {new Date(r.earned_at).toLocaleDateString("es-NI")}
                  </p>
                </div>
                <span
                  className="text-xs px-2.5 py-1 rounded-full font-bold"
                  style={{ backgroundColor: theme.badgeBg, color: theme.primary, border: `1px solid ${theme.badgeBorder}` }}
                >
                  Disponible
                </span>
              </div>
            ))}

            {/* Selected choice rewards */}
            {selectedChoiceRewards.map((r) => (
              <div
                key={r.id}
                className="flex items-center gap-3 p-3.5 rounded-xl shadow-xs"
                style={{ backgroundColor: theme.bg, border: `1px solid ${theme.badgeBorder}` }}
              >
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 shadow-xs"
                  style={{ backgroundColor: theme.primary }}
                >
                  <i className="fa-solid fa-gift text-white text-sm" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm truncate" style={{ color: "#002C47" }}>
                    {r.reward_name}
                  </p>
                  <p className="text-xs" style={{ color: "#456A83" }}>
                    Opción seleccionada · {new Date(r.earned_at).toLocaleDateString("es-NI")}
                  </p>
                </div>
                <span
                  className="text-xs px-2.5 py-1 rounded-full font-bold"
                  style={{ backgroundColor: "#D1FAE5", color: "#065F46", border: "1px solid #A7F3D0" }}
                >
                  ✓ Elegido
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Choice Modal */}
      {choiceModal && customerId && (
        <RewardOptionModal
          reward={choiceModal.reward}
          allGroupRewards={choiceModal.allGroupRewards}
          programOptions={choiceModal.programOptions}
          customerId={customerId}
          programSlug={program.slug}
          onClose={() => setChoiceModal(null)}
          onSuccess={() => setChoiceModal(null)}
        />
      )}
    </div>
  );
}
