import type { LoyaltyProgress, LoyaltyProgram, LoyaltyReward } from "@/hooks/useLoyaltyV3";

interface Props {
  progress: LoyaltyProgress | undefined;
  program: LoyaltyProgram;
  rewards: LoyaltyReward[];
}

const PROGRAM_STYLES: Record<
  string,
  { gradient: string; iconClass: string; icon: string; badge: string }
> = {
  premium: {
    gradient: "from-primary to-accent",
    iconClass: "fa-crown",
    icon: "text-primary-foreground/80",
    badge: "bg-primary/10 text-primary border-primary/20",
  },
  nitido: {
    gradient: "from-accent to-secondary",
    iconClass: "fa-droplet",
    icon: "text-accent-foreground/80",
    badge: "bg-accent/10 text-accent border-accent/20",
  },
};

export default function LoyaltyProgramCard({ progress, program, rewards }: Props) {
  const style = PROGRAM_STYLES[program.slug] ?? PROGRAM_STYLES.premium;
  const cycleSize = program.cycle_size;
  const inCycle = progress?.washes_in_cycle ?? 0;
  const totalWashes = progress?.total_washes ?? 0;
  const cycleNum = progress?.cycle_number ?? 0;
  const pct = Math.round((inCycle / cycleSize) * 100);

  const availableRewards = rewards.filter(
    (r) => r.program_id === program.id && r.status === "available"
  );

  // Next reward threshold
  const sortedRewardDefs = [...program.rewards].sort((a, b) => a.at - b.at);
  const nextReward = sortedRewardDefs.find((r) => r.at > inCycle);
  const washesUntilNext = nextReward ? nextReward.at - inCycle : 0;

  return (
    <div className="rounded-2xl border border-border shadow-lg overflow-hidden bg-card">
      {/* Header gradient */}
      <div className={`bg-gradient-to-r ${style.gradient} p-5 relative overflow-hidden`}>
        <div className="absolute -top-4 -right-4 w-24 h-24 rounded-full bg-white/10" />
        <div className="absolute -bottom-6 -right-10 w-36 h-36 rounded-full bg-white/5" />
        <div className="relative z-10 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <i className={`fa-solid ${style.iconClass} text-white text-lg`} />
              <span className="text-white font-black text-xl tracking-tight">
                Programa {program.name}
              </span>
            </div>
            <p className="text-white/80 text-xs">
              {totalWashes} lavadas acumuladas · Ciclo #{cycleNum + 1}
            </p>
          </div>
          {availableRewards.length > 0 && (
            <div className="flex flex-col items-end gap-1">
              {availableRewards.map((r) => (
                <span
                  key={r.id}
                  className="text-xs px-2.5 py-1 rounded-full bg-white text-primary font-bold shadow animate-pulse"
                >
                  🎁 Premio disponible
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="p-5 space-y-4">
        {/* Progress bar */}
        <div>
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-semibold text-foreground">
              Lavadas en ciclo actual
            </span>
            <span className="text-sm font-bold text-foreground">
              {inCycle} / {cycleSize}
            </span>
          </div>
          <div className="w-full h-3 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full bg-gradient-to-r ${style.gradient} rounded-full transition-all duration-700`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-xs text-muted-foreground">{pct}% del ciclo</span>
            {nextReward && (
              <span className="text-xs text-muted-foreground">
                {washesUntilNext} lavadas para{" "}
                <span className="font-semibold text-foreground">{nextReward.reward}</span>
              </span>
            )}
          </div>
        </div>

        {/* Milestone dots */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {Array.from({ length: cycleSize }).map((_, i) => {
            const washPos = i + 1;
            const isDone = washPos <= inCycle;
            const isRewardPos = program.rewards.some((r) => r.at === washPos);
            return (
              <div
                key={i}
                className={`relative flex items-center justify-center rounded-full transition-all duration-300 ${
                  isRewardPos ? "w-9 h-9" : "w-7 h-7"
                } ${
                  isDone
                    ? `bg-gradient-to-br ${style.gradient} text-white shadow-md`
                    : "bg-muted border-2 border-border text-muted-foreground"
                }`}
                title={isRewardPos ? program.rewards.find((r) => r.at === washPos)?.reward : `Lavada ${washPos}`}
              >
                {isRewardPos ? (
                  <i className={`fa-solid fa-gift text-xs ${isDone ? "text-white" : "text-muted-foreground"}`} />
                ) : (
                  <span className="text-[10px] font-bold">{washPos}</span>
                )}
              </div>
            );
          })}
        </div>

        {/* Reward thresholds legend */}
        <div className="space-y-1.5">
          {program.rewards.map((r) => (
            <div
              key={r.reward_slug}
              className={`flex items-center justify-between px-3 py-2 rounded-xl border text-xs ${style.badge}`}
            >
              <span className="flex items-center gap-1.5">
                <i className="fa-solid fa-gift" />
                <span className="font-semibold">{r.at} lavadas</span>
                <span className="text-muted-foreground">→ {r.reward}</span>
              </span>
              {inCycle >= r.at ? (
                <span className="text-primary font-bold flex items-center gap-1">
                  <i className="fa-solid fa-circle-check text-primary" /> Alcanzado
                </span>
              ) : (
                <span className="opacity-70">{r.at - inCycle} restantes</span>
              )}
            </div>
          ))}
        </div>

        {/* Available rewards */}
        {availableRewards.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-bold text-foreground uppercase tracking-wider">
              Premios disponibles
            </p>
            {availableRewards.map((r) => (
              <div
                key={r.id}
                className="flex items-center gap-3 p-3 rounded-xl bg-primary/5 border border-primary/20"
              >
                <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center shrink-0">
                  <i className="fa-solid fa-gift text-primary-foreground text-sm" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm text-primary truncate">
                    {r.reward_name}
                  </p>
                  <p className="text-xs text-primary/70">
                    Ganado el {new Date(r.earned_at).toLocaleDateString("es-NI")}
                  </p>
                </div>
                <span className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary font-bold">
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
