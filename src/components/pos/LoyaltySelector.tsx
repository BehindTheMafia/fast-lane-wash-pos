import { useState } from "react";
import {
  useAvailableRewards,
  useSelectRewardOption,
  REWARD_SERVICE_MAP,
  REWARD_DISCOUNT_MAP,
  type LoyaltyReward,
  type LoyaltyTicketItem,
  type LoyaltyRewardOption,
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

// ── Resolves the service + price a reward maps to ────────────────────────────
function resolveService(
  reward: LoyaltyReward,
  services: AvailableService[] | undefined,
  servicePrices: any[] | undefined,
  selectedVehicleId: number,
): { service: AvailableService; price: number } | null {
  const pattern = REWARD_SERVICE_MAP[reward.reward_slug];
  if (!pattern || !services) return null;
  const service = services.find(s => s.name.toLowerCase().includes(pattern.toLowerCase()));
  if (!service) return null;
  let price = 0;
  if (servicePrices) {
    const priceEntry = selectedVehicleId
      ? servicePrices.find((p: any) => p.service_id === service.id && p.vehicle_type_id === selectedVehicleId)
      : null;
    const anyPrice = servicePrices.find((p: any) => p.service_id === service.id);
    price = Number(priceEntry?.price ?? anyPrice?.price ?? 0);
  }
  return { service, price };
}

// ── Choice group picker shown inline in POS ──────────────────────────────────
interface InlineChoicePickerProps {
  groupRewards: LoyaltyReward[];
  programOptions: LoyaltyRewardOption[];
  customerId: number;
  onDone: () => void;
}

function InlineChoicePicker({ groupRewards, programOptions, customerId, onDone }: InlineChoicePickerProps) {
  const selectOption = useSelectRewardOption();
  const [picked, setPicked] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleConfirm = async () => {
    if (!picked) return;
    setErr(null);
    const target = groupRewards.find(r => (r.option_slug ?? r.reward_slug) === picked);
    if (!target) { setErr("No se encontró el registro."); return; }
    try {
      const res = await selectOption.mutateAsync({ rewardId: target.id, optionSlug: picked, customerId });
      if (!res.success) { setErr(res.error ?? "Error al seleccionar."); return; }
      onDone();
    } catch (e: any) { setErr(e.message || "Error."); }
  };

  return (
    <div className="rounded-xl border-2 border-amber-400 bg-amber-50 dark:bg-amber-900/20 p-3 space-y-2 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-2 mb-1">
        <div className="w-7 h-7 rounded-full bg-amber-500 flex items-center justify-center shrink-0">
          <i className="fa-solid fa-star text-white text-xs" />
        </div>
        <div>
          <p className="text-xs font-black text-amber-900 dark:text-amber-200">
            🎁 ¡Premio de Lealtad! — Elige una opción
          </p>
          <p className="text-[10px] text-amber-700 dark:text-amber-400">
            Consulta al cliente cuál prefiere y selecciónala. La otra quedará invalidada.
          </p>
        </div>
      </div>

      {/* Options */}
      <div className="space-y-1.5">
        {programOptions.map((opt) => {
          const isChosen = picked === opt.reward_slug;
          const isFree = opt.discount_percent === 100;
          return (
            <button
              key={opt.reward_slug}
              onClick={() => { setPicked(opt.reward_slug); setConfirming(false); setErr(null); }}
              className={`w-full p-2.5 rounded-lg border-2 text-left transition-all ${
                isChosen
                  ? "border-amber-500 bg-white dark:bg-amber-900/40 shadow-sm"
                  : "border-border hover:border-amber-400/60 bg-background"
              }`}
            >
              <div className="flex items-center gap-2">
                <div
                  className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                    isChosen ? "bg-amber-500" : "bg-muted"
                  }`}
                >
                  {isChosen
                    ? <i className="fa-solid fa-check text-white text-[9px]" />
                    : <i className={`fa-solid ${isFree ? "fa-soap" : "fa-percent"} text-muted-foreground text-[9px]`} />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-foreground truncate">{opt.reward}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {isFree
                      ? `${opt.service_name_like} GRATIS (C$0)`
                      : `${opt.discount_percent}% desc. en ${opt.service_name_like}`}
                  </p>
                </div>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-bold shrink-0 ${
                    isFree
                      ? "bg-green-100 text-green-700"
                      : "bg-yellow-100 text-yellow-700"
                  }`}
                >
                  {isFree ? "GRATIS" : `-${opt.discount_percent}%`}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Error */}
      {err && (
        <p className="text-[10px] text-destructive flex items-center gap-1">
          <i className="fa-solid fa-triangle-exclamation" />{err}
        </p>
      )}

      {/* Warning + Confirm */}
      {picked && !confirming && (
        <div className="pt-1 space-y-1.5">
          <p className="text-[10px] text-amber-700 dark:text-amber-400 flex items-start gap-1.5">
            <i className="fa-solid fa-triangle-exclamation mt-0.5 shrink-0" />
            Al confirmar, la opción alternativa quedará <strong>permanentemente invalidada</strong>.
          </p>
          <button
            onClick={() => setConfirming(true)}
            className="w-full h-9 rounded-lg bg-amber-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-amber-600 transition-colors"
          >
            <i className="fa-solid fa-check" />
            Confirmar selección del cliente
          </button>
        </div>
      )}
      {confirming && (
        <button
          onClick={handleConfirm}
          disabled={selectOption.isPending}
          className="w-full h-9 rounded-lg bg-destructive text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-60"
        >
          {selectOption.isPending
            ? <i className="fa-solid fa-spinner fa-spin" />
            : <i className="fa-solid fa-lock" />}
          Sí, confirmar y bloquear la alternativa
        </button>
      )}
    </div>
  );
}

// ── Main LoyaltySelector ─────────────────────────────────────────────────────
export default function LoyaltySelector({
  customerId,
  selectedVehicleId,
  vehicleLabel,
  services,
  servicePrices,
  selectedReward,
  onRewardSelect,
}: Props) {
  const { data: allRewards = [], isLoading } = useAvailableRewards(customerId);
  const [showSelector, setShowSelector] = useState(false);
  const [choiceGroupKey, setChoiceGroupKey] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  if (!customerId || isLoading) return null;

  // ── Group rewards: choice groups vs fixed ──
  // Choice groups: rewards with option_group and no selected_option yet
  const choiceGroupsMap = new Map<string, LoyaltyReward[]>();
  const selectedChoices: LoyaltyReward[] = [];   // choice rewards already selected
  const fixedRewards: LoyaltyReward[] = [];

  for (const r of allRewards) {
    if (r.option_group) {
      if (r.selected_option) {
        selectedChoices.push(r);
      } else {
        const grp = choiceGroupsMap.get(r.option_group) ?? [];
        grp.push(r);
        choiceGroupsMap.set(r.option_group, grp);
      }
    } else {
      fixedRewards.push(r);
    }
  }

  // Visible rewards for the "apply" list: fixed + already-selected choices
  const applyableRewards = [...fixedRewards, ...selectedChoices];
  // Pending choice groups (need selection before apply)
  const pendingChoiceGroups = [...choiceGroupsMap.entries()];

  const totalCount = applyableRewards.length + pendingChoiceGroups.length;
  if (totalCount === 0) return null;

  const PROGRAM_COLORS: Record<string, string> = {
    premium: "text-amber-600 dark:text-amber-400",
    nitido:  "text-blue-600 dark:text-blue-400",
  };
  const PROGRAM_ICONS: Record<string, string> = {
    premium: "fa-crown",
    nitido:  "fa-droplet",
  };

  const handleSelect = (reward: LoyaltyReward) => {
    setValidationError(null);
    if (selectedReward?.id === reward.id) { onRewardSelect(null, null); return; }
    if (!selectedVehicleId) {
      setValidationError("Selecciona el tipo de vehículo antes de aplicar un premio.");
      return;
    }
    const resolved = resolveService(reward, services, servicePrices, selectedVehicleId);
    if (!resolved) {
      const pattern = REWARD_SERVICE_MAP[reward.reward_slug];
      setValidationError(`No se encontró el servicio "${pattern ?? "?"}" en el catálogo.`);
      return;
    }
    const discountPct = REWARD_DISCOUNT_MAP[reward.reward_slug] ?? 100;
    const item: LoyaltyTicketItem = {
      serviceId: resolved.service.id,
      serviceName: resolved.service.name,
      vehicleTypeId: selectedVehicleId || 0,
      vehicleLabel,
      price: resolved.price,
      discountPercent: discountPct,
      isLoyaltyRedemption: true,
      loyaltyRewardId: reward.id,
      loyaltyRewardName: reward.reward_name,
      loyaltyOriginalPrice: resolved.price,
    };
    onRewardSelect(reward, item);
    setShowSelector(false);
  };

  // Get program options from the loyalty_programs JSONB on the first group reward
  const getChoiceOptions = (groupRewards: LoyaltyReward[]): LoyaltyRewardOption[] => {
    const prog = groupRewards[0]?.loyalty_programs;
    if (!prog?.rewards) return [];
    for (const milestone of (prog.rewards as any[])) {
      if (milestone.options) {
        const opts = milestone.options as LoyaltyRewardOption[];
        // Check if this milestone matches any reward in the group
        if (opts.some((o: LoyaltyRewardOption) => groupRewards.some(r => r.reward_slug === o.reward_slug))) {
          return opts;
        }
      }
    }
    return [];
  };

  return (
    <div className="px-4 py-3 border-b border-border space-y-2">
      {/* ── Pending choice groups (must choose before applying) ── */}
      {pendingChoiceGroups.map(([groupKey, groupRewards]) => {
        const programOptions = getChoiceOptions(groupRewards);
        const isOpen = choiceGroupKey === groupKey;
        const progSlug = groupRewards[0]?.loyalty_programs?.slug ?? "";
        const progName = groupRewards[0]?.loyalty_programs?.name ?? "Lealtad";
        return (
          <div key={groupKey}>
            {!isOpen ? (
              <div className="flex items-center justify-between p-2.5 rounded-xl border-2 border-amber-400 bg-amber-50 dark:bg-amber-900/20">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-amber-500 flex items-center justify-center shrink-0">
                    <i className={`fa-solid ${PROGRAM_ICONS[progSlug] ?? "fa-gift"} text-white text-xs`} />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-amber-900 dark:text-amber-200">
                      ¡Premio Lealtad {progName}!
                    </p>
                    <p className="text-[10px] text-amber-700 dark:text-amber-400">
                      Cliente debe elegir su recompensa antes de canjear
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setChoiceGroupKey(groupKey)}
                  className="shrink-0 px-3 py-1.5 rounded-lg bg-amber-500 text-white text-xs font-bold hover:bg-amber-600 transition-colors flex items-center gap-1"
                >
                  <i className="fa-solid fa-star text-[10px]" />
                  Elegir
                </button>
              </div>
            ) : (
              <div>
                <InlineChoicePicker
                  groupRewards={groupRewards}
                  programOptions={programOptions}
                  customerId={customerId}
                  onDone={() => setChoiceGroupKey(null)}
                />
                <button
                  onClick={() => setChoiceGroupKey(null)}
                  className="w-full text-[10px] text-muted-foreground hover:text-foreground mt-1 py-1"
                >
                  Cancelar
                </button>
              </div>
            )}
          </div>
        );
      })}

      {/* ── Applyable rewards (fixed + selected choices) ── */}
      {applyableRewards.length > 0 && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-xs text-secondary flex items-center gap-1.5">
              <i className="fa-solid fa-gift text-amber-500" />
              Premio{applyableRewards.length > 1 ? "s" : ""} listo{applyableRewards.length > 1 ? "s" : ""} para canjear
              <span className="ml-1 px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 text-[10px] font-bold">
                {applyableRewards.length}
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
            <div className="px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/20 text-xs text-destructive flex items-start gap-2">
              <i className="fa-solid fa-triangle-exclamation mt-0.5 shrink-0" />
              <span>{validationError}</span>
            </div>
          )}

          {/* Reward list */}
          {showSelector && (
            <div className="space-y-2 animate-fade-in">
              <p className="text-[10px] text-muted-foreground px-1">
                <i className="fa-solid fa-circle-info mr-1" />
                El servicio se agrega al ticket con el descuento del programa de lealtad.
              </p>
              {applyableRewards.map((reward) => {
                const isSelected = selectedReward?.id === reward.id;
                const slug = reward.loyalty_programs?.slug ?? "";
                const colorClass = PROGRAM_COLORS[slug] ?? "text-secondary";
                const icon = PROGRAM_ICONS[slug] ?? "fa-gift";
                const svcPattern = REWARD_SERVICE_MAP[reward.reward_slug];
                const resolved = resolveService(reward, services, servicePrices, selectedVehicleId);
                const discPct = REWARD_DISCOUNT_MAP[reward.reward_slug] ?? 100;
                const netPrice = resolved ? resolved.price * (1 - discPct / 100) : 0;
                const isChoice = !!reward.option_group;

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
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="font-semibold text-sm text-foreground truncate">
                              {reward.reward_name}
                            </p>
                            {isChoice && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-bold">
                                ✓ Opción elegida
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-secondary mt-0.5">
                            {reward.loyalty_programs?.name} · {new Date(reward.earned_at).toLocaleDateString("es-NI")}
                          </p>
                          <div className="mt-1.5 flex items-center gap-1.5 text-[10px]">
                            <i className="fa-solid fa-lock text-muted-foreground" />
                            <span className="text-muted-foreground">Servicio:</span>
                            <span className="font-bold text-foreground">{svcPattern ?? "—"}</span>
                            {resolved ? (
                              <span className="font-bold text-green-600 dark:text-green-400">
                                · C${resolved.price.toFixed(0)} →{" "}
                                {discPct === 100 ? "C$0" : `C$${netPrice.toFixed(0)} (${discPct}% desc.)`}
                              </span>
                            ) : (
                              <span className="text-destructive">(no encontrado)</span>
                            )}
                          </div>
                        </div>
                      </div>
                      {isSelected && <i className="fa-solid fa-circle-check text-amber-500 text-lg shrink-0" />}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Selected reward summary */}
          {selectedReward && !showSelector && (() => {
            const resolved = resolveService(selectedReward, services, servicePrices, selectedVehicleId);
            const discPct = REWARD_DISCOUNT_MAP[selectedReward.reward_slug] ?? 100;
            const netPrice = resolved ? resolved.price * (1 - discPct / 100) : 0;
            return (
              <div className="p-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-400/30">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-foreground truncate">
                      <i className="fa-solid fa-gift text-amber-500 mr-1" />
                      {selectedReward.reward_name}
                    </p>
                    <p className="text-xs text-amber-600 dark:text-amber-400 font-bold mt-0.5">
                      {resolved
                        ? `${resolved.service.name} · C$${resolved.price.toFixed(0)} → C$${netPrice.toFixed(0)} (-${discPct}%)`
                        : `Premio en factura — Descuento ${discPct}%`}
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
        </>
      )}
    </div>
  );
}
