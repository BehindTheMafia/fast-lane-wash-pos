import { useTicketRefresh } from "@/hooks/useTicketRefresh";
import { useQueryClient } from "@tanstack/react-query";
import { invalidateTicketData } from "@/lib/ticketMutation";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useServices, useExtras, useBarberServicesForMix } from "@/hooks/useServices";
import { useVehicleTypes } from "@/hooks/useVehicleTypes";
import { useBusinessSettings } from "@/hooks/useBusinessSettings";
import { useBusinessLine } from "@/contexts/BusinessLineContext";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { niStartOfDay } from "@/utils/niDate";
import PaymentModal from "@/components/pos/PaymentModal";
import CustomerModal from "@/components/pos/CustomerModal";
import TicketPrint from "@/components/pos/TicketPrint";
import MembershipSelector from "@/components/pos/MembershipSelector";
import { useMemberships } from "@/hooks/useMemberships";
import { isServiceEligible, ELIGIBLE_SERVICE_NAMES } from "@/lib/membershipUtils";

import {
  useAvailableRewards,
  findBlockingReward,
  REWARD_SERVICE_MAP,
  REWARD_DISCOUNT_MAP,
} from "@/hooks/useLoyaltyV3";
import RewardBlockModal from "@/components/loyalty/RewardBlockModal";
import LoyaltySelector from "@/components/pos/LoyaltySelector";
import type { LoyaltyReward, LoyaltyTicketItem } from "@/hooks/useLoyaltyV3";
export type { LoyaltyTicketItem } from "@/hooks/useLoyaltyV3";

// Vehicle types are now loaded dynamically from DB via useVehicleTypes()

interface TicketItem {
  serviceId: any;
  serviceName: string;
  vehicleTypeId: number;
  vehicleLabel: string;
  price: number;
  discountPercent: number; // Discount as percentage (0-100)
  businessLine?: "car_wash" | "barbershop";
  // Loyalty v3 fields
  isLoyaltyRedemption?: boolean;
  loyaltyRewardId?: number;
  loyaltyRewardName?: string;
  loyaltyOriginalPrice?: number;
}

interface Customer {
  id: any;
  name: string;
  plate: string;
  phone: string;
  is_general: boolean;
}

export default function CarWashPOS() {
  const queryClient = useQueryClient();
  const saleRequestId = useRef(crypto.randomUUID());
  const { barbershopVisible } = useBusinessLine();
  const { data: services } = useServices();
  const { data: extras } = useExtras();
  const { data: barberServices } = useBarberServicesForMix();
  const { data: vehicleTypes } = useVehicleTypes();
  const { data: settings } = useBusinessSettings();
  const { user } = useAuth();

  // Combine normal services and extras for loyalty reward lookup
  const allServicesAndExtras = useMemo(() => {
    const listSvc = services ?? [];
    const listExt = extras ?? [];
    return [...listSvc, ...listExt];
  }, [services, extras]);

  const allServicePrices = useMemo(() => {
    const listSvcPrices = services?.flatMap((s: any) => s.service_prices ?? []) ?? [];
    const listExtPrices = extras?.flatMap((s: any) => s.service_prices ?? []) ?? [];
    return [...listSvcPrices, ...listExtPrices];
  }, [services, extras]);

  const [selectedVehicleId, setSelectedVehicleId] = useState<number>(0);
  const [selectedServiceId, setSelectedServiceId] = useState<number>(0);
  const [showCustomChargeModal, setShowCustomChargeModal] = useState(false);
  const [customConcept, setCustomConcept] = useState("");
  const [customAmount, setCustomAmount] = useState("");
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [ticketItems, setTicketItems] = useState<TicketItem[]>([]);
  const [showPayment, setShowPayment] = useState(false);
  const [showCustomer, setShowCustomer] = useState(false);
  const [showPrint, setShowPrint] = useState(false);
  const [lastTicket, setLastTicket] = useState<any>(null);
  const [recentTickets, setRecentTickets] = useState<any[]>([]);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  // useRef para guarda sincrónica (evita race condition con useState que es async)
  const isProcessingSaleRef = useRef(false);
  const [isProcessingSale, setIsProcessingSale] = useState(false);
  const [selectedMembershipId, setSelectedMembershipId] = useState<number | null>(null);
  const [selectedMembership, setSelectedMembership] = useState<any>(null);
  const [showBarberSection, setShowBarberSection] = useState(false);
  const [showMobileCart, setShowMobileCart] = useState(false);

  // Loyalty program v2 states (legacy — kept for backward compat, display hidden)
  const [loyaltyFreeWashes, setLoyaltyFreeWashes] = useState(0);
  const [usingLoyaltyWash, setUsingLoyaltyWash] = useState(false);
  const [loyaltyProgress, setLoyaltyProgress] = useState(0);

  // Loyalty v3: reward block state
  const [rewardBlockModal, setRewardBlockModal] = useState<{ show: boolean; rewardId: number | null; serviceName: string }>({ show: false, rewardId: null, serviceName: "" });
  const [selectedLoyaltyReward, setSelectedLoyaltyReward] = useState<LoyaltyReward | null>(null);

  const { memberships, getMembershipWithStatus } = useMemberships(customer?.id?.toString());

  // Loyalty v3 hooks
  const customerId = customer && !customer.is_general ? Number(customer.id) : null;
  const { data: availableRewardsV3 = [] } = useAvailableRewards(customerId);
  const { isAdmin, isOwner } = useAuth();

  // Filter active memberships with remaining washes
  const activeMemberships = memberships?.filter((m) => {
    const { status } = getMembershipWithStatus(m);
    return status !== 'expired' && m.washes_used < m.total_washes_allowed && m.active;
  }) || [];

  // Check if customer has active memberships that restrict vehicle/service selection
  const hasActiveMembership = activeMemberships.length > 0;

  // Get all vehicle types that have active memberships
  // distinct vehicle types from all active memberships
  const activeMembershipVehicleTypeIds = useMemo(() => {
    if (!activeMemberships.length) return [];
    return Array.from(new Set(activeMemberships.map(m => m.vehicle_type_id).filter(Boolean)));
  }, [activeMemberships]);

  const exchangeRate = settings?.exchange_rate || 36.5;

  // Load general customer on mount
  useEffect(() => {
    supabase.from("customers").select("id, name, plate, phone, is_general").eq("is_general", true).maybeSingle().then(({ data }) => {
      if (data) setCustomer(data as any as Customer);
    });
  }, []);

  // Load loyalty data whenever customer changes
  useEffect(() => {
    if (customer && !customer.is_general) {
      supabase.from("customers")
        .select("loyalty_visits, loyalty_free_washes_earned, loyalty_free_washes_used")
        .eq("id", customer.id)
        .single()
        .then(({ data }: any) => {
          if (data) {
            const available = (data.loyalty_free_washes_earned || 0) - (data.loyalty_free_washes_used || 0);
            setLoyaltyFreeWashes(available);
            setLoyaltyProgress((data.loyalty_visits || 0) % 8);
          }
        });
    } else {
      setLoyaltyFreeWashes(0);
      setLoyaltyProgress(0);
    }
    setUsingLoyaltyWash(false);
  }, [customer?.id]);

  // Load recent tickets on demand
  const loadRecent = useCallback(async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const { data } = await supabase
      .from("tickets")
      .select("id, ticket_number, total, status, created_at, vehicle_types(name)")
      .eq("business_line", "car_wash")
      .gte("created_at", niStartOfDay())
      .order("created_at", { ascending: false })
      .limit(10);
    if (data) setRecentTickets(data);
  }, []);

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const addToTicket = () => {
    if (!selectedServiceId || !selectedVehicleId) return;
    const svc = services?.find((s: any) => s.id === selectedServiceId);
    if (!svc) return;
    const priceEntry = (svc as any).service_prices?.find((p: any) => p.vehicle_type_id === selectedVehicleId);
    if (!priceEntry) return;
    const vt = vehicleTypes?.find((v) => v.id === selectedVehicleId);

    setTicketItems((prev) => [
      ...prev,
      {
        serviceId: svc.id,
        serviceName: svc.name || "",
        vehicleTypeId: selectedVehicleId,
        vehicleLabel: vt?.name || "",
        price: Number(priceEntry.price),
        discountPercent: 0,
      },
    ]);
    showToast("Servicio agregado");
  };

  // Add an extra directly to the ticket
  const addExtraToTicket = (extra: any) => {
    if (!selectedVehicleId) { showToast("Selecciona un tipo de vehículo primero", "error"); return; }
    const priceEntry = extra.service_prices?.find((p: any) => p.vehicle_type_id === selectedVehicleId);
    if (!priceEntry) { showToast("Extra no disponible para este vehículo", "error"); return; }
    const vt = vehicleTypes?.find((v) => v.id === selectedVehicleId);
    setTicketItems((prev) => [
      ...prev,
      {
        serviceId: extra.id,
        serviceName: extra.name || "",
        vehicleTypeId: selectedVehicleId,
        vehicleLabel: vt?.name || "",
        price: Number(priceEntry.price),
        discountPercent: 0,
      },
    ]);
    showToast(`${extra.name} agregado`);
  };

  const removeItem = (idx: number) => {
    setTicketItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const subtotal = ticketItems.reduce((s, i) => s + i.price, 0);
  const totalDiscount = ticketItems.reduce((s, i) => s + (i.price * i.discountPercent / 100), 0);
  const total = subtotal - totalDiscount;

  const applyRewardToTicket = (reward: LoyaltyReward) => {
    const pattern = REWARD_SERVICE_MAP[reward.reward_slug];
    if (!pattern || !allServicesAndExtras) {
      showToast("Mapeo de servicio de recompensa no disponible", "error");
      return;
    }
    const service = allServicesAndExtras.find((s: any) =>
      s.name.toLowerCase().includes(pattern.toLowerCase())
    );
    if (!service) {
      showToast(`No se encontró el servicio para el premio: ${pattern}`, "error");
      return;
    }

    let price = 0;
    const priceEntry = allServicePrices.find(
      (p: any) => p.service_id === service.id && p.vehicle_type_id === selectedVehicleId
    );
    
    if (!priceEntry) {
      const anyPrice = allServicePrices.find((p: any) => p.service_id === service.id);
      price = anyPrice ? Number(anyPrice.price) : 0;
    } else {
      price = Number(priceEntry.price);
    }

    const discountPct = REWARD_DISCOUNT_MAP[reward.reward_slug] ?? 100;

    setSelectedLoyaltyReward(reward);
    setTicketItems(prev => [
      ...prev.filter(i => i.serviceId !== service.id && !i.isLoyaltyRedemption),
      {
        serviceId: service.id,
        serviceName: service.name,
        vehicleTypeId: selectedVehicleId || 0,
        vehicleLabel: vehicleTypes?.find(v => v.id === selectedVehicleId)?.name ?? "",
        price: price,
        discountPercent: discountPct,
        isLoyaltyRedemption: true,
        loyaltyRewardId: reward.id,
        loyaltyRewardName: reward.reward_name,
        loyaltyOriginalPrice: price,
      },
    ]);
    showToast(`🎁 Premio aplicado: ${reward.reward_name}`);
  };

  const newTicket = () => {
    saleRequestId.current = crypto.randomUUID();
    setTicketItems([]);
    setSelectedServiceId(0);
    setSelectedVehicleId(0);
    setSelectedMembershipId(null);
    setSelectedMembership(null);
    setUsingLoyaltyWash(false);
    setSelectedLoyaltyReward(null);
    supabase.from("customers").select("*").eq("is_general", true).maybeSingle().then(({ data }) => {
      if (data) setCustomer(data as any as Customer);
    });
  };

  // Toggle loyalty free wash redemption
  const toggleLoyaltyWash = () => {
    if (usingLoyaltyWash) {
      // Remove the loyalty item
      setTicketItems(prev => prev.filter(i => i.serviceName !== "Pasteado (Lealtad)"));
      setUsingLoyaltyWash(false);
    } else {
      // Add loyalty pasteado as free item
      setTicketItems(prev => [
        ...prev,
        {
          serviceId: 'loyalty-free',
          serviceName: "Pasteado (Lealtad)",
          vehicleTypeId: selectedVehicleId || 0,
          vehicleLabel: "🎁 Gratis",
          price: 0,
          discountPercent: 0,
        },
      ]);
      setUsingLoyaltyWash(true);
      showToast("🎁 Pasteado gratis aplicado al ticket");
    }
  };

  // Auto-select vehicle type when customer with a SINGLE membership is selected
  // Don't auto-select if multiple memberships with different vehicle types
  useEffect(() => {
    if (hasActiveMembership && activeMembershipVehicleTypeIds.length === 1 && !selectedVehicleId) {
      setSelectedVehicleId(activeMembershipVehicleTypeIds[0]);
    }
  }, [hasActiveMembership, activeMembershipVehicleTypeIds.length]);

  useTicketRefresh(loadRecent);

  const handlePaymentComplete = async (paymentData: any) => {
    // Guarda sincrónica con ref (previene race condition de doble-click)
    if (isProcessingSaleRef.current) return;
    isProcessingSaleRef.current = true;
    setIsProcessingSale(true);

    console.log("[POS] handlePaymentComplete:", paymentData, "Exchange Rate:", exchangeRate);
    try {
      if (ticketItems.length === 0 || !user) return;

      const homeItems = ticketItems.filter(i => !i.businessLine || i.businessLine === "car_wash");
      const firstItem = homeItems[0];
      const redemption = homeItems.find(i => i.isLoyaltyRedemption && i.loyaltyRewardId);
      if (!firstItem || !customer) throw new Error("Selecciona un cliente y un servicio de autolavado");
      const payload = {
        customer_id: Number(customer.id), vehicle_plate: customer.plate || "",
        vehicle_type_id: firstItem.vehicleTypeId || null,
        membership_id: selectedMembershipId, reward_id: redemption?.loyaltyRewardId || null,
        loyalty_original_amount: redemption?.loyaltyOriginalPrice || 0,
        use_legacy_reward: usingLoyaltyWash, exchange_rate: exchangeRate, payment: paymentData,
        items: ticketItems.filter(i => i.serviceId !== "loyalty-free").map(i => ({
          service_id: typeof i.serviceId === "number" ? i.serviceId : null,
          service_name: i.serviceName, price: i.price, discount_percent: i.discountPercent,
          business_line: i.businessLine || "car_wash", is_loyalty_redemption: !!i.isLoyaltyRedemption,
        })),
      };
      const { data, error } = await (supabase as any).rpc("complete_car_wash_sale", {
        p_request_id: saleRequestId.current, p_payload: payload,
      });
      if (error) throw error;
      if (!data?.success || !data.ticket) throw new Error(data?.error || "No se pudo registrar la venta");
      const ticket = data.ticket;
      await invalidateTicketData(queryClient);
      if (data.rewards_earned?.length) {
        const names = [...new Set(data.rewards_earned.map((r: any) => r.reward_name))].join(", ");
        setTimeout(() => showToast(`🎁 ¡Premio ganado! ${names}`, "success"), 1000);
      }

      setLastTicket({
        ...ticket,
        business_line: "car_wash",
        customer,
        items: ticketItems,
        subtotal,
        discount: totalDiscount,
        payment: paymentData,
        settings,
      });
      setShowPayment(false);
      setShowPrint(true);
      showToast("Venta registrada correctamente");
      loadRecent();
      newTicket();
    } catch (err: any) {
      showToast(err.message || "Error al registrar venta", "error");
    } finally {
      isProcessingSaleRef.current = false;
      setIsProcessingSale(false);
    }
  };

  return (
    <div className="flex flex-col lg:flex-row h-full w-full relative">
      {/* Left: Recent */}
      <div className="hidden xl:flex flex-col w-72 border-r border-border bg-card/50 overflow-auto">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h3 className="font-bold text-foreground text-sm">
            <i className="fa-solid fa-clock-rotate-left mr-2 text-secondary" />Recientes
          </h3>
          <button onClick={loadRecent} className="touch-btn text-xs text-accent hover:underline">Cargar</button>
        </div>
        <div className="flex-1 overflow-auto">
          {recentTickets.length === 0 && (
            <div className="text-center py-8 text-muted-foreground text-xs">
              <i className="fa-solid fa-clock text-2xl mb-2 opacity-30" />
              <p>Click "Cargar" para ver tickets</p>
            </div>
          )}
          {recentTickets.map((t: any) => (
            <div key={t.id} className="px-4 py-3 border-b border-border/50 hover:bg-muted/30 transition-colors">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-xs text-foreground">{t.ticket_number}</p>
                <span className={`text-xs px-2 py-0.5 rounded-full ${t.status === "paid" ? "bg-accent/20 text-accent" : "bg-muted text-muted-foreground"}`}>
                  {t.status === "paid" ? "Pagado" : t.status}
                </span>
              </div>
              <div className="flex items-center justify-between mt-1">
                <p className="text-xs text-secondary">{(t.vehicle_types as any)?.name || ""}</p>
                <p className="font-bold text-sm text-primary">C${Number(t.total).toFixed(0)}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Center: Vehicle + Service selection */}
      <div className="flex-1 flex flex-col overflow-auto pb-24 lg:pb-0">

        {/* Vehicle types */}
        <div className="p-4 border-b border-border">
          <p className="text-sm font-semibold text-foreground mb-3">
            <i className="fa-solid fa-car mr-2 text-secondary" />Tipo de vehículo
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7 gap-3">
            {!vehicleTypes ? (
              <div className="col-span-full text-center py-4"><i className="fa-solid fa-spinner fa-spin text-secondary" /></div>
            ) : vehicleTypes.map((vt) => {
              const isMembershipRestricted = selectedMembership && selectedMembership.vehicle_type_id !== vt.id;
              const isDisabled = isMembershipRestricted;
              return (
                <button
                  key={vt.id}
                  onClick={() => !isDisabled && setSelectedVehicleId(vt.id)}
                  disabled={isDisabled}
                  className={`vehicle-card h-24 transition-all duration-200 ${!isDisabled ? 'hover:scale-105 active:scale-95' : 'opacity-40 cursor-not-allowed'} ${selectedVehicleId === vt.id ? "vehicle-card-active ring-2 ring-primary" : ""}`}
                >
                  <i className={`fa-solid ${vt.icon} text-3xl ${selectedVehicleId === vt.id ? "text-brick-red" : "text-secondary"} mb-2`} />
                  <p className="text-sm font-semibold text-foreground">{vt.name}</p>
                  {selectedVehicleId === vt.id && (
                    <i className="fa-solid fa-circle-check text-brick-red text-base mt-1" />
                  )}
                  {isDisabled && isMembershipRestricted && (
                    <p className="text-xs text-destructive mt-1">
                      <i className="fa-solid fa-lock" />
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Services grid */}
        <div className="p-4 flex-1">
          <div className="flex justify-between items-center mb-3">
            <p className="text-sm font-semibold text-foreground">
              <i className="fa-solid fa-list-check mr-2 text-secondary" />Servicios
            </p>
            {selectedVehicleId > 0 && !selectedMembership && (
              <button
                type="button"
                onClick={() => {
                  setCustomConcept("");
                  setCustomAmount("");
                  setShowCustomChargeModal(true);
                }}
                className="touch-btn text-xs px-3 py-1.5 rounded-lg bg-accent/10 text-accent hover:bg-accent/20 transition-all font-semibold flex items-center gap-1"
              >
                <i className="fa-solid fa-plus-circle" /> Cobro Personalizado
              </button>
            )}
          </div>

          {/* Show message when membership is selected */}
          {selectedMembership ? (
            <div className="pos-card p-6 text-center">
              <i className="fa-solid fa-id-card text-4xl text-primary mb-3" />
              <p className="text-lg font-semibold text-foreground mb-2">Membresía Activa</p>
              <p className="text-sm text-secondary">
                El servicio de tu membresía ya está agregado al ticket
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                {selectedMembership.services?.name} - {selectedMembership.vehicle_types?.name}
              </p>
              <p className="text-lg font-bold text-accent mt-3">
                Total: C$0.00
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5 gap-3">
              {!services ? (
                <div className="col-span-full flex items-center justify-center py-12 text-muted-foreground">
                  <i className="fa-solid fa-spinner fa-spin text-2xl mr-3" />
                  <span>Cargando servicios...</span>
                </div>
              ) : !selectedVehicleId ? (
                <div className="col-span-full flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <i className="fa-solid fa-hand-pointer text-4xl mb-3 opacity-30" />
                  <p>Selecciona un tipo de vehículo</p>
                </div>
              ) : (
                services.map((svc: any) => {
                  const priceEntry = svc.service_prices?.find((p: any) => p.vehicle_type_id === selectedVehicleId);
                  if (!priceEntry || Number(priceEntry.price) <= 0) return null;
                  const isSelected = selectedServiceId === svc.id;

                  const eligible = isServiceEligible(svc.id, svc.name);

                  // Block services if customer has membership AND service is not eligible
                  const isServiceNotEligible = hasActiveMembership && !customer?.is_general && !eligible;

                  // Block Nítido when customer has free pasteado available
                  // (Nítido already includes pasteado, so the reward wouldn't make sense)
                  const isNitido = svc.name?.includes('Nítido');
                  const isBlockedByLoyalty = isNitido && loyaltyFreeWashes > 0 && !customer?.is_general;

                  const isDisabled = isServiceNotEligible || isBlockedByLoyalty;

                  return (
                    <button
                      key={svc.id}
                      onClick={() => !isDisabled && setSelectedServiceId(svc.id)}
                      disabled={isDisabled}
                      className={`service-card relative flex flex-col items-center justify-center text-center p-4 min-h-[160px] transition-all duration-200 ${!isDisabled ? 'hover:scale-[1.02] active:scale-95 hover:shadow-lg' : 'opacity-40 cursor-not-allowed'} ${isSelected ? "service-card-active ring-2 ring-primary" : ""}`}
                    >
                      <i className={`fa-solid ${svc.icon || 'fa-car-side'} text-4xl ${isSelected ? 'text-primary' : 'text-secondary'} mb-3`} />
                      <h4 className="font-bold text-sm text-foreground leading-tight w-full truncate">{svc.name}</h4>
                      
                      {isServiceNotEligible && (
                        <p className="text-[10px] text-destructive mt-1 flex items-center justify-center w-full">
                          <i className="fa-solid fa-lock mr-1" /> Solo membresías
                        </p>
                      )}
                      {isBlockedByLoyalty && (
                        <p className="text-[10px] text-amber-600 mt-1 flex items-center justify-center w-full">
                          <i className="fa-solid fa-gift mr-1" /> Usa con Breve
                        </p>
                      )}
                      
                      <p className="text-xs text-secondary mt-1 line-clamp-2 w-full">{svc.description}</p>
                      
                      <div className="mt-auto pt-2 w-full">
                        <p className="text-base font-bold text-primary">C${Number(priceEntry.price).toFixed(0)}</p>
                        <p className="text-[10px] text-secondary">~${(Number(priceEntry.price) / exchangeRate).toFixed(2)} USD</p>
                      </div>
                      
                      {isSelected && <i className="fa-solid fa-circle-check text-brick-red absolute top-3 right-3 text-lg" />}
                    </button>
                  );
                })
              )}
            </div>
          )}

          {selectedServiceId > 0 && selectedVehicleId > 0 && !selectedMembership && (
            <div className="mt-4 flex justify-center">
              <button onClick={addToTicket} className="touch-btn bg-accent text-accent-foreground px-6 py-3 rounded-xl font-semibold flex items-center gap-2 transition-all duration-200 hover:scale-105 active:scale-95">
                <i className="fa-solid fa-plus" />Agregar al ticket
              </button>
            </div>
          )}

          {/* Extras Section */}
          {selectedVehicleId > 0 && !selectedMembership && extras && extras.length > 0 && (
            <div className="mt-6">
              <p className="text-sm font-semibold text-foreground mb-3">
                <i className="fa-solid fa-star mr-2 text-secondary" />Extras y Servicios Adicionales
              </p>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {extras.map((extra: any) => {
                  const priceEntry = extra.service_prices?.find((p: any) => p.vehicle_type_id === selectedVehicleId);
                  if (!priceEntry || Number(priceEntry.price) <= 0) return null;
                  return (
                    <button
                      key={extra.id}
                      onClick={() => addExtraToTicket(extra)}
                      className="service-card relative flex flex-col items-center justify-center text-center p-4 min-h-[140px] transition-all duration-200 hover:scale-[1.02] active:scale-95 hover:shadow-md hover:border-accent/50"
                    >
                      <i className={`fa-solid ${extra.icon || 'fa-plus-circle'} text-3xl text-accent mb-3`} />
                      <h4 className="font-bold text-sm text-foreground leading-tight w-full truncate">{extra.name}</h4>
                      <p className="text-xs text-secondary mt-1 line-clamp-2 w-full">{extra.description}</p>
                      <div className="mt-auto pt-2 w-full">
                        <p className="text-base font-bold text-primary">C${Number(priceEntry.price).toFixed(0)}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Barbershop Services Section (cross-sell) */}
          {!selectedMembership && barbershopVisible && barberServices && barberServices.length > 0 && (
            <div className="mt-6">
              <button
                type="button"
                onClick={() => setShowBarberSection(!showBarberSection)}
                className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border-2 border-amber-200/60 dark:border-amber-700/40 hover:border-amber-400 transition-all"
              >
                <span className="text-sm font-semibold text-amber-800 dark:text-amber-400 flex items-center gap-2">
                  <i className="fa-solid fa-scissors" /> Servicios de Barbería
                </span>
                <i className={`fa-solid fa-chevron-${showBarberSection ? 'up' : 'down'} text-amber-600 text-xs`} />
              </button>
              {showBarberSection && (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mt-3 animate-scale-in">
                  {barberServices.map((svc: any) => {
                    const price = Number(svc.base_price ?? 0);
                    if (price <= 0) return null;
                    return (
                      <button
                        key={`barber-${svc.id}`}
                        onClick={() => {
                          setTicketItems(prev => [
                            ...prev,
                            {
                              serviceId: svc.id,
                              serviceName: `✂ ${svc.name}`,
                              vehicleTypeId: 0,
                              vehicleLabel: "Barbería",
                              price,
                              discountPercent: 0,
                              businessLine: "barbershop" as const,
                            },
                          ]);
                          showToast(`✂ ${svc.name} agregado`);
                        }}
                        className="service-card relative flex flex-col items-center justify-center text-center p-4 min-h-[140px] transition-all duration-200 hover:scale-[1.02] active:scale-95 hover:shadow-md border-amber-200/60 dark:border-amber-700/40 hover:border-amber-400"
                      >
                        <i className={`fa-solid ${svc.icon || 'fa-scissors'} text-3xl text-amber-600 mb-3`} />
                        <h4 className="font-bold text-sm text-foreground leading-tight w-full truncate">{svc.name}</h4>
                        <p className="text-xs text-secondary mt-1 line-clamp-2 w-full">{svc.description}</p>
                        <div className="mt-auto pt-2 w-full">
                          <p className="text-base font-bold text-amber-700 dark:text-amber-400">C${price.toFixed(0)}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Mobile Cart Overlay */}
      {showMobileCart && (
        <div 
          className="fixed inset-0 bg-black/60 z-30 lg:hidden backdrop-blur-sm transition-opacity"
          onClick={() => setShowMobileCart(false)}
        />
      )}

      {/* Right: Ticket summary (Slide-over on mobile) */}
      <div className={`fixed inset-y-0 right-0 z-40 w-full sm:w-96 bg-card lg:bg-card/50 transform transition-transform duration-300 ease-in-out lg:relative lg:translate-x-0 flex flex-col border-l border-border shadow-2xl lg:shadow-none ${showMobileCart ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h3 className="font-bold text-foreground flex items-center gap-2">
            <i className="fa-solid fa-receipt text-secondary" />Ticket actual
          </h3>
          <button 
            className="lg:hidden touch-btn w-10 h-10 flex items-center justify-center rounded-full bg-muted/50 text-foreground hover:bg-muted"
            onClick={() => setShowMobileCart(false)}
          >
            <i className="fa-solid fa-xmark" />
          </button>
        </div>

        {/* Customer section */}
        <div className="px-4 py-3 border-b border-border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-secondary">Cliente</p>
              <p className="font-semibold text-foreground text-sm">{customer?.name || "Sin seleccionar"}</p>
              {customer?.plate && <p className="text-xs text-muted-foreground">Placa: {customer.plate}</p>}
            </div>
            <button
              onClick={() => setShowCustomer(true)}
              className="touch-btn px-4 py-3 rounded-lg bg-accent/10 text-accent hover:bg-accent/20 transition-all duration-200 hover:scale-105 active:scale-95"
            >
              <i className="fa-solid fa-user-pen text-lg" />
            </button>
          </div>
        </div>

        {/* Membership Selector */}
        {customer && !customer.is_general && (
          <div className="px-4 py-3 border-b border-border">
            <MembershipSelector
              customerId={customer.id?.toString()}
              selectedServiceId={selectedServiceId}
              selectedVehicleTypeId={selectedVehicleId}
              selectedMembership={selectedMembership}
              onMembershipSelect={(membership) => {
                console.log('[POS] Membership selected:', membership);
                setSelectedMembership(membership);
                setSelectedMembershipId(membership?.id || null);

                if (membership) {
                  console.log('[POS] Membership services:', membership.services);
                  console.log('[POS] Membership vehicle_type_id:', membership.vehicle_type_id);

                  // Auto-select vehicle type from membership
                  if (membership.vehicle_type_id) {
                    setSelectedVehicleId(membership.vehicle_type_id);
                    console.log('[POS] Auto-selected vehicle:', membership.vehicle_type_id);
                  }

                  // Auto-add membership service to ticket with C$0 price
                  const membershipService = membership.services;
                  if (membershipService && membership.vehicle_type_id) {
                    const vt = vehicleTypes?.find((v) => v.id === membership.vehicle_type_id);
                    // -1: descontamos el lavado que se está usando ahora mismo
                    // El ticket se construye ANTES de que recordWash incremente washes_used
                    const washesRemaining = membership.total_washes_allowed - membership.washes_used - 1;

                    // Clear existing items and add membership service
                    setTicketItems([{
                      serviceId: membershipService.id,
                      serviceName: `${membershipService.name} (Membresía - ${Math.max(0, washesRemaining)} lavados restantes)`,
                      vehicleTypeId: membership.vehicle_type_id,
                      vehicleLabel: vt?.name || "",
                      price: 0, // Free - already paid in membership
                      discountPercent: 0,
                    }]);

                    console.log('[POS] Added membership service to ticket');
                    showToast("Servicio de membresía agregado - C$0.00");
                  } else {
                    console.error('[POS] Cannot add service - membershipService:', membershipService, 'vehicle_type_id:', membership.vehicle_type_id);
                  }
                } else {
                  // When deselecting membership, clear ticket items
                  setTicketItems([]);
                  console.log('[POS] Membership deselected, cleared ticket');
                }
              }}
            />
          </div>
        )}

        {/* Loyalty rewards selector — same area as membership */}
        {customer && !customer.is_general && !selectedMembership && (
          <LoyaltySelector
            customerId={customerId}
            customerName={customer.name}
            selectedVehicleId={selectedVehicleId}
            vehicleLabel={vehicleTypes?.find(v => v.id === selectedVehicleId)?.name ?? ""}
            services={allServicesAndExtras.map((s: any) => ({ id: s.id, name: s.name }))}
            servicePrices={allServicePrices}
            selectedReward={selectedLoyaltyReward}
            onRewardSelect={(reward, loyaltyItem) => {
              setSelectedLoyaltyReward(reward);
              if (reward && loyaltyItem) {
              // Replace any previous loyalty-reward item; discountPercent comes from REWARD_DISCOUNT_MAP via LoyaltySelector
                setTicketItems(prev => [
                  ...prev.filter(i => i.serviceId !== 'loyalty-reward' && !i.isLoyaltyRedemption),
                  {
                    serviceId: loyaltyItem.serviceId,
                    serviceName: loyaltyItem.serviceName,
                    vehicleTypeId: loyaltyItem.vehicleTypeId,
                    vehicleLabel: loyaltyItem.vehicleLabel,
                    price: loyaltyItem.price,
                    discountPercent: loyaltyItem.discountPercent, // 100 = free, 40 = 40% off
                    isLoyaltyRedemption: true,
                    loyaltyRewardId: loyaltyItem.loyaltyRewardId,
                    loyaltyRewardName: loyaltyItem.loyaltyRewardName,
                    loyaltyOriginalPrice: loyaltyItem.loyaltyOriginalPrice,
                  },
                ]);
                showToast(`🎁 Premio aplicado: ${reward.reward_name}`);
              } else {
                // Remove loyalty item from ticket
                setTicketItems(prev => prev.filter(i => !i.isLoyaltyRedemption));
              }
            }}
          />
        )}

        {/* Items */}
        <div className="flex-1 overflow-auto p-4 space-y-2">
          {ticketItems.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <i className="fa-solid fa-receipt text-4xl mb-3 opacity-30" />
              <p className="text-sm">Selecciona un servicio y vehículo</p>
            </div>
          )}
          {ticketItems.map((item, idx) => (
            <div key={idx} className={`pos-card p-3 space-y-2 animate-scale-in ${item.serviceId === 'loyalty-free' ? 'border-2 border-green-500/40 bg-green-50/30' : ''}`}>
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <p className="font-semibold text-sm text-foreground">
                    {item.serviceId === 'loyalty-free' && <i className="fa-solid fa-gift text-green-600 mr-1" />}
                    {item.serviceName}
                  </p>
                  <p className="text-xs text-secondary">{item.vehicleLabel}</p>
                </div>
                <p className={`font-bold ${item.serviceId === 'loyalty-free' ? 'text-green-600' : 'text-foreground'}`}>
                  {item.serviceId === 'loyalty-free' ? 'GRATIS' : `C$${item.price.toFixed(0)}`}
                </p>
                <button onClick={() => {
                  if (item.serviceId === 'loyalty-free') {
                    setUsingLoyaltyWash(false);
                  }
                  removeItem(idx);
                }} className="touch-btn p-1 text-destructive hover:bg-destructive/10 rounded">
                  <i className="fa-solid fa-trash-can text-sm" />
                </button>
              </div>
              {/* Discount — loyalty items are read-only; normal services are editable */}
              {item.serviceId !== 'loyalty-free' && (
                item.isLoyaltyRedemption ? (
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-muted-foreground flex-1">Descuento Lealtad:</label>
                    <span className="px-2 py-1 rounded text-xs font-bold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
                      {item.discountPercent === 100 ? "GRATIS (100%)" : `${item.discountPercent}% desc.`}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-muted-foreground flex-1">Descuento:</label>
                    <input
                      type="number"
                      value={item.discountPercent || 0}
                      onChange={(e) => {
                        const newDiscountPercent = Math.max(0, Math.min(100, parseFloat(e.target.value) || 0));
                        setTicketItems(prev => prev.map((it, i) => i === idx ? { ...it, discountPercent: newDiscountPercent } : it));
                      }}
                      className="w-24 px-2 py-1 bg-background border border-border rounded text-xs text-right"
                      min={0}
                      max={100}
                      step={1}
                    />
                    <span className="text-xs text-muted-foreground">%</span>
                  </div>
                )
              )}
            </div>
          ))}

          {/* Loyalty Free Wash Button */}
          {loyaltyFreeWashes > 0 && !usingLoyaltyWash && ticketItems.length > 0 && !selectedMembership && !customer?.is_general && (
            <button
              onClick={toggleLoyaltyWash}
              className="w-full touch-btn p-3 rounded-xl border-2 border-dashed border-green-500/50 bg-green-500/10 text-green-700 font-semibold flex items-center justify-center gap-2 hover:bg-green-500/20 transition-all"
            >
              <i className="fa-solid fa-gift text-lg" />
              Aplicar Pasteado Gratis ({loyaltyFreeWashes} disponible{loyaltyFreeWashes > 1 ? 's' : ''})
            </button>
          )}

          {/* Loyalty progress indicator */}
          {customer && !customer.is_general && !selectedMembership && ticketItems.length > 0 && (
            <div className="text-center text-xs text-muted-foreground bg-muted/30 rounded-lg p-2 mt-2">
              <i className="fa-solid fa-star mr-1" />
              Progreso lealtad: {loyaltyProgress}/8 servicios
              {loyaltyFreeWashes > 0 && <span className="ml-2 font-bold text-green-600">🎁 {loyaltyFreeWashes} pasteado{loyaltyFreeWashes > 1 ? 's' : ''} gratis</span>}
            </div>
          )}
        </div>

        {/* Totals + Cobrar */}
        <div className="p-4 border-t border-border space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-secondary">Subtotal</span>
            <span className="text-foreground">C${subtotal.toFixed(2)}</span>
          </div>
          {totalDiscount > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-secondary">Descuento</span>
              <span className="text-destructive">-C${totalDiscount.toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between text-lg font-bold pt-2 border-t border-border">
            <span className="text-foreground">TOTAL</span>
            <div className="text-right">
              <p className="text-primary">C${total.toFixed(2)}</p>
              <p className="text-xs text-secondary font-normal">~${(total / exchangeRate).toFixed(2)} USD</p>
            </div>
          </div>
          <button
            onClick={() => {
              if (ticketItems.length === 0) return;
              // Loyalty v3: check if any ticket item is blocked by an available reward
              if (customerId) {
                const realItems = ticketItems.filter(
                  i => i.serviceId !== 'loyalty-free' && i.serviceId !== 'loyalty-reward'
                );
                for (const item of realItems) {
                  // Skip if reward already applied for this item type
                  if (selectedLoyaltyReward) continue;
                  const blocking = findBlockingReward(availableRewardsV3, item.serviceName);
                  if (blocking) {
                    setRewardBlockModal({ show: true, rewardId: blocking.id, serviceName: item.serviceName });
                    return; // blocked — do NOT open payment modal
                  }
                }
              }
              setShowPayment(true);
            }}
            disabled={ticketItems.length === 0}
            className="btn-cobrar w-full h-16 flex items-center justify-center gap-3 disabled:opacity-50 text-xl font-bold transition-all duration-200 hover:scale-[1.02] active:scale-95 disabled:hover:scale-100"
          >
            <i className="fa-solid fa-money-bill-wave text-2xl" />COBRAR
          </button>
        </div>
      </div>

      {/* Modals */}
      {showPayment && (
        <PaymentModal
          total={total}
          exchangeRate={exchangeRate}
          onClose={() => setShowPayment(false)}
          onConfirm={handlePaymentComplete}
        />
      )}
      {showCustomer && (
        <CustomerModal
          current={customer as any}
          onSelect={(c: any) => { setCustomer(c as Customer); setShowCustomer(false); }}
          onClose={() => setShowCustomer(false)}
        />
      )}
      {/* Loyalty v3: Reward Block Modal */}
      {rewardBlockModal.show && (() => {
        const blockingReward = availableRewardsV3.find(r => r.id === rewardBlockModal.rewardId);
        if (!blockingReward) return null;
        return (
          <RewardBlockModal
            reward={blockingReward}
            serviceName={rewardBlockModal.serviceName}
            isAdmin={isAdmin}
            isOwner={isOwner}
            onRedeem={() => {
              setRewardBlockModal({ show: false, rewardId: null, serviceName: "" });
              applyRewardToTicket(blockingReward);
            }}
            onCancel={() => setRewardBlockModal({ show: false, rewardId: null, serviceName: "" })}
            onAdminOverride={() => {
              setRewardBlockModal({ show: false, rewardId: null, serviceName: "" });
              setShowPayment(true);
            }}
          />
        );
      })()}
      {showCustomChargeModal && (
        <div className="modal-overlay" onClick={() => setShowCustomChargeModal(false)}>
          <div className="modal-content animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-foreground">
                <i className="fa-solid fa-plus-circle mr-2 text-secondary" />Cobro Personalizado
              </h2>
              <button 
                onClick={() => setShowCustomChargeModal(false)} 
                className="touch-btn p-2 text-muted-foreground"
              >
                <i className="fa-solid fa-xmark text-xl" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-foreground mb-1 block">Concepto / Descripción</label>
                <input 
                  type="text" 
                  value={customConcept} 
                  onChange={(e) => setCustomConcept(e.target.value)} 
                  className="input-touch" 
                  placeholder="Ej: Lavado especial de alfombras"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-foreground mb-1 block">Monto (C$)</label>
                <input 
                  type="number" 
                  value={customAmount} 
                  onChange={(e) => setCustomAmount(e.target.value)} 
                  className="input-touch" 
                  placeholder="Ej: 150"
                  min="0.01"
                  step="0.01"
                  required
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCustomChargeModal(false)}
                  className="touch-btn flex-1 py-3 rounded-xl border border-border text-foreground font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!customConcept.trim()) {
                      showToast("Por favor, ingresa el concepto", "error");
                      return;
                    }
                    const amt = parseFloat(customAmount);
                    if (isNaN(amt) || amt <= 0) {
                      showToast("Por favor, ingresa un monto válido mayor a 0", "error");
                      return;
                    }
                    const vt = vehicleTypes?.find((v) => v.id === selectedVehicleId);
                    setTicketItems((prev) => [
                      ...prev,
                      {
                        serviceId: null,
                        serviceName: customConcept.trim(),
                        vehicleTypeId: selectedVehicleId,
                        vehicleLabel: vt?.name || "",
                        price: amt,
                        discountPercent: 0,
                      },
                    ]);
                    setShowCustomChargeModal(false);
                    showToast("Cobro personalizado agregado");
                  }}
                  className="btn-cobrar flex-1 flex items-center justify-center gap-2"
                >
                  <i className="fa-solid fa-check" /> Agregar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {showPrint && lastTicket && (
        <TicketPrint
          ticket={lastTicket}
          onClose={() => {
            setShowPrint(false);
            newTicket();
          }}
        />
      )}

      {toast && (
        <div
          className={toast.type === "success" ? "toast-success" : "toast-error"}
        >
          <i
            className={`fa-solid ${toast.type === "success" ? "fa-circle-check" : "fa-circle-exclamation"
              } mr-2`}
          />
          {toast.msg}
        </div>
      )}

      {/* Mobile Sticky Footer (only visible when cart is hidden) */}
      {!showMobileCart && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-card/90 backdrop-blur-lg border-t border-border z-20 lg:hidden pb-safe">
          <button 
            onClick={() => setShowMobileCart(true)} 
            className="w-full btn-cobrar flex justify-between items-center h-14 text-lg shadow-xl"
          >
            <span className="flex items-center font-semibold">
              <i className="fa-solid fa-cart-shopping mr-3" />
              Ver Ticket
              {ticketItems.length > 0 && (
                <span className="ml-2 bg-white text-primary text-sm px-2 py-0.5 rounded-full font-bold">
                  {ticketItems.length}
                </span>
              )}
            </span>
            <span className="font-bold">C${total.toFixed(0)}</span>
          </button>
        </div>
      )}
    </div>
  );
}
