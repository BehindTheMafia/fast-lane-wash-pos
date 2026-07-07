import { useState } from "react";
import {
  useSearchCustomersForLoyalty,
  useCustomerLoyalty,
  useLoyaltyPrograms,
  useRedeemLoyaltyReward,
} from "@/hooks/useLoyaltyV3";
import { useAuth } from "@/hooks/useAuth";
import LoyaltyProgramCard from "@/components/loyalty/LoyaltyProgramCard";
import LoyaltyHistory from "@/components/loyalty/LoyaltyHistory";
import type { LoyaltyReward } from "@/hooks/useLoyaltyV3";

interface Customer {
  id: number;
  name: string;
  phone: string;
  plate: string;
  is_general: boolean;
}

type Tab = "dashboard" | "history" | "redeemed";

export default function Loyalty() {
  const { isAdmin, isOwner, user } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const { data: programs = [] } = useLoyaltyPrograms();
  const { data: searchResults = [], isLoading: searching } = useSearchCustomersForLoyalty(searchQuery);
  const {
    data: loyaltyData,
    isLoading: loyaltyLoading,
    refetch: refetchLoyalty,
  } = useCustomerLoyalty(selectedCustomer?.id);
  const redeemMutation = useRedeemLoyaltyReward();

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const handleSelectCustomer = (c: Customer) => {
    setSelectedCustomer(c);
    setSearchQuery("");
    setActiveTab("dashboard");
  };



  const availableRewards = loyaltyData?.rewards.filter((r) => r.status === "available") ?? [];
  const redeemedRewards = loyaltyData?.redemptions ?? [];

  const tabs: { id: Tab; label: string; icon: string; count?: number }[] = [
    { id: "dashboard", label: "Progreso", icon: "fa-chart-pie" },
    { id: "history", label: "Historial", icon: "fa-clock-rotate-left", count: loyaltyData?.washLog.length },
    { id: "redeemed", label: "Canjes", icon: "fa-receipt", count: redeemedRewards.length },
  ];

  return (
    <div className="h-full overflow-auto p-4 md:p-6 space-y-6">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shadow-md">
          <i className="fa-solid fa-star text-white" />
        </div>
        <div>
          <h1 className="text-xl font-black text-foreground">Programa de Lealtad</h1>
          <p className="text-xs text-muted-foreground">Consulta progreso y canjes de clientes</p>
        </div>
      </div>

      {/* Customer search */}
      <div className="pos-card p-4">
        <label className="text-xs font-bold text-foreground uppercase tracking-wide mb-2 block">
          <i className="fa-solid fa-magnifying-glass mr-1 text-secondary" />
          Buscar cliente
        </label>
        <div className="relative">
          <input
            id="loyalty-customer-search"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Nombre, teléfono o placa..."
            className="input-touch pr-10"
          />
          {searching && (
            <i className="fa-solid fa-spinner fa-spin absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          )}
        </div>

        {/* Search results dropdown */}
        {searchQuery.length >= 2 && searchResults.length > 0 && (
          <div className="mt-2 rounded-xl border border-border bg-card shadow-xl overflow-hidden z-20 relative">
            {searchResults.map((c) => (
              <button
                key={c.id}
                onClick={() => handleSelectCustomer(c)}
                className="touch-btn w-full text-left px-4 py-3 hover:bg-muted/50 border-b border-border/50 last:border-0 flex items-center gap-3"
              >
                <div className="w-9 h-9 rounded-full bg-sidebar-accent/20 flex items-center justify-center shrink-0">
                  <i className="fa-solid fa-user text-sm text-secondary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">{c.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {c.phone && <span className="mr-2"><i className="fa-solid fa-phone mr-1" />{c.phone}</span>}
                    {c.plate && <span><i className="fa-solid fa-car mr-1" />{c.plate}</span>}
                  </p>
                </div>
                <i className="fa-solid fa-chevron-right text-muted-foreground text-xs" />
              </button>
            ))}
          </div>
        )}

        {searchQuery.length >= 2 && !searching && searchResults.length === 0 && (
          <p className="mt-2 text-sm text-muted-foreground text-center py-3">
            No se encontró ningún cliente
          </p>
        )}
      </div>

      {/* Customer selected */}
      {selectedCustomer && (
        <>
          {/* Customer card */}
          <div className="pos-card p-4 flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-accent flex items-center justify-center shrink-0">
              <i className="fa-solid fa-user text-xl text-accent-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-black text-lg text-foreground truncate">{selectedCustomer.name}</p>
              <div className="flex flex-wrap gap-3 mt-1">
                {selectedCustomer.phone && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <i className="fa-solid fa-phone text-secondary" />
                    {selectedCustomer.phone}
                  </span>
                )}
                {selectedCustomer.plate && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <i className="fa-solid fa-car text-secondary" />
                    {selectedCustomer.plate}
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={() => { setSelectedCustomer(null); setSearchQuery(""); }}
              className="touch-btn p-2 text-muted-foreground hover:text-foreground"
              title="Cambiar cliente"
            >
              <i className="fa-solid fa-xmark" />
            </button>
          </div>

          {/* Available rewards banner */}
          {availableRewards.length > 0 && (
            <div className="rounded-xl bg-primary p-4 shadow-lg">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                    <i className="fa-solid fa-gift text-white text-lg" />
                  </div>
                  <div>
                    <p className="text-white font-black text-sm">
                      {availableRewards.length} Premio{availableRewards.length > 1 ? "s" : ""} disponible{availableRewards.length > 1 ? "s" : ""}
                    </p>
                    <p className="text-white/95 text-xs mt-0.5 font-semibold">
                      {availableRewards.map((r) => r.reward_name).join(" · ")}
                    </p>
                    <p className="text-white/90 text-[10px] mt-1.5 italic font-medium flex items-center gap-1">
                      <i className="fa-solid fa-circle-info" />
                      Los premios se canjean agregándolos a la factura desde la pantalla de Ventas (POS).
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tabs */}
          <div className="flex gap-1 bg-muted/50 rounded-xl p-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                id={`loyalty-tab-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                className={`touch-btn flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                  activeTab === tab.id
                    ? "bg-card shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <i className={`fa-solid ${tab.icon}`} />
                <span className="hidden sm:inline">{tab.label}</span>
                {tab.count !== undefined && tab.count > 0 && (
                  <span className="text-xs px-1.5 py-0.5 rounded-full bg-accent/20 text-accent font-bold">
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Tab content */}
          {loyaltyLoading ? (
            <div className="flex items-center justify-center py-16">
              <i className="fa-solid fa-spinner fa-spin text-3xl text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* Dashboard tab */}
              {activeTab === "dashboard" && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {programs.length === 0 ? (
                    <div className="col-span-2 text-center py-12 text-muted-foreground">
                      <i className="fa-solid fa-star text-4xl mb-3 opacity-20" />
                      <p>No hay programas de lealtad configurados</p>
                    </div>
                  ) : (
                    programs.map((program) => {
                      const progress = loyaltyData?.progress.find(
                        (p) => p.program_id === program.id
                      );
                      const programRewards = loyaltyData?.rewards ?? [];
                      return (
                        <LoyaltyProgramCard
                          key={program.id}
                          program={program}
                          progress={progress}
                          rewards={programRewards}
                        />
                      );
                    })
                  )}
                </div>
              )}

              {/* History tab */}
              {activeTab === "history" && (
                <LoyaltyHistory
                  washLog={loyaltyData?.washLog ?? []}
                  redemptions={loyaltyData?.redemptions ?? []}
                />
              )}

              {/* Redeemed tab */}
              {activeTab === "redeemed" && (
                <div className="space-y-4">
                  <h3 className="font-bold text-sm text-foreground flex items-center gap-2">
                    <i className="fa-solid fa-receipt text-secondary" />
                    Premios canjeados
                  </h3>
                  {loyaltyData?.rewards
                    .filter((r) => r.status === "redeemed")
                    .map((r) => (
                      <div
                        key={r.id}
                        className="pos-card p-4 flex items-start gap-4"
                      >
                        <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center shrink-0">
                          <i className="fa-solid fa-check text-accent" />
                        </div>
                        <div className="flex-1">
                          <p className="font-bold text-sm">{r.reward_name}</p>
                          <p className="text-xs text-muted-foreground">
                            Programa: {r.loyalty_programs?.name} · Canjeado el{" "}
                            {new Date(r.earned_at).toLocaleDateString("es-NI")}
                          </p>
                        </div>
                        <span className="text-xs px-2 py-1 rounded-full bg-accent/10 text-accent font-semibold">
                          Canjeado
                        </span>
                      </div>
                    ))}
                  {(loyaltyData?.rewards.filter((r) => r.status === "redeemed").length ?? 0) === 0 && (
                    <div className="text-center py-10 text-muted-foreground text-sm">
                      <i className="fa-solid fa-receipt text-3xl mb-2 opacity-20" />
                      <p>Sin premios canjeados</p>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* Empty state */}
      {!selectedCustomer && (
        <div className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground">
          <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <i className="fa-solid fa-star text-3xl text-primary" />
          </div>
          <h2 className="text-lg font-bold text-foreground mb-1">Busca un cliente</h2>
          <p className="text-sm max-w-xs">
            Ingresa el nombre, teléfono o placa del cliente para ver su progreso en el programa de lealtad.
          </p>
        </div>
      )}



      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl shadow-2xl text-sm font-semibold ${
            toast.type === "success"
              ? "bg-primary text-primary-foreground"
              : "bg-destructive text-destructive-foreground"
          }`}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}
