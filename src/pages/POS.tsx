import { useState, useEffect, useCallback } from "react";
import { useServices } from "@/hooks/useServices";
import { useBusinessSettings } from "@/hooks/useBusinessSettings";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import PaymentModal from "@/components/pos/PaymentModal";
import CustomerModal from "@/components/pos/CustomerModal";
import TicketPrint from "@/components/pos/TicketPrint";

// Vehicle type mapping: key -> vehicle_type_id in DB
const vehicleTypes = [
  { key: "moto", id: 1, label: "Moto", icon: "fa-motorcycle" },
  { key: "sedan", id: 2, label: "Sedán", icon: "fa-car" },
  { key: "suv", id: 3, label: "SUV", icon: "fa-car-side" },
  { key: "pickup", id: 4, label: "Pick up", icon: "fa-truck-pickup" },
  { key: "microbus", id: 5, label: "Microbús", icon: "fa-van-shuttle" },
] as const;

interface TicketItem {
  serviceId: any;
  serviceName: string;
  vehicleTypeId: number;
  vehicleLabel: string;
  price: number;
  discount: number;
}

interface Customer {
  id: any;
  name: string;
  plate: string;
  phone: string;
  is_general: boolean;
}

export default function POS() {
  const { data: services } = useServices();
  const { data: settings } = useBusinessSettings();
  const { user } = useAuth();

  const [selectedVehicleId, setSelectedVehicleId] = useState<number>(0);
  const [selectedServiceId, setSelectedServiceId] = useState<number>(0);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [ticketItems, setTicketItems] = useState<TicketItem[]>([]);
  const [showPayment, setShowPayment] = useState(false);
  const [showCustomer, setShowCustomer] = useState(false);
  const [showPrint, setShowPrint] = useState(false);
  const [lastTicket, setLastTicket] = useState<any>(null);
  const [recentTickets, setRecentTickets] = useState<any[]>([]);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const exchangeRate = settings?.exchange_rate || 36.5;

  // Load general customer on mount
  useEffect(() => {
    supabase.from("customers").select("id, name, plate, phone, is_general").eq("is_general", true).maybeSingle().then(({ data }) => {
      if (data) setCustomer(data as any as Customer);
    });
  }, []);

  // Load recent tickets on demand
  const loadRecent = useCallback(async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const { data } = await supabase
      .from("tickets")
      .select("id, ticket_number, total, status, created_at, vehicle_types(name)")
      .gte("created_at", today.toISOString())
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
    const vt = vehicleTypes.find((v) => v.id === selectedVehicleId);

    setTicketItems((prev) => [
      ...prev,
      {
        serviceId: svc.id,
        serviceName: svc.name || "",
        vehicleTypeId: selectedVehicleId,
        vehicleLabel: vt?.label || "",
        price: Number(priceEntry.price),
        discount: 0,
      },
    ]);
    showToast("Servicio agregado");
  };

  const removeItem = (idx: number) => {
    setTicketItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const subtotal = ticketItems.reduce((s, i) => s + i.price, 0);
  const totalDiscount = ticketItems.reduce((s, i) => s + i.discount, 0);
  const total = subtotal - totalDiscount;

  const newTicket = () => {
    setTicketItems([]);
    setSelectedServiceId(0);
    setSelectedVehicleId(0);
    supabase.from("customers").select("*").eq("is_general", true).maybeSingle().then(({ data }) => {
      if (data) setCustomer(data as any as Customer);
    });
  };

  const handlePaymentComplete = async (paymentData: any) => {
    try {
      if (ticketItems.length === 0 || !user) return;

      const firstItem = ticketItems[0];

      // Generate ticket number
      const ticketNumber = `T-${Date.now().toString(36).toUpperCase()}`;

      // Create the ticket
      const { data: ticket, error: ticketErr } = await supabase
        .from("tickets")
        .insert({
          ticket_number: ticketNumber,
          user_id: user.id,
          vehicle_type_id: firstItem.vehicleTypeId,
          vehicle_plate: customer?.plate || "",
          total,
          status: "paid",
        } as any)
        .select()
        .single();

      if (ticketErr) throw ticketErr;

      // Create ticket_items for each service
      for (const item of ticketItems) {
        await (supabase as any).from("ticket_items").insert({
          ticket_id: (ticket as any).id,
          service_id: item.serviceId,
          price: item.price,
        });
      }

      // Create payment record(s)
      if (paymentData.method === "mixed" && paymentData.mixedPayment) {
        const { cashAmount, cardAmount } = paymentData.mixedPayment;

        if (cashAmount > 0) {
          await supabase.from("payments").insert({
            ticket_id: (ticket as any).id,
            amount: cashAmount,
            currency: paymentData.currency,
            payment_method: "cash",
            amount_received: cashAmount,
            change_amount: 0,
            exchange_rate: exchangeRate,
          } as any);
        }

        if (cardAmount > 0) {
          await supabase.from("payments").insert({
            ticket_id: (ticket as any).id,
            amount: cardAmount,
            currency: paymentData.currency,
            payment_method: "card",
            amount_received: cardAmount,
            change_amount: 0,
            exchange_rate: exchangeRate,
          } as any);
        }
      } else {
        await supabase.from("payments").insert({
          ticket_id: (ticket as any).id,
          amount: total,
          currency: paymentData.currency,
          payment_method: paymentData.method,
          amount_received: paymentData.received,
          change_amount: paymentData.change,
          exchange_rate: exchangeRate,
        } as any);
      }

      setLastTicket({ ...ticket, customer, items: ticketItems, payment: paymentData, settings });
      setShowPayment(false);
      setShowPrint(true);
      showToast("Venta registrada correctamente");
      loadRecent();
    } catch (err: any) {
      showToast(err.message || "Error al registrar venta", "error");
    }
  };

  return (
    <div className="flex h-full">
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
      <div className="flex-1 flex flex-col overflow-auto">
        {/* Vehicle types */}
        <div className="p-4 border-b border-border">
          <p className="text-sm font-semibold text-foreground mb-3">
            <i className="fa-solid fa-car mr-2 text-secondary" />Tipo de vehículo
          </p>
          <div className="grid grid-cols-5 gap-3">
            {vehicleTypes.map((vt) => (
              <button
                key={vt.id}
                onClick={() => setSelectedVehicleId(vt.id)}
                className={`vehicle-card h-24 transition-all duration-200 hover:scale-105 active:scale-95 ${selectedVehicleId === vt.id ? "vehicle-card-active ring-2 ring-primary" : ""}`}
              >
                <i className={`fa-solid ${vt.icon} text-3xl ${selectedVehicleId === vt.id ? "text-brick-red" : "text-secondary"} mb-2`} />
                <p className="text-sm font-semibold text-foreground">{vt.label}</p>
                {selectedVehicleId === vt.id && (
                  <i className="fa-solid fa-circle-check text-brick-red text-base mt-1" />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Services grid */}
        <div className="p-4 flex-1">
          <p className="text-sm font-semibold text-foreground mb-3">
            <i className="fa-solid fa-list-check mr-2 text-secondary" />Servicios
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                if (!priceEntry) return null;
                const isSelected = selectedServiceId === svc.id;

                return (
                  <button
                    key={svc.id}
                    onClick={() => setSelectedServiceId(svc.id)}
                    className={`service-card text-left min-h-[120px] transition-all duration-200 hover:scale-[1.02] active:scale-95 hover:shadow-lg ${isSelected ? "service-card-active ring-2 ring-primary" : ""}`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h4 className="font-bold text-foreground">{svc.name}</h4>
                        <p className="text-xs text-secondary mt-1">{svc.description}</p>
                      </div>
                      <div className="text-right ml-4">
                        <p className="text-xl font-bold text-primary">C${Number(priceEntry.price).toFixed(0)}</p>
                        <p className="text-xs text-secondary">~${(Number(priceEntry.price) / exchangeRate).toFixed(2)} USD</p>
                        {isSelected && <i className="fa-solid fa-circle-check text-brick-red text-lg mt-2" />}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {selectedServiceId > 0 && selectedVehicleId > 0 && (
            <div className="mt-4 flex justify-center">
              <button onClick={addToTicket} className="touch-btn bg-accent text-accent-foreground px-6 py-3 rounded-xl font-semibold flex items-center gap-2 transition-all duration-200 hover:scale-105 active:scale-95">
                <i className="fa-solid fa-plus" />Agregar al ticket
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Right: Ticket summary */}
      <div className="w-80 lg:w-96 border-l border-border bg-card/50 flex flex-col">
        <div className="p-4 border-b border-border">
          <h3 className="font-bold text-foreground flex items-center gap-2">
            <i className="fa-solid fa-receipt text-secondary" />Ticket actual
          </h3>
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

        {/* Items */}
        <div className="flex-1 overflow-auto p-4 space-y-2">
          {ticketItems.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <i className="fa-solid fa-receipt text-4xl mb-3 opacity-30" />
              <p className="text-sm">Selecciona un servicio y vehículo</p>
            </div>
          )}
          {ticketItems.map((item, idx) => (
            <div key={idx} className="pos-card p-3 space-y-2 animate-scale-in">
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <p className="font-semibold text-sm text-foreground">{item.serviceName}</p>
                  <p className="text-xs text-secondary">{item.vehicleLabel}</p>
                </div>
                <p className="font-bold text-foreground">C${item.price.toFixed(0)}</p>
                <button onClick={() => removeItem(idx)} className="touch-btn p-1 text-destructive hover:bg-destructive/10 rounded">
                  <i className="fa-solid fa-trash-can text-sm" />
                </button>
              </div>
              {/* Discount input */}
              <div className="flex items-center gap-2">
                <label className="text-xs text-muted-foreground flex-1">Descuento:</label>
                <input
                  type="number"
                  value={item.discount || 0}
                  onChange={(e) => {
                    const newDiscount = Math.max(0, Math.min(item.price, parseFloat(e.target.value) || 0));
                    setTicketItems(prev => prev.map((it, i) => i === idx ? { ...it, discount: newDiscount } : it));
                  }}
                  className="w-24 px-2 py-1 bg-background border border-border rounded text-xs text-right"
                  min={0}
                  max={item.price}
                  step={1}
                />
                <span className="text-xs text-muted-foreground">C$</span>
              </div>
            </div>
          ))}
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
            onClick={() => ticketItems.length > 0 && setShowPayment(true)}
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
      {showPrint && lastTicket && (
        <TicketPrint
          ticket={lastTicket}
          onClose={() => { setShowPrint(false); newTicket(); }}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className={toast.type === "success" ? "toast-success" : "toast-error"}>
          <i className={`fa-solid ${toast.type === "success" ? "fa-circle-check" : "fa-circle-exclamation"} mr-2`} />
          {toast.msg}
        </div>
      )}
    </div>
  );
}
