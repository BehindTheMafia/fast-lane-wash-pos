import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCustomerLoyalty, useLoyaltyPrograms } from "@/hooks/useLoyaltyV3";

interface Customer {
  id: number;
  name: string;
  phone: string;
  plate: string;
  email: string;
  is_general: boolean;
  created_at: string;
  loyalty_visits?: number;
  loyalty_last_visit?: string;
  loyalty_free_washes_earned?: number;
  loyalty_free_washes_used?: number;
}

interface LoyaltyVisit {
  id: string;
  customer_id: number;
  ticket_id: number | null;
  service_id: number;
  visit_number: number;
  earned_free_wash: boolean;
  created_at: string;
  services?: { name: string } | null;
}

interface Props {
  customer: Customer;
  onClose: () => void;
  onUpdate: () => void;
}

type ModeTab = "v3_current" | "legacy_previous";

export default function LoyaltyDetailModal({ customer, onClose, onUpdate }: Props) {
  // Local reactive copy of customer state
  const [localCustomer, setLocalCustomer] = useState<Customer>(customer);

  useEffect(() => {
    setLocalCustomer(customer);
  }, [customer]);

  // Tabs
  const [activeMode, setActiveMode] = useState<ModeTab>("v3_current");

  // V3 state & query
  const { data: loyaltyV3Data, isLoading: loadingV3, refetch: refetchV3 } = useCustomerLoyalty(localCustomer.id);
  const { data: programs = [] } = useLoyaltyPrograms();

  // Legacy state
  const [legacyHistory, setLegacyHistory] = useState<LoyaltyVisit[]>([]);
  const [loadingLegacy, setLoadingLegacy] = useState(true);
  const [editingLegacy, setEditingLegacy] = useState(false);
  const [legacyForm, setLegacyForm] = useState({
    loyalty_visits: 0,
    loyalty_free_washes_earned: 0,
    loyalty_free_washes_used: 0,
  });
  const [savingLegacy, setSavingLegacy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const legacyVisits = localCustomer.loyalty_visits || 0;
  const legacyEarned = localCustomer.loyalty_free_washes_earned || 0;
  const legacyUsed = localCustomer.loyalty_free_washes_used || 0;
  const legacyAvailable = legacyEarned - legacyUsed;
  const legacyProgressToNext = legacyVisits % 8;
  const legacyProgressPercent = (legacyProgressToNext / 8) * 100;

  useEffect(() => {
    setLegacyForm({
      loyalty_visits: legacyVisits,
      loyalty_free_washes_earned: legacyEarned,
      loyalty_free_washes_used: legacyUsed,
    });
  }, [localCustomer]);

  // Load Legacy history
  useEffect(() => {
    const loadLegacyHistory = async () => {
      setLoadingLegacy(true);
      const { data } = await (supabase as any)
        .from("loyalty_visits")
        .select("*, services(name)")
        .eq("customer_id", localCustomer.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (data) {
        setLegacyHistory(data as LoyaltyVisit[]);
      }
      setLoadingLegacy(false);
    };
    loadLegacyHistory();
  }, [localCustomer.id]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const handleSaveLegacy = async () => {
    setSavingLegacy(true);
    try {
      const { error } = await supabase
        .from("customers")
        .update({
          loyalty_visits: legacyForm.loyalty_visits,
          loyalty_free_washes_earned: legacyForm.loyalty_free_washes_earned,
          loyalty_free_washes_used: legacyForm.loyalty_free_washes_used,
        })
        .eq("id", localCustomer.id);

      if (error) {
        showToast("Error al guardar: " + error.message);
      } else {
        showToast("Contadores antiguos actualizados");
        setLocalCustomer(prev => ({
          ...prev,
          loyalty_visits: legacyForm.loyalty_visits,
          loyalty_free_washes_earned: legacyForm.loyalty_free_washes_earned,
          loyalty_free_washes_used: legacyForm.loyalty_free_washes_used,
        }));
        setEditingLegacy(false);
        onUpdate();
      }
    } catch (err: any) {
      showToast(err.message || "Error al guardar");
    } finally {
      setSavingLegacy(false);
    }
  };

  // V3 calculations
  const availableRewardsV3 = loyaltyV3Data?.rewards.filter(r => r.status === "available") ?? [];
  const washLogV3 = loyaltyV3Data?.washLog ?? [];
  const redemptionsV3 = loyaltyV3Data?.redemptions ?? [];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content animate-scale-in max-w-3xl w-full" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-foreground">
            <i className="fa-solid fa-star mr-2 text-amber-500" />
            Estado de Lealtad
          </h2>
          <button onClick={onClose} className="touch-btn p-2 text-muted-foreground">
            <i className="fa-solid fa-xmark text-xl" />
          </button>
        </div>

        {/* Customer Header Info */}
        <div className="bg-muted/30 rounded-xl p-4 mb-4 border border-border/40">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h3 className="text-lg font-bold text-foreground">{localCustomer.name}</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {localCustomer.plate && <span className="mr-4"><i className="fa-solid fa-car mr-1 text-secondary" />{localCustomer.plate}</span>}
                {localCustomer.phone && <span><i className="fa-solid fa-phone mr-1 text-secondary" />{localCustomer.phone}</span>}
              </p>
            </div>
            {localCustomer.loyalty_last_visit && (
              <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-lg">
                <i className="fa-solid fa-clock mr-1 text-secondary" />
                Última visita: {new Date(localCustomer.loyalty_last_visit).toLocaleDateString("es-NI")}
              </span>
            )}
          </div>
        </div>

        {/* Mode Selector Tabs (V3 vs Legacy) */}
        <div className="flex gap-1 bg-muted/60 p-1 rounded-xl mb-4 border border-border/20">
          <button
            onClick={() => setActiveMode("v3_current")}
            className={`flex-1 py-2.5 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
              activeMode === "v3_current"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <i className="fa-solid fa-crown text-amber-500" />
            Programa Actual (Premium / Nítido)
            {availableRewardsV3.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full bg-green-500 text-white text-[9px] font-black animate-pulse">
                {availableRewardsV3.length} Premio{availableRewardsV3.length > 1 ? "s" : ""}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveMode("legacy_previous")}
            className={`flex-1 py-2.5 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
              activeMode === "legacy_previous"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <i className="fa-solid fa-clock-rotate-left" />
            Historial Anterior (Legacy)
            {legacyAvailable > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full bg-accent/20 text-accent text-[9px] font-black">
                {legacyAvailable} libre
              </span>
            )}
          </button>
        </div>

        {/* Tab 1: V3 Current Program */}
        {activeMode === "v3_current" && (
          <div className="space-y-4">
            {loadingV3 ? (
              <div className="text-center py-12">
                <i className="fa-solid fa-spinner fa-spin text-3xl text-amber-500" />
                <p className="text-xs text-muted-foreground mt-2">Cargando datos del programa actual...</p>
              </div>
            ) : (
              <>
                {/* Available rewards (if any) */}
                {availableRewardsV3.length > 0 && (
                  <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-400/30 rounded-xl flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center text-amber-600 dark:text-amber-400">
                        <i className="fa-solid fa-gift text-lg" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-foreground">Premios ganados y listos para usar:</p>
                        <p className="text-sm font-black text-amber-700 dark:text-amber-400 mt-0.5">
                          {availableRewardsV3.map(r => r.reward_name).join(" · ")}
                        </p>
                      </div>
                    </div>
                    <span className="text-[10px] bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-300 font-bold px-2 py-1 rounded-lg shrink-0">
                      Canjear en Factura (POS)
                    </span>
                  </div>
                )}

                {/* Programs Progress Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {programs.map((program) => {
                    const prog = loyaltyV3Data?.progress.find(p => p.program_id === program.id);
                    const accumulated = prog?.total_washes || 0;
                    const cycleWashes = prog?.washes_in_cycle || 0;
                    const cycleSize = program.cycle_size || 9;
                    const progressPercent = Math.min(100, (cycleWashes / cycleSize) * 100);

                    // Decode reward milestones for progress bar dots
                    const rewardsDef = Array.isArray(program.rewards) ? program.rewards : [];

                    return (
                      <div key={program.id} className="pos-card p-4 border border-border/50 relative overflow-hidden flex flex-col justify-between">
                        <div>
                          <div className="flex justify-between items-start mb-2">
                            <h4 className="font-bold text-foreground text-sm flex items-center gap-1.5">
                              <i className={`fa-solid ${program.slug === 'premium' ? 'fa-crown text-amber-500' : 'fa-droplet text-blue-500'}`} />
                              Programa {program.name}
                            </h4>
                            <span className="text-[10px] text-muted-foreground">
                              Ciclo #{prog?.cycle_number || 1}
                            </span>
                          </div>

                          <div className="flex justify-between text-xs text-muted-foreground mb-1">
                            <span>Lavadas acumuladas:</span>
                            <span className="font-semibold text-foreground">{accumulated}</span>
                          </div>

                          {/* Progress bar */}
                          <div className="space-y-1 mt-3">
                            <div className="flex justify-between text-xs font-semibold text-foreground">
                              <span>Progreso del ciclo:</span>
                              <span>{cycleWashes} / {cycleSize}</span>
                            </div>
                            <div className="w-full bg-muted rounded-full h-3.5 relative overflow-hidden border border-border/20">
                              <div
                                className={`h-full transition-all duration-300 bg-gradient-to-r ${
                                  program.slug === 'premium'
                                    ? 'from-amber-500 to-yellow-400'
                                    : 'from-blue-600 to-cyan-400'
                                }`}
                                style={{ width: `${progressPercent}%` }}
                              />
                            </div>
                          </div>

                          {/* Milestones info */}
                          <div className="mt-3 space-y-1">
                            {rewardsDef.map((rDef: any, idx: number) => {
                              const milestone = Number(rDef.at);
                              const isEarned = cycleWashes >= milestone;
                              return (
                                <div key={idx} className="flex justify-between items-center text-[10px] py-0.5">
                                  <span className="text-muted-foreground flex items-center gap-1">
                                    <i className={`fa-solid fa-circle text-[6px] ${isEarned ? 'text-green-500' : 'text-muted-foreground/40'}`} />
                                    A las {milestone} lavadas:
                                  </span>
                                  <span className={`font-semibold ${isEarned ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`}>
                                    {rDef.reward} {isEarned && "✓"}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* V3 History */}
                <div>
                  <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                    <i className="fa-solid fa-clock-rotate-left text-secondary" />
                    Historial de lavadas (Programa Actual)
                    {washLogV3.length > 0 && <span className="text-xs text-muted-foreground font-normal">({washLogV3.length})</span>}
                  </h3>
                  {washLogV3.length === 0 ? (
                    <p className="text-center py-6 text-muted-foreground text-xs bg-muted/10 rounded-xl border border-dashed border-border/40">
                      Sin historial de servicios en el programa actual
                    </p>
                  ) : (
                    <div className="max-h-56 overflow-y-auto border border-border rounded-xl">
                      <table className="w-full text-xs">
                        <thead className="bg-muted/50 sticky top-0">
                          <tr className="border-b border-border">
                            <th className="text-left p-2 text-secondary font-semibold">Programa</th>
                            <th className="text-left p-2 text-secondary font-semibold">Servicio</th>
                            <th className="text-center p-2 text-secondary font-semibold">Ticket</th>
                            <th className="text-right p-2 text-secondary font-semibold">Fecha</th>
                          </tr>
                        </thead>
                        <tbody>
                          {washLogV3.map((log) => (
                            <tr key={log.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                              <td className="p-2 text-foreground font-semibold uppercase text-[10px]">
                                {log.loyalty_programs?.name}
                              </td>
                              <td className="p-2 text-muted-foreground">
                                {log.services?.name || `Servicio ID: ${log.service_id}`}
                              </td>
                              <td className="p-2 text-center text-muted-foreground">
                                {log.tickets?.ticket_number || `ID: ${log.ticket_id}`}
                              </td>
                              <td className="p-2 text-right text-muted-foreground">
                                {new Date(log.created_at).toLocaleDateString("es-NI")} {new Date(log.created_at).toLocaleTimeString("es-NI", { hour: "2-digit", minute: "2-digit" })}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* V3 Redemptions */}
                {redemptionsV3.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                      <i className="fa-solid fa-gift text-green-600" />
                      Canjes Realizados (Programa Actual)
                    </h3>
                    <div className="max-h-48 overflow-y-auto border border-border rounded-xl">
                      <table className="w-full text-xs">
                        <thead className="bg-muted/50 sticky top-0">
                          <tr className="border-b border-border">
                            <th className="text-left p-2 text-secondary font-semibold">Premio Canjeado</th>
                            <th className="text-center p-2 text-secondary font-semibold">Ticket</th>
                            <th className="text-left p-2 text-secondary font-semibold">Nota</th>
                            <th className="text-right p-2 text-secondary font-semibold">Fecha Canje</th>
                          </tr>
                        </thead>
                        <tbody>
                          {redemptionsV3.map((rd) => (
                            <tr key={rd.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                              <td className="p-2 text-foreground font-bold">{rd.loyalty_rewards?.reward_name}</td>
                              <td className="p-2 text-center text-muted-foreground">{rd.tickets?.ticket_number || "—"}</td>
                              <td className="p-2 text-muted-foreground truncate max-w-[150px]">{rd.notes || "—"}</td>
                              <td className="p-2 text-right text-muted-foreground">
                                {new Date(rd.redeemed_at).toLocaleDateString("es-NI")}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Tab 2: Legacy Program (Previous system) */}
        {activeMode === "legacy_previous" && (
          <div className="space-y-4">
            {/* Stats Cards */}
            <div className="grid grid-cols-4 gap-3">
              <div className="bg-primary/10 rounded-xl p-3 text-center border border-primary/20">
                <p className="text-2xl font-bold text-primary">{legacyVisits}</p>
                <p className="text-xs text-muted-foreground">Servicios</p>
              </div>
              <div className="bg-accent/10 rounded-xl p-3 text-center border border-accent/20">
                <p className="text-2xl font-bold text-accent">{legacyEarned}</p>
                <p className="text-xs text-muted-foreground">Ganados</p>
              </div>
              <div className="bg-destructive/10 rounded-xl p-3 text-center border border-destructive/20">
                <p className="text-2xl font-bold text-destructive">{legacyUsed}</p>
                <p className="text-xs text-muted-foreground">Usados</p>
              </div>
              <div className="bg-green-500/10 rounded-xl p-3 text-center border border-green-500/20">
                <p className="text-2xl font-bold text-green-600">{legacyAvailable}</p>
                <p className="text-xs text-muted-foreground">Disponibles</p>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="p-4 bg-muted/20 border border-border/40 rounded-xl">
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="text-muted-foreground">Progreso al próximo gratis (anterior)</span>
                <span className="font-semibold text-foreground">{legacyProgressToNext}/8</span>
              </div>
              <div className="w-full bg-muted rounded-full h-3 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-primary to-accent transition-all duration-300"
                  style={{ width: `${legacyProgressPercent}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {legacyAvailable > 0 ? (
                  <span className="text-green-600 font-bold flex items-center gap-1">
                    <i className="fa-solid fa-gift" />
                    {legacyAvailable} pasteado{legacyAvailable > 1 ? "s" : ""} gratis disponible{legacyAvailable > 1 ? "s" : ""} en contadores heredados
                  </span>
                ) : (
                  `${8 - legacyProgressToNext} servicios para pasteado gratis`
                )}
              </p>
            </div>

            {/* Edit Legacy counters */}
            <div className="flex gap-2">
              {!editingLegacy ? (
                <button
                  onClick={() => setEditingLegacy(true)}
                  className="touch-btn px-4 py-2 rounded-xl bg-secondary/10 text-secondary font-semibold flex items-center gap-2 hover:bg-secondary/20"
                >
                  <i className="fa-solid fa-pen" />Editar contadores antiguos
                </button>
              ) : (
                <div className="w-full space-y-3 p-4 bg-muted/30 border border-border/40 rounded-xl animate-fade-in">
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1">Servicios</label>
                      <input
                        type="number"
                        min="0"
                        value={legacyForm.loyalty_visits}
                        onChange={(e) => setLegacyForm({ ...legacyForm, loyalty_visits: parseInt(e.target.value) || 0 })}
                        className="input-touch text-center"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1">Ganados</label>
                      <input
                        type="number"
                        min="0"
                        value={legacyForm.loyalty_free_washes_earned}
                        onChange={(e) => setLegacyForm({ ...legacyForm, loyalty_free_washes_earned: parseInt(e.target.value) || 0 })}
                        className="input-touch text-center"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1">Usados</label>
                      <input
                        type="number"
                        min="0"
                        value={legacyForm.loyalty_free_washes_used}
                        onChange={(e) => setLegacyForm({ ...legacyForm, loyalty_free_washes_used: parseInt(e.target.value) || 0 })}
                        className="input-touch text-center"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setEditingLegacy(false);
                        setLegacyForm({ loyalty_visits: legacyVisits, loyalty_free_washes_earned: legacyEarned, loyalty_free_washes_used: legacyUsed });
                      }}
                      className="touch-btn flex-1 py-2 rounded-xl border border-border text-foreground font-semibold"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleSaveLegacy}
                      disabled={savingLegacy}
                      className="touch-btn flex-1 py-2 rounded-xl bg-primary text-primary-foreground font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      <i className="fa-solid fa-floppy-disk" />
                      {savingLegacy ? "Guardando..." : "Guardar"}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Legacy History */}
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                <i className="fa-solid fa-clock-rotate-left text-secondary" />
                Historial de servicios (Legacy)
                {legacyHistory.length > 0 && <span className="text-xs text-muted-foreground font-normal">({legacyHistory.length})</span>}
              </h3>
              {loadingLegacy ? (
                <div className="text-center py-6"><i className="fa-solid fa-spinner fa-spin text-xl text-accent" /></div>
              ) : legacyHistory.length === 0 ? (
                <p className="text-center py-6 text-muted-foreground text-xs bg-muted/10 rounded-xl border border-dashed border-border/40">
                  Sin historial de servicios anterior
                </p>
              ) : (
                <div className="max-h-56 overflow-y-auto border border-border rounded-xl">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50 sticky top-0">
                      <tr className="border-b border-border">
                        <th className="text-left p-2 text-secondary font-semibold">#</th>
                        <th className="text-left p-2 text-secondary font-semibold">Servicio</th>
                        <th className="text-center p-2 text-secondary font-semibold">Gratis</th>
                        <th className="text-right p-2 text-secondary font-semibold">Fecha</th>
                      </tr>
                    </thead>
                    <tbody>
                      {legacyHistory.map((h) => (
                        <tr key={h.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                          <td className="p-2 text-foreground font-medium">{h.visit_number}</td>
                          <td className="p-2 text-muted-foreground">{h.services?.name || `ID: ${h.service_id}`}</td>
                          <td className="p-2 text-center">
                            {h.earned_free_wash ? (
                              <span className="px-2 py-0.5 rounded-full bg-accent/20 text-accent font-bold text-[10px]">
                                <i className="fa-solid fa-gift mr-1" />Sí
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="p-2 text-right text-muted-foreground">
                            {new Date(h.created_at).toLocaleDateString("es-NI")} {new Date(h.created_at).toLocaleTimeString("es-NI", { hour: "2-digit", minute: "2-digit" })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {toast && (
          <div className="toast-success fixed bottom-4 right-4 z-50">
            <i className="fa-solid fa-circle-check mr-2" />
            {toast}
          </div>
        )}
      </div>
    </div>
  );
}
