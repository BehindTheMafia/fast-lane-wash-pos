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
    <div className="h-full overflow-auto p-4 md:p-6 space-y-6" style={{ backgroundColor: "#F7F5F0" }}>
      {/* ── Page Header (Brand Identity) ── */}
      <div className="flex items-center gap-3.5">
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center shadow-md"
          style={{ backgroundColor: "#002C47" }}
        >
          <i className="fa-solid fa-star text-white text-lg" />
        </div>
        <div>
          <h1 className="text-xl font-black font-montserrat" style={{ color: "#002C47" }}>
            Programa de Lealtad
          </h1>
          <p className="text-xs font-medium" style={{ color: "#456A83" }}>
            Consulta progreso y canjes de clientes · EL RÁPIDO AUTOLAVADO
          </p>
        </div>
      </div>

      {/* ── Customer Search Box ── */}
      <div
        className="rounded-2xl p-4 shadow-sm border"
        style={{ backgroundColor: "#FFFFFF", borderColor: "#E8DECC" }}
      >
        <label className="text-xs font-bold uppercase tracking-wider mb-2 block" style={{ color: "#002C47" }}>
          <i className="fa-solid fa-magnifying-glass mr-1.5" style={{ color: "#456A83" }} />
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
            style={{
              borderColor: "#E8DECC",
              color: "#002C47",
            }}
          />
          {searching && (
            <i className="fa-solid fa-spinner fa-spin absolute right-3.5 top-1/2 -translate-y-1/2" style={{ color: "#456A83" }} />
          )}
        </div>

        {/* Search Results Dropdown */}
        {searchQuery.length >= 2 && searchResults.length > 0 && (
          <div
            className="mt-2 rounded-xl border shadow-xl overflow-hidden z-20 relative"
            style={{ backgroundColor: "#FFFFFF", borderColor: "#E8DECC" }}
          >
            {searchResults.map((c) => (
              <button
                key={c.id}
                onClick={() => handleSelectCustomer(c)}
                className="touch-btn w-full text-left px-4 py-3 hover:bg-[#FEF2DD] border-b last:border-0 flex items-center gap-3 transition-colors"
                style={{ borderColor: "#E8DECC" }}
              >
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                  style={{ backgroundColor: "#FEF2DD" }}
                >
                  <i className="fa-solid fa-user text-sm" style={{ color: "#002C47" }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm truncate" style={{ color: "#002C47" }}>{c.name}</p>
                  <p className="text-xs" style={{ color: "#456A83" }}>
                    {c.phone && <span className="mr-3"><i className="fa-solid fa-phone mr-1" />{c.phone}</span>}
                    {c.plate && <span><i className="fa-solid fa-car mr-1" />{c.plate}</span>}
                  </p>
                </div>
                <i className="fa-solid fa-chevron-right text-xs" style={{ color: "#456A83" }} />
              </button>
            ))}
          </div>
        )}

        {searchQuery.length >= 2 && !searching && searchResults.length === 0 && (
          <p className="mt-2 text-sm text-center py-3 font-medium" style={{ color: "#456A83" }}>
            No se encontró ningún cliente
          </p>
        )}
      </div>

      {/* ── Selected Customer Section ── */}
      {selectedCustomer && (
        <>
          {/* Selected Customer Header Card */}
          <div
            className="rounded-2xl p-4 flex items-center gap-4 border shadow-sm"
            style={{ backgroundColor: "#FFFFFF", borderColor: "#E8DECC" }}
          >
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center shrink-0 shadow-xs"
              style={{ backgroundColor: "#002C47" }}
            >
              <i className="fa-solid fa-user text-xl text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-black text-lg truncate font-montserrat" style={{ color: "#002C47" }}>
                {selectedCustomer.name}
              </p>
              <div className="flex flex-wrap gap-3 mt-0.5">
                {selectedCustomer.phone && (
                  <span className="text-xs font-medium flex items-center gap-1" style={{ color: "#456A83" }}>
                    <i className="fa-solid fa-phone" style={{ color: "#1E3E5F" }} />
                    {selectedCustomer.phone}
                  </span>
                )}
                {selectedCustomer.plate && (
                  <span className="text-xs font-medium flex items-center gap-1" style={{ color: "#456A83" }}>
                    <i className="fa-solid fa-car" style={{ color: "#1E3E5F" }} />
                    {selectedCustomer.plate}
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={() => { setSelectedCustomer(null); setSearchQuery(""); }}
              className="touch-btn p-2 rounded-lg hover:bg-[#FEF2DD] transition-colors"
              style={{ color: "#456A83" }}
              title="Cambiar cliente"
            >
              <i className="fa-solid fa-xmark text-lg" />
            </button>
          </div>

          {/* ── Available Rewards Banner (Brand Blue #002C47) ── */}
          {availableRewards.length > 0 && (
            <div
              className="rounded-2xl p-4 shadow-lg text-white relative overflow-hidden"
              style={{ background: "linear-gradient(135deg, #002C47 0%, #1E3E5F 100%)" }}
            >
              <div className="flex items-center justify-between flex-wrap gap-3 relative z-10">
                <div className="flex items-center gap-3.5">
                  <div
                    className="w-11 h-11 rounded-full flex items-center justify-center shrink-0 shadow-md"
                    style={{ backgroundColor: "#FEF2DD" }}
                  >
                    <i className="fa-solid fa-gift text-lg" style={{ color: "#7F0000" }} />
                  </div>
                  <div>
                    <p className="font-black text-base font-montserrat" style={{ color: "#FEF2DD" }}>
                      {availableRewards.length} Premio{availableRewards.length > 1 ? "s" : ""} disponible{availableRewards.length > 1 ? "s" : ""}
                    </p>
                    <p className="text-xs font-semibold text-white/90 mt-0.5">
                      {availableRewards.map((r) => r.reward_name).join(" · ")}
                    </p>
                    <p className="text-[11px] text-white/80 mt-1.5 font-medium flex items-center gap-1.5">
                      <i className="fa-solid fa-circle-info text-xs" style={{ color: "#FEEDD3" }} />
                      Los premios se canjean agregándolos a la factura desde la pantalla de Ventas (POS).
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Tabs (Progreso | Historial | Canjes) ── */}
          <div
            className="flex gap-1.5 p-1.5 rounded-2xl border"
            style={{ backgroundColor: "#FEEDD3", borderColor: "#E8DECC" }}
          >
            {tabs.map((tab) => (
              <button
                key={tab.id}
                id={`loyalty-tab-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                className={`touch-btn flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${
                  activeTab === tab.id
                    ? "shadow-md"
                    : "hover:bg-white/40"
                }`}
                style={{
                  backgroundColor: activeTab === tab.id ? "#002C47" : "transparent",
                  color: activeTab === tab.id ? "#FFFFFF" : "#002C47",
                }}
              >
                <i className={`fa-solid ${tab.icon}`} />
                <span className="hidden sm:inline">{tab.label}</span>
                {tab.count !== undefined && tab.count > 0 && (
                  <span
                    className="text-xs px-2 py-0.5 rounded-full font-bold"
                    style={{
                      backgroundColor: activeTab === tab.id ? "#C89B5A" : "#002C47",
                      color: "#FFFFFF",
                    }}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* ── Tab Content ── */}
          {loyaltyLoading ? (
            <div className="flex items-center justify-center py-16">
              <i className="fa-solid fa-spinner fa-spin text-3xl" style={{ color: "#002C47" }} />
            </div>
          ) : (
            <>
              {/* Dashboard / Progreso tab */}
              {activeTab === "dashboard" && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
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
                          customerId={selectedCustomer.id}
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
                  <h3 className="font-bold text-sm flex items-center gap-2" style={{ color: "#002C47" }}>
                    <i className="fa-solid fa-receipt" style={{ color: "#456A83" }} />
                    Premios canjeados
                  </h3>
                  {loyaltyData?.rewards
                    .filter((r) => r.status === "redeemed")
                    .map((r) => (
                      <div
                        key={r.id}
                        className="rounded-2xl p-4 flex items-start gap-4 border shadow-xs"
                        style={{ backgroundColor: "#FFFFFF", borderColor: "#E8DECC" }}
                      >
                        <div
                          className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                          style={{ backgroundColor: "#FEF2DD" }}
                        >
                          <i className="fa-solid fa-check" style={{ color: "#002C47" }} />
                        </div>
                        <div className="flex-1">
                          <p className="font-bold text-sm" style={{ color: "#002C47" }}>{r.reward_name}</p>
                          <p className="text-xs mt-0.5" style={{ color: "#456A83" }}>
                            Programa: {r.loyalty_programs?.name} · Canjeado el{" "}
                            {new Date(r.earned_at).toLocaleDateString("es-NI")}
                          </p>
                        </div>
                        <span
                          className="text-xs px-2.5 py-1 rounded-full font-bold"
                          style={{ backgroundColor: "#FEF2DD", color: "#002C47", border: "1px solid #E8DECC" }}
                        >
                          Canjeado
                        </span>
                      </div>
                    ))}
                  {(loyaltyData?.rewards.filter((r) => r.status === "redeemed").length ?? 0) === 0 && (
                    <div className="text-center py-10 text-sm font-medium" style={{ color: "#456A83" }}>
                      <i className="fa-solid fa-receipt text-3xl mb-2 opacity-30" />
                      <p>Sin premios canjeados</p>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ── Empty State (No customer selected) ── */}
      {!selectedCustomer && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center mb-4 shadow-md"
            style={{ backgroundColor: "#002C47" }}
          >
            <i className="fa-solid fa-star text-3xl text-white" />
          </div>
          <h2 className="text-lg font-bold mb-1 font-montserrat" style={{ color: "#002C47" }}>
            Busca un cliente
          </h2>
          <p className="text-sm max-w-xs font-medium" style={{ color: "#456A83" }}>
            Ingresa el nombre, teléfono o placa del cliente para ver su progreso en el programa de lealtad.
          </p>
        </div>
      )}

      {/* ── Toast ── */}
      {toast && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl shadow-2xl text-sm font-bold text-white"
          style={{
            backgroundColor: toast.type === "success" ? "#002C47" : "#7F0000",
          }}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}
