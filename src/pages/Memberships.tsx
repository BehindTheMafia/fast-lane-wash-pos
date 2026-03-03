import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useMemberships } from "@/hooks/useMemberships";
import { useBusinessSettings } from "@/hooks/useBusinessSettings";
import MembershipCard from "@/components/memberships/MembershipCard";
import MembershipRenewalModal from "@/components/memberships/MembershipRenewalModal";
import PaymentModal from "@/components/pos/PaymentModal";
import TicketPrint from "@/components/pos/TicketPrint";

type FilterType = 'all' | 'active' | 'expired';

const vehicleTypes = [
  { id: 1, label: "Moto", icon: "fa-motorcycle" },
  { id: 2, label: "Sedán", icon: "fa-car" },
  { id: 3, label: "SUV", icon: "fa-car-side" },
  { id: 4, label: "Pick up", icon: "fa-truck-pickup" },
  { id: 5, label: "Microbús", icon: "fa-van-shuttle" },
  { id: 6, label: "Taxi", icon: "fa-taxi" },
];

export default function Memberships() {
  const [plans, setPlans] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAssign, setShowAssign] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [showPrint, setShowPrint] = useState(false);
  const [lastTicket, setLastTicket] = useState<any>(null);
  const [selectedCustomer, setSelectedCustomer] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedService, setSelectedService] = useState<number>(1); // Default to Lavado Breve
  const [selectedVehicleType, setSelectedVehicleType] = useState<number>(2);
  const [membershipBasePrice, setMembershipBasePrice] = useState(0);
  const [discountPercent, setDiscountPercent] = useState<number>(0);
  const [filter, setFilter] = useState<FilterType>('active');
  const [renewingMembership, setRenewingMembership] = useState<any>(null);
  const [toast, setToast] = useState<string | null>(null);

  const { user } = useAuth();
  const { data: settings } = useBusinessSettings();
  const { memberships: allMemberships, renewMembership, createMembership, isRenewing, getMembershipWithStatus } = useMemberships();

  const exchangeRate = settings?.exchange_rate || 36.5;

  // Calculate final price after discount
  const discountAmount = membershipBasePrice * (discountPercent / 100);
  const membershipPrice = Math.max(0, membershipBasePrice - discountAmount);

  // Filter customers by search
  const filteredCustomers = customers.filter(c =>
    c.name.toLowerCase().includes(customerSearch.toLowerCase())
  );

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const [{ data: p }, { data: c }, { data: s }] = await Promise.all([
      supabase.from("membership_plans").select("*").eq("is_active", true),
      supabase.from("customers").select("id, name, phone, plate").eq("is_general", false).order("name"),
      supabase.from("services").select("id, name, service_prices(price, vehicle_type_id)").eq("is_active", true),
    ]);

    // Filter to only show the two eligible services for memberships
    const eligibleServices = s?.filter((svc: any) =>
      svc.id === 1 || svc.id === 2  // Lavado Breve (1) and Lavado Nítido (2)
    );

    setPlans(p || []);
    setCustomers(c || []);
    setServices(eligibleServices || []);
    setLoading(false);
  };

  // Calculate membership price when service or vehicle type changes
  useEffect(() => {
    if (selectedService && selectedVehicleType) {
      const service = services.find(s => s.id === selectedService);
      const priceEntry = service?.service_prices?.find((p: any) => p.vehicle_type_id === selectedVehicleType);
      if (priceEntry) {
        const basePrice = Number(priceEntry.price);
        // Package price: (price per wash × 8) × 0.64 (36% discount)
        const packagePrice = (basePrice * 8) * 0.64;
        setMembershipBasePrice(packagePrice);
      }
    }
  }, [selectedService, selectedVehicleType, services]);

  const handleProceedToPayment = () => {
    if (!selectedCustomer || membershipPrice <= 0) return;
    setShowPayment(true);
  };

  const handlePaymentComplete = async (paymentData: any) => {
    try {
      if (!user) {
        showToastMsg("Usuario no autenticado");
        return;
      }

      if (!selectedCustomer) {
        showToastMsg("Por favor selecciona un cliente");
        return;
      }

      if (!selectedService) {
        showToastMsg("Por favor selecciona un servicio");
        return;
      }

      if (!selectedVehicleType) {
        showToastMsg("Por favor selecciona un tipo de vehículo");
        return;
      }

      if (membershipPrice <= 0) {
        showToastMsg("El precio de la membresía no es válido");
        return;
      }

      // Use the first available plan (Combo 8 Lavados)
      const planToUse = plans && plans.length > 0 ? plans[0]?.id : null;

      if (!planToUse) {
        showToastMsg("No hay planes disponibles. Por favor recarga la página.");
        return;
      }

      // Generate ticket number
      const ticketNumber = `M-${Date.now().toString(36).toUpperCase()}`;

      // Get customer data for plate and name info
      const customerObj = customers.find(c => c.id === Number(selectedCustomer));
      const customerName = customerObj?.name || "Cliente";
      const customerPhone = customerObj?.phone || "";
      const customerPlate = customerObj?.plate || "";

      // Get service and vehicle type names
      const serviceObj = services.find(s => s.id === selectedService);
      const serviceName = serviceObj?.name || "Servicio";
      const vehicleObj = vehicleTypes.find(v => v.id === selectedVehicleType);
      const vehicleLabel = vehicleObj?.label || "Vehículo";

      // Get plan details
      const planObj = plans.find(p => p.id === planToUse);
      const planName = planObj?.name || "Membresía";
      const washCount = planObj?.wash_count || 8;

      // Create ticket for membership sale
      const { data: ticket, error: ticketErr } = await supabase
        .from("tickets")
        .insert({
          ticket_number: ticketNumber,
          user_id: user.id,
          customer_id: Number(selectedCustomer),
          vehicle_type_id: selectedVehicleType,
          vehicle_plate: customerPlate,
          total: membershipPrice,
          status: "paid",
        } as any)
        .select()
        .single();

      if (ticketErr) {
        console.error("Error creating ticket:", ticketErr);
        throw ticketErr;
      }

      // Create payment record
      const { error: paymentErr } = await supabase.from("payments").insert({
        ticket_id: (ticket as any).id,
        amount: membershipPrice,
        currency: paymentData.currency,
        payment_method: paymentData.method,
        amount_received: paymentData.received,
        change_amount: paymentData.change,
        exchange_rate: exchangeRate,
      } as any);

      if (paymentErr) {
        console.error("Error creating payment:", paymentErr);
        throw paymentErr;
      }

      // Create ticket_item for the service (so it shows in reports)
      // Store the BASE price (before discount) so Reports can calculate the discount
      const { error: ticketItemErr } = await supabase.from("ticket_items").insert({
        ticket_id: (ticket as any).id,
        service_id: selectedService,
        price: membershipBasePrice,
      } as any);

      if (ticketItemErr) {
        console.error("Error creating ticket item:", ticketItemErr);
        throw ticketItemErr;
      }

      // Create membership
      await createMembership({
        customerId: Number(selectedCustomer),
        planId: Number(planToUse),
        vehicleTypeId: selectedVehicleType,
        serviceId: selectedService,
      });

      // Build ticket data for printing
      const ticketForPrint = {
        ...(ticket as any),
        ticket_number: ticketNumber,
        created_at: (ticket as any).created_at || new Date().toISOString(),
        customer: {
          name: customerName,
          plate: customerPlate,
          phone: customerPhone,
          is_general: false,
        },
        items: [
          {
            serviceName: `MEMBRESÍA: ${planName}`,
            vehicleLabel: `${vehicleLabel} - ${serviceName}`,
            price: membershipBasePrice,
          },
          ...(discountPercent > 0 ? [{
            serviceName: `Descuento (${discountPercent}%)`,
            vehicleLabel: "",
            price: -discountAmount,
          }] : []),
        ],
        subtotal: membershipBasePrice,
        discount: discountAmount,
        total: membershipPrice,
        payment: paymentData,
        settings,
        // Extra membership info for ticket
        membershipInfo: {
          planName,
          washCount,
          serviceName,
          vehicleLabel,
          discountPercent,
        },
      };

      setLastTicket(ticketForPrint);
      setShowPayment(false);
      setShowAssign(false);
      setShowPrint(true);

      // Reset form
      setSelectedCustomer("");
      setCustomerSearch("");
      setSelectedService(1);
      setSelectedVehicleType(2);
      setDiscountPercent(0);
      showToastMsg("Membresía vendida y asignada correctamente");
    } catch (error: any) {
      console.error('Error completing membership sale:', error);
      showToastMsg(error.message || "Error al procesar la venta");
    }
  };

  const handleRenew = async (membershipId: string, vehicleTypeId: number) => {
    try {
      await renewMembership({ membershipId: Number(membershipId), vehicleTypeId });
      setRenewingMembership(null);
      showToastMsg("Membresía renovada correctamente");
    } catch (error: any) {
      console.error('Error renewing membership:', error);
      showToastMsg(error.message || "Error al renovar membresía");
    }
  };

  const showToastMsg = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  // Filter memberships based on selected filter
  const filteredMemberships = allMemberships?.filter((m) => {
    const { status } = getMembershipWithStatus(m);
    const washesExhausted = m.washes_used >= m.total_washes_allowed;

    if (filter === 'active') {
      return (status === 'active' || status === 'expiring_soon') && !washesExhausted && m.active;
    }
    if (filter === 'expired') {
      return status === 'expired' || washesExhausted || !m.active;
    }
    return true;
  }) || [];

  if (loading) return <div className="flex items-center justify-center h-full"><i className="fa-solid fa-spinner fa-spin text-3xl text-accent" /></div>;

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-foreground">
          <i className="fa-solid fa-id-card mr-3 text-secondary" />Membresías
        </h2>
        <button onClick={() => setShowAssign(true)} className="touch-btn bg-accent text-accent-foreground px-4 py-2 rounded-xl font-semibold flex items-center gap-2">
          <i className="fa-solid fa-plus" />Vender Membresía
        </button>
      </div>

      {/* Plans */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {plans.map((p) => (
          <div key={p.id} className="pos-card p-6">
            <h3 className="font-bold text-lg text-foreground">{p.name}</h3>
            <p className="text-sm text-secondary mt-1">{p.description}</p>
            <div className="mt-3 flex flex-wrap gap-2 text-sm">
              <span className="px-3 py-1 rounded-full bg-accent/10 text-accent font-semibold">
                <i className="fa-solid fa-tag mr-1" />
                {p.discount_percent}% desc. en total
              </span>
              <span className="px-3 py-1 rounded-full bg-primary/10 text-primary font-semibold">
                <i className="fa-solid fa-droplet mr-1" />
                {p.wash_count} lavados
              </span>
              <span className="px-3 py-1 rounded-full bg-secondary/10 text-secondary font-semibold">
                <i className="fa-solid fa-calendar-days mr-1" />
                {p.duration_days || 28} días
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setFilter('all')}
          className={`px-4 py-2 rounded-lg font-semibold text-sm transition-colors ${filter === 'all' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
        >
          Todas
        </button>
        <button
          onClick={() => setFilter('active')}
          className={`px-4 py-2 rounded-lg font-semibold text-sm transition-colors ${filter === 'active' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
        >
          Activas
        </button>
        <button
          onClick={() => setFilter('expired')}
          className={`px-4 py-2 rounded-lg font-semibold text-sm transition-colors ${filter === 'expired' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
        >
          Expiradas
        </button>
      </div>

      {/* Memberships Grid */}
      <div>
        <h3 className="font-bold text-foreground mb-3">
          <i className="fa-solid fa-users mr-2 text-secondary" />
          Membresías {filter === 'all' ? '' : filter === 'active' ? 'activas' : 'expiradas'}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredMemberships.map((m) => (
            <MembershipCard
              key={m.id}
              membership={m}
              onRenew={(id) => {
                const membership = allMemberships?.find((mem) => mem.id === Number(id));
                if (membership) {
                  setRenewingMembership({
                    id: membership.id,
                    customer_name: membership.customers?.name || '',
                    plan_name: membership.membership_plans?.name || '',
                    vehicle_type_id: membership.vehicle_type_id,
                  });
                }
              }}
            />
          ))}
          {filteredMemberships.length === 0 && (
            <div className="col-span-full text-center py-12 text-muted-foreground">
              <i className="fa-solid fa-inbox text-4xl mb-3 opacity-30" />
              <p>No hay membresías {filter === 'active' ? 'activas' : filter === 'expired' ? 'expiradas' : ''}</p>
            </div>
          )}
        </div>
      </div>

      {/* Assign/Sell modal */}
      {showAssign && (
        <div className="modal-overlay" onClick={() => setShowAssign(false)}>
          <div className="modal-content animate-scale-in max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-foreground">
                <i className="fa-solid fa-id-card mr-2 text-secondary" />Vender Membresía
              </h3>
              <button onClick={() => setShowAssign(false)} className="touch-btn p-2 hover:bg-muted rounded-lg">
                <i className="fa-solid fa-times text-muted-foreground" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-semibold text-foreground block mb-1">Cliente</label>
                <input
                  type="text"
                  value={customerSearch}
                  onChange={(e) => {
                    setCustomerSearch(e.target.value);
                    setSelectedCustomer(""); // Reset selection when typing
                  }}
                  placeholder="Buscar cliente..."
                  className="input-touch"
                />
                {customerSearch && !selectedCustomer && filteredCustomers.length > 0 && (
                  <div className="mt-2 max-h-48 overflow-y-auto border border-border rounded-lg bg-background">
                    {filteredCustomers.map((c: any) => (
                      <button
                        key={c.id}
                        onClick={() => {
                          setSelectedCustomer(c.id.toString());
                          setCustomerSearch(c.name);
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-muted transition-colors text-sm border-b border-border last:border-b-0"
                      >
                        <i className="fa-solid fa-user mr-2 text-secondary" />
                        {c.name}
                        {c.plate && <span className="ml-2 text-xs text-muted-foreground">({c.plate})</span>}
                      </button>
                    ))}
                  </div>
                )}
                {selectedCustomer && customerSearch && (
                  <div className="mt-2 text-sm text-accent flex items-center">
                    <i className="fa-solid fa-circle-check mr-2" />
                    Cliente seleccionado: {customerSearch}
                  </div>
                )}
              </div>
              <div>
                <label className="text-sm font-semibold text-foreground block mb-1">Servicio</label>
                <select value={selectedService} onChange={(e) => setSelectedService(Number(e.target.value))} className="input-touch">
                  {services.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm font-semibold text-foreground block mb-2">Tipo de vehículo</label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {vehicleTypes.map((vt) => (
                    <button
                      key={vt.id}
                      onClick={() => setSelectedVehicleType(vt.id)}
                      className={`p-3 rounded-lg border-2 transition-all ${selectedVehicleType === vt.id
                        ? 'border-primary bg-primary/10'
                        : 'border-border hover:border-primary/50'
                        }`}
                    >
                      <i className={`fa-solid ${vt.icon} text-2xl ${selectedVehicleType === vt.id ? 'text-primary' : 'text-secondary'
                        }`} />
                      <p className="text-xs font-semibold text-foreground mt-1">{vt.label}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Discount Input */}
              {membershipBasePrice > 0 && (
                <div>
                  <label className="text-sm font-semibold text-foreground block mb-1">
                    <i className="fa-solid fa-percent mr-1 text-secondary" />
                    Descuento personalizado
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={discountPercent || ""}
                      onChange={(e) => {
                        const val = Math.max(0, Math.min(100, parseFloat(e.target.value) || 0));
                        setDiscountPercent(val);
                      }}
                      className="input-touch text-center text-lg font-bold flex-1"
                      placeholder="0"
                      min={0}
                      max={100}
                      step={1}
                    />
                    <span className="text-lg font-bold text-muted-foreground">%</span>
                  </div>
                  {/* Quick discount buttons */}
                  <div className="flex gap-2 mt-2">
                    {[0, 5, 10, 15, 20, 25].map((pct) => (
                      <button
                        key={pct}
                        onClick={() => setDiscountPercent(pct)}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${discountPercent === pct
                          ? 'bg-secondary text-white'
                          : 'bg-muted text-muted-foreground hover:bg-muted/80'
                          }`}
                      >
                        {pct}%
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Price Display */}
              {membershipBasePrice > 0 && (
                <div className="pos-card p-4 text-center bg-accent/10 border-2 border-accent/30">
                  <p className="text-sm text-secondary mb-1">Precio del paquete (8 lavados con 36% desc.)</p>
                  {discountPercent > 0 ? (
                    <>
                      <p className="text-lg text-muted-foreground line-through">C${membershipBasePrice.toFixed(2)}</p>
                      <p className="text-3xl font-bold text-primary">C${membershipPrice.toFixed(2)}</p>
                      <p className="text-sm text-accent font-semibold mt-1">
                        <i className="fa-solid fa-tag mr-1" />
                        Ahorro: C${discountAmount.toFixed(2)} ({discountPercent}% desc.)
                      </p>
                    </>
                  ) : (
                    <p className="text-3xl font-bold text-primary">C${membershipPrice.toFixed(2)}</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    ~${(membershipPrice / exchangeRate).toFixed(2)} USD
                  </p>
                </div>
              )}

              <button
                onClick={handleProceedToPayment}
                disabled={!selectedCustomer || !selectedService || !selectedVehicleType || membershipPrice <= 0}
                className="btn-cobrar w-full disabled:opacity-50"
              >
                <i className="fa-solid fa-money-bill-wave mr-2" />
                Proceder al Pago — C${membershipPrice.toFixed(2)}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {showPayment && (
        <PaymentModal
          total={membershipPrice}
          exchangeRate={exchangeRate}
          onClose={() => setShowPayment(false)}
          onConfirm={handlePaymentComplete}
        />
      )}

      {/* Print Ticket Modal */}
      {showPrint && lastTicket && (
        <TicketPrint
          ticket={lastTicket}
          onClose={() => { setShowPrint(false); setLastTicket(null); }}
        />
      )}

      {/* Renewal Modal */}
      {renewingMembership && (
        <MembershipRenewalModal
          membership={renewingMembership}
          onConfirm={handleRenew}
          onClose={() => setRenewingMembership(null)}
          isLoading={isRenewing}
        />
      )}

      {toast && <div className="toast-success"><i className="fa-solid fa-circle-check mr-2" />{toast}</div>}
    </div>
  );
}
