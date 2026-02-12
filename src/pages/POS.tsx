import { useState, useEffect, useCallback } from "react";
import { useServices } from "@/hooks/useServices";
import { useBusinessSettings } from "@/hooks/useBusinessSettings";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import PaymentModal from "@/components/pos/PaymentModal";
import CustomerModal from "@/components/pos/CustomerModal";
import TicketPrint from "@/components/pos/TicketPrint";

const vehicleTypes = [
  { key: "moto", label: "Moto", icon: "fa-motorcycle" },
  { key: "sedan", label: "Sedán", icon: "fa-car" },
  { key: "suv", label: "SUV", icon: "fa-car-side" },
  { key: "pickup", label: "Pick up", icon: "fa-truck-pickup" },
  { key: "microbus", label: "Microbús", icon: "fa-van-shuttle" },
] as const;

interface TicketItem {
  serviceId: string;
  serviceName: string;
  vehicleType: string;
  vehicleLabel: string;
  price: number;
  discount: number;
}

interface Customer {
  id: string;
  name: string;
  plate: string;
  phone: string;
  is_general: boolean;
}

export default function POS() {
  const { data: services, isLoading: loadingServices } = useServices();
  const { data: settings } = useBusinessSettings();
  const { user } = useAuth();

  const [selectedVehicle, setSelectedVehicle] = useState<string>("");
  const [selectedService, setSelectedService] = useState<string>("");
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
    supabase.from("customers").select("*").eq("is_general", true).maybeSingle().then(({ data }) => {
      if (data) setCustomer(data as Customer);
    });
  }, []);

  // Load recent tickets
  const loadRecent = useCallback(async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const { data } = await supabase
      .from("tickets")
      .select("*, customers(name), services(name)")
      .gte("created_at", today.toISOString())
      .order("created_at", { ascending: false })
      .limit(20);
    if (data) setRecentTickets(data);
  }, []);

  useEffect(() => { loadRecent(); }, [loadRecent]);

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const addToTicket = () => {
    if (!selectedService || !selectedVehicle) return;
    const svc = services?.find((s: any) => s.id === selectedService);
    if (!svc) return;
    const priceEntry = svc.service_prices?.find((p: any) => p.vehicle_type === selectedVehicle);
    if (!priceEntry) return;
    const vt = vehicleTypes.find((v) => v.key === selectedVehicle);

    setTicketItems((prev) => [
      ...prev,
      {
        serviceId: svc.id,
        serviceName: svc.name,
        vehicleType: selectedVehicle,
        vehicleLabel: vt?.label || selectedVehicle,
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
    setSelectedService("");
    setSelectedVehicle("");
    supabase.from("customers").select("*").eq("is_general", true).maybeSingle().then(({ data }) => {
      if (data) setCustomer(data as Customer);
    });
  };

  const handlePaymentComplete = async (paymentData: any) => {
    try {
      const item = ticketItems[0];
      if (!item || !user) return;

      const { data: ticket, error: ticketErr } = await supabase
        .from("tickets")
        .insert({
          cashier_id: user.id,
          customer_id: customer?.id || null,
          vehicle_type: item.vehicleType as any,
          service_id: item.serviceId,
          subtotal,
          discount: totalDiscount,
          total,
          status: "paid",
          plate: customer?.plate || "",
        })
        .select()
        .single();

      if (ticketErr) throw ticketErr;

      await supabase.from("payments").insert({
        ticket_id: ticket.id,
        amount: total,
        currency: paymentData.currency,
        payment_method: paymentData.method,
        amount_received: paymentData.received,
        change_amount: paymentData.change,
        exchange_rate: exchangeRate,
      });

      setLastTicket({ ...ticket, customer, items: ticketItems, payment: paymentData, settings });
      setShowPayment(false);
      setShowPrint(true);
      showToast("Venta registrada correctamente");
      loadRecent();
    } catch (err: any) {
      showToast(err.message || "Error al registrar venta", "error");
    }
  };

  if (loadingServices) {
    return <div className="flex items-center justify-center h-full"><i className="fa-solid fa-spinner fa-spin text-3xl text-accent" /></div>;
  }

  return (
    <div className="flex h-full">
      {/* Left: Recent */}
      <div className="hidden xl:flex flex-col w-72 border-r border-border bg-card/50 overflow-auto">
        <div className="p-4 border-b border-border">
          <h3 className="font-bold text-foreground flex items-center gap-2">
            <i className="fa-solid fa-clock-rotate-left text-secondary" />
            Actividad del día
          </h3>
        </div>
        <div className="flex-1 overflow-auto p-3 space-y-2">
          {recentTickets.map((t: any) => (
            <div key={t.id} className="pos-card p-3 text-xs">
              <div className="flex justify-between items-start">
                <span className="font-semibold text-foreground">#{t.ticket_number}</span>
                <span className={`px-2 py-0.5 rounded-full text-xs ${t.status === 'paid' ? 'bg-accent/10 text-accent' : 'bg-destructive/10 text-destructive'}`}>
                  {t.status === 'paid' ? 'Pagado' : 'Pendiente'}
                </span>
              </div>
              <p className="text-muted-foreground mt-1">{(t as any).customers?.name || 'Cliente'}</p>
              <p className="text-secondary">{(t as any).services?.name}</p>
              <p className="font-bold text-foreground mt-1">C${Number(t.total).toFixed(2)}</p>
            </div>
          ))}
          {recentTickets.length === 0 && (
            <p className="text-center text-muted-foreground text-sm py-8">Sin actividad hoy</p>
          )}
        </div>
      </div>

      {/* Center: Services */}
      <div className="flex-1 flex flex-col overflow-auto">
        <div className="p-4 border-b border-border flex items-center justify-between gap-4 flex-wrap">
          <h2 className="font-bold text-lg text-foreground">
            <i className="fa-solid fa-cash-register mr-2 text-secondary" />Punto de Venta
          </h2>
          <button onClick={newTicket} className="touch-btn bg-accent text-accent-foreground px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2">
            <i className="fa-solid fa-plus" />Nuevo Ticket
          </button>
        </div>

        {/* Vehicle type filter */}
        <div className="p-4 border-b border-border">
          <p className="text-sm font-semibold text-foreground mb-3">
            <i className="fa-solid fa-car mr-2 text-secondary" />Tipo de vehículo
          </p>
          <div className="grid grid-cols-5 gap-2">
            {vehicleTypes.map((vt) => (
              <button
                key={vt.key}
                onClick={() => setSelectedVehicle(vt.key)}
                className={`vehicle-card ${selectedVehicle === vt.key ? "vehicle-card-active" : ""}`}
              >
                <i className={`fa-solid ${vt.icon} text-2xl ${selectedVehicle === vt.key ? "text-brick-red" : "text-secondary"} mb-1`} />
                <p className="text-xs font-semibold text-foreground">{vt.label}</p>
                {selectedVehicle === vt.key && (
                  <i className="fa-solid fa-circle-check text-brick-red text-sm mt-1" />
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
            {services?.map((svc: any) => {
              const priceEntry = selectedVehicle
                ? svc.service_prices?.find((p: any) => p.vehicle_type === selectedVehicle)
                : null;
              const isSelected = selectedService === svc.id;

              return (
                <button
                  key={svc.id}
                  onClick={() => { setSelectedService(svc.id); }}
                  className={`service-card text-left ${isSelected ? "service-card-active" : ""}`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h4 className="font-bold text-foreground">{svc.name}</h4>
                      <p className="text-xs text-secondary mt-1">{svc.description}</p>
                      {svc.includes && svc.includes.length > 0 && (
                        <div className="mt-2 space-y-0.5">
                          {svc.includes.map((inc: string, i: number) => (
                            <p key={i} className="text-xs text-muted-foreground flex items-center gap-1">
                              <i className="fa-solid fa-check text-secondary text-[10px]" />{inc}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="text-right ml-4">
                      {priceEntry ? (
                        <div>
                          <p className="text-xl font-bold text-primary">C${Number(priceEntry.price).toFixed(0)}</p>
                          <p className="text-xs text-secondary">~${(Number(priceEntry.price) / exchangeRate).toFixed(2)} USD</p>
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">Selecciona vehículo</p>
                      )}
                      {isSelected && <i className="fa-solid fa-circle-check text-brick-red text-lg mt-2" />}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {selectedService && selectedVehicle && (
            <div className="mt-4 flex justify-center">
              <button onClick={addToTicket} className="touch-btn bg-accent text-accent-foreground px-6 py-3 rounded-xl font-semibold flex items-center gap-2">
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
              className="touch-btn p-2 rounded-lg bg-accent/10 text-accent hover:bg-accent/20"
            >
              <i className="fa-solid fa-user-pen" />
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
            <div key={idx} className="pos-card p-3 flex items-center gap-3 animate-scale-in">
              <div className="flex-1">
                <p className="font-semibold text-sm text-foreground">{item.serviceName}</p>
                <p className="text-xs text-secondary">{item.vehicleLabel}</p>
              </div>
              <p className="font-bold text-foreground">C${item.price.toFixed(0)}</p>
              <button onClick={() => removeItem(idx)} className="touch-btn p-1 text-destructive hover:bg-destructive/10 rounded">
                <i className="fa-solid fa-trash-can text-sm" />
              </button>
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
            className="btn-cobrar w-full flex items-center justify-center gap-3 disabled:opacity-50"
          >
            <i className="fa-solid fa-money-bill-wave" />COBRAR
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
          current={customer}
          onSelect={(c) => { setCustomer(c); setShowCustomer(false); }}
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
