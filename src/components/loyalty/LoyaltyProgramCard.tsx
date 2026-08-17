import type { LoyaltyProgress, LoyaltyProgram, LoyaltyReward } from "@/hooks/useLoyaltyV3";
import { getLoyaltyTheme } from "./loyaltyTheme";

interface Props {
  progress: LoyaltyProgress | undefined;
  program: LoyaltyProgram;
  rewards: LoyaltyReward[];
}

export default function LoyaltyProgramCard({ progress, program, rewards }: Props) {
  const theme = getLoyaltyTheme(program.slug);
  const cycleSize = program.cycle_size;
  const inCycle = progress?.washes_in_cycle ?? 0;
  const totalWashes = progress?.total_washes ?? 0;
  const cycleNum = progress?.cycle_number ?? 0;
  const pct = Math.round((inCycle / cycleSize) * 100);

  const availableRewards = rewards.filter(
    (r) => r.program_id === program.id && r.status === "available"
  );

  // Next reward threshold calculation
  const sortedRewardDefs = [...program.rewards].sort((a, b) => a.at - b.at);
  const nextReward = sortedRewardDefs.find((r) => r.at > inCycle);
  const washesUntilNext = nextReward ? nextReward.at - inCycle : 0;

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
              {totalWashes} lavadas acumuladas · Ciclo #{cycleNum + 1}
            </p>
          </div>

          {/* Available rewards badge */}
          {availableRewards.length > 0 && (
            <div className="flex flex-col items-end gap-1">
              {availableRewards.map((r) => (
                <span
                  key={r.id}
                  className="text-xs px-3 py-1 rounded-full font-bold shadow-md flex items-center gap-1.5 animate-pulse"
                  style={{
                    backgroundColor: "#FFFFFF",
                    color: theme.primary,
                  }}
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
              {inCycle} / {cycleSize}
            </span>
          </div>

          {/* Track and fill */}
          <div className="w-full h-3.5 rounded-full overflow-hidden" style={{ backgroundColor: "#F3EFE6" }}>
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${pct}%`,
                background: theme.progressGradient,
              }}
            />
          </div>

          <div className="flex justify-between mt-1.5 text-xs">
            <span className="font-medium" style={{ color: "#456A83" }}>
              {pct}% del ciclo completado
            </span>
            {nextReward && (
              <span className="font-medium" style={{ color: "#456A83" }}>
                {washesUntilNext} {washesUntilNext === 1 ? "lavada" : "lavadas"} para{" "}
                <span className="font-bold" style={{ color: theme.primary }}>
                  {nextReward.reward}
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
              const isDone = washPos <= inCycle;
              const isRewardPos = program.rewards.some((r) => r.at === washPos);

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
                      ? `2px solid ${isDone ? theme.accent : theme.accent}`
                      : `1.5px solid ${isDone ? theme.primary : "#E8DECC"}`,
                    boxShadow: isRewardPos && isDone ? `0 0 10px ${theme.accent}60` : "none",
                  }}
                  title={
                    isRewardPos
                      ? program.rewards.find((r) => r.at === washPos)?.reward
                      : `Lavada ${washPos}`
                  }
                >
                  {isRewardPos ? (
                    <i
                      className="fa-solid fa-gift text-xs"
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
          {program.rewards.map((r) => {
            const isReached = inCycle >= r.at;
            return (
              <div
                key={r.reward_slug}
                className="flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs transition-colors"
                style={{
                  backgroundColor: isReached ? theme.bg : "#FEF2DD",
                  border: `1px solid ${isReached ? theme.badgeBorder : "#E8DECC"}`,
                }}
              >
                <span className="flex items-center gap-2 font-medium" style={{ color: "#002C47" }}>
                  <i className="fa-solid fa-gift" style={{ color: theme.accent }} />
                  <span className="font-bold">{r.at} lavadas</span>
                  <span style={{ color: "#456A83" }}>→ {r.reward}</span>
                </span>

                {isReached ? (
                  <span className="font-bold flex items-center gap-1.5" style={{ color: theme.primary }}>
                    <i className="fa-solid fa-circle-check" style={{ color: theme.accent }} />
                    Alcanzado
                  </span>
                ) : (
                  <span className="font-medium" style={{ color: "#456A83" }}>
                    {r.at - inCycle} restantes
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
            {availableRewards.map((r) => (
              <div
                key={r.id}
                className="flex items-center gap-3 p-3.5 rounded-xl shadow-xs"
                style={{
                  backgroundColor: theme.bg,
                  border: `1px solid ${theme.badgeBorder}`,
                }}
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
                  style={{
                    backgroundColor: theme.badgeBg,
                    color: theme.primary,
                    border: `1px solid ${theme.badgeBorder}`,
                  }}
                >
                  Disponible
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
