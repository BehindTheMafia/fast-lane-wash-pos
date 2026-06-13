import { useState, useEffect, useCallback, useRef } from "react";
import { useBarberServices } from "@/hooks/useServices";
import { useCarWashServicesForMix } from "@/hooks/useServices";
import { useProducts } from "@/hooks/useProducts";
import { useVehicleTypes } from "@/hooks/useVehicleTypes";
import { useBusinessSettings } from "@/hooks/useBusinessSettings";
import { useBusinessLine } from "@/contexts/BusinessLineContext";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { niStartOfDay, niNow } from "@/utils/niDate";
import PaymentModal from "@/components/pos/PaymentModal";
import CustomerModal from "@/components/pos/CustomerModal";
import TicketPrint from "@/components/pos/TicketPrint";

export interface BarberCartItem {
  itemType: "service" | "product";
  serviceId?: number;
  productId?: number;
  name: string;
  price: number;
  quantity: number;
  discountPercent: number;
  maxStock?: number;
}

interface Customer {
  id: number;
  name: string;
  plate: string;
  phone: string;
  is_general: boolean;
}

export default function BarbershopPOS() {
  const { carWashVisible } = useBusinessLine();
  const { data: services } = useBarberServices();
  const { data: products } = useProducts();
  const { data: carWashServices } = useCarWashServicesForMix();
  const { data: vehicleTypes } = useVehicleTypes();
  const { data: settings } = useBusinessSettings();
  const { user } = useAuth();

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [ticketItems, setTicketItems] = useState<BarberCartItem[]>([]);
  const [showCustomChargeModal, setShowCustomChargeModal] = useState(false);
  const [customConcept, setCustomConcept] = useState("");
  const [customAmount, setCustomAmount] = useState("");
  const [showPayment, setShowPayment] = useState(false);
  const [showCustomer, setShowCustomer] = useState(false);
  const [showPrint, setShowPrint] = useState(false);
  const [lastTicket, setLastTicket] = useState<Record<string, unknown> | null>(null);
  const [recentTickets, setRecentTickets] = useState<Record<string, unknown>[]>([]);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const isProcessingSaleRef = useRef(false);
  const [isProcessingSale, setIsProcessingSale] = useState(false);
  const [showCarWashSection, setShowCarWashSection] = useState(false);
  const [showMobileCart, setShowMobileCart] = useState(false);
  const [mixVehicleId, setMixVehicleId] = useState<number>(0);

  const exchangeRate = settings?.exchange_rate || 36.5;

  useEffect(() => {
    supabase
      .from("customers")
      .select("id, name, plate, phone, is_general")
      .eq("is_general", true)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setCustomer(data as Customer);
      });
  }, []);

  const loadRecent = useCallback(async () => {
    const { data } = await supabase
      .from("tickets")
      .select("id, ticket_number, total, status, created_at")
      .eq("business_line", "barbershop")
      .gte("created_at", niStartOfDay())
      .order("created_at", { ascending: false })
      .limit(10);
    if (data) setRecentTickets(data);
  }, []);

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const lineTotal = (item: BarberCartItem) =>
    item.price * item.quantity * (1 - item.discountPercent / 100);

  const subtotal = ticketItems.reduce((s, i) => s + i.price * i.quantity, 0);
  const totalDiscount = ticketItems.reduce(
    (s, i) => s + i.price * i.quantity * (i.discountPercent / 100),
    0
  );
  const total = subtotal - totalDiscount;

  const addService = (svc: { id: number; name: string; base_price: number | null }) => {
    const price = Number(svc.base_price ?? 0);
    setTicketItems((prev) => [
      ...prev,
      {
        itemType: "service",
        serviceId: svc.id,
        name: svc.name,
        price,
        quantity: 1,
        discountPercent: 0,
      },
    ]);
    showToast(`${svc.name} agregado`);
  };

  const addProduct = (prod: {
    id: number;
    name: string;
    price: number;
    stock_quantity: number;
  }) => {
    if (prod.stock_quantity < 1) {
      showToast("Sin stock disponible", "error");
      return;
    }
    const existing = ticketItems.find(
      (i) => i.itemType === "product" && i.productId === prod.id
    );
    if (existing) {
      if (existing.quantity >= prod.stock_quantity) {
        showToast("Stock insuficiente", "error");
        return;
      }
      setTicketItems((prev) =>
        prev.map((i) =>
          i.productId === prod.id && i.itemType === "product"
            ? { ...i, quantity: i.quantity + 1 }
            : i
        )
      );
    } else {
      setTicketItems((prev) => [
        ...prev,
        {
          itemType: "product",
          productId: prod.id,
          name: prod.name,
          price: Number(prod.price),
          quantity: 1,
          discountPercent: 0,
          maxStock: prod.stock_quantity,
        },
      ]);
    }
    showToast(`${prod.name} agregado`);
  };

  const updateQuantity = (idx: number, delta: number) => {
    setTicketItems((prev) =>
      prev
        .map((item, i) => {
          if (i !== idx) return item;
          const next = item.quantity + delta;
          if (next < 1) return null;
          if (
            item.itemType === "product" &&
            item.maxStock != null &&
            next > item.maxStock
          ) {
            showToast("Stock insuficiente", "error");
            return item;
          }
          return { ...item, quantity: next };
        })
        .filter(Boolean) as BarberCartItem[]
    );
  };

  const removeItem = (idx: number) => {
    setTicketItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const newTicket = () => {
    setTicketItems([]);
    supabase
      .from("customers")
      .select("id, name, plate, phone, is_general")
      .eq("is_general", true)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setCustomer(data as Customer);
      });
  };

  const handlePaymentComplete = async (paymentData: {
    method: string;
    amount: number;
    currency: string;
    received: number;
    change: number;
    mixedPayments?: { method: string; amount: number; received: number; change: number }[];
  }) => {
    if (isProcessingSaleRef.current) return;
    isProcessingSaleRef.current = true;
    setIsProcessingSale(true);

    try {
      if (ticketItems.length === 0 || !user) return;

      const ticketNumber = `B-${Date.now().toString(36).toUpperCase()}`;

      const { data: ticket, error: ticketErr } = await supabase
        .from("tickets")
        .insert({
          ticket_number: ticketNumber,
          user_id: user.id,
          customer_id: customer?.id || null,
          vehicle_type_id: null,
          vehicle_plate: "",
          total,
          status: "paid",
          business_line: "barbershop",
          created_at: niNow(),
        } as never)
        .select()
        .single();

      if (ticketErr) throw ticketErr;
      const ticketId = (ticket as { id: number }).id;

      for (const item of ticketItems) {
        const linePrice = lineTotal(item) / item.quantity;
        const payload: Record<string, unknown> = {
          ticket_id: ticketId,
          item_type: item.itemType,
          quantity: item.quantity,
          price: lineTotal(item),
          service_name_snapshot: item.name,
          price_snapshot: linePrice,
        };
        if (item.itemType === "service") {
          payload.service_id = item.serviceId;
        } else {
          payload.product_id = item.productId;
        }
        const { error: itemErr } = await supabase
          .from("ticket_items")
          .insert(payload as never);
        if (itemErr) throw itemErr;
      }

      const productLines = ticketItems.filter((i) => i.itemType === "product");
      for (const item of productLines) {
        const { error: stockErr } = await supabase.rpc("decrement_product_stock", {
          p_product_id: item.productId!,
          p_qty: item.quantity,
          p_ticket_id: ticketId,
        });
        if (stockErr) throw new Error(stockErr.message || "Error al descontar inventario");
      }

      const rollbackTicket = async () => {
        await supabase.from("ticket_mixed_payments").delete().eq("ticket_id", ticketId);
        await supabase.from("payments").delete().eq("ticket_id", ticketId);
        await supabase.from("ticket_items").delete().eq("ticket_id", ticketId);
        await supabase.from("tickets").delete().eq("id", ticketId);
      };

      if (paymentData.method === "mixed" && paymentData.mixedPayments?.length) {
        const { error: mixedPayErr } = await supabase.from("payments").insert({
          ticket_id: ticketId,
          amount: paymentData.amount,
          currency: paymentData.currency,
          payment_method: "mixed",
          amount_received: paymentData.received,
          change_amount: paymentData.change,
          exchange_rate: exchangeRate,
        } as never);
        if (mixedPayErr) {
          await rollbackTicket();
          throw new Error(mixedPayErr.message);
        }
        for (const part of paymentData.mixedPayments) {
          const amountNio =
            paymentData.currency === "USD"
              ? Number((part.amount * exchangeRate).toFixed(2))
              : part.amount;
          const changeNio =
            paymentData.currency === "USD"
              ? Number((part.change * exchangeRate).toFixed(2))
              : part.change;
          const { error: partErr } = await supabase.from("ticket_mixed_payments").insert({
            ticket_id: ticketId,
            method: part.method,
            currency: paymentData.currency,
            amount: part.amount,
            exchange_rate: exchangeRate,
            amount_nio: amountNio,
            applied_nio: amountNio,
            change_nio: changeNio,
          } as never);
          if (partErr) {
            await rollbackTicket();
            throw new Error(partErr.message);
          }
        }
      } else {
        const { error: payErr } = await supabase.from("payments").insert({
          ticket_id: ticketId,
          amount: paymentData.amount,
          currency: paymentData.currency,
          payment_method: paymentData.method,
          amount_received: paymentData.received,
          change_amount: paymentData.change,
          exchange_rate: exchangeRate,
        } as never);
        if (payErr) {
          await rollbackTicket();
          throw new Error(payErr.message);
        }
      }

      setLastTicket({
        ...ticket,
        business_line: "barbershop",
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
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Error al registrar venta";
      showToast(message, "error");
    } finally {
      isProcessingSaleRef.current = false;
      setIsProcessingSale(false);
    }
  };

  return (
    <div className="flex flex-col lg:flex-row h-full w-full relative">
      <div className="hidden xl:flex flex-col w-72 border-r border-border bg-card/50 overflow-auto">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h3 className="font-bold text-foreground text-sm">
            <i className="fa-solid fa-clock-rotate-left mr-2 text-secondary" />
            Recientes
          </h3>
          <button onClick={loadRecent} className="touch-btn text-xs text-accent hover:underline">
            Cargar
          </button>
        </div>
        <div className="flex-1 overflow-auto">
          {recentTickets.map((t) => (
            <div key={String(t.id)} className="px-4 py-3 border-b border-border/50">
              <div className="flex justify-between">
                <p className="font-semibold text-xs">{String(t.ticket_number)}</p>
                <p className="font-bold text-sm text-primary">C${Number(t.total).toFixed(0)}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 flex flex-col overflow-auto pb-24 lg:pb-0">
        <div className="p-4 border-b border-border">
          <div className="flex justify-between items-center mb-3">
            <p className="text-sm font-semibold text-foreground">
              <i className="fa-solid fa-scissors mr-2 text-secondary" />
              Servicios
            </p>
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
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5 gap-3">
            {services?.filter(svc => Number(svc.base_price || 0) > 0).map((svc) => (
              <button
                key={svc.id}
                type="button"
                onClick={() => addService(svc)}
                className="service-card relative flex flex-col items-center justify-center text-center p-4 min-h-[140px] transition-all duration-200 hover:scale-[1.02] active:scale-95"
              >
                <i className={`fa-solid ${svc.icon || 'fa-scissors'} text-3xl text-secondary mb-3`} />
                <h4 className="font-bold text-sm text-foreground leading-tight w-full truncate">{svc.name}</h4>
                <p className="text-xs text-secondary mt-1 line-clamp-2 w-full">{svc.description}</p>
                <div className="mt-auto pt-2">
                  <p className="text-base font-bold text-primary">
                    C${Number(svc.base_price ?? 0).toFixed(0)}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="p-4 flex-1">
          <p className="text-sm font-semibold text-foreground mb-3">
            <i className="fa-solid fa-bottle-droplet mr-2 text-secondary" />
            Productos
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {products?.map((prod) => {
              const outOfStock = prod.stock_quantity < 1;
              const lowStock = prod.stock_quantity <= prod.min_stock_level;
              return (
                <button
                  key={prod.id}
                  type="button"
                  disabled={outOfStock}
                  onClick={() => addProduct(prod)}
                  className={`service-card text-left p-3 ${outOfStock ? "opacity-40 cursor-not-allowed" : "hover:scale-[1.02] active:scale-95"}`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <i className={`fa-solid ${prod.icon || "fa-bottle-droplet"} text-accent`} />
                    <h4 className="font-semibold text-sm">{prod.name}</h4>
                  </div>
                  <p className="text-base font-bold text-primary">C${Number(prod.price).toFixed(0)}</p>
                  <p
                    className={`text-xs mt-1 ${lowStock ? "text-amber-600" : "text-muted-foreground"}`}
                  >
                    Stock: {prod.stock_quantity}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Car Wash Services Section (cross-sell) */}
        {carWashVisible && carWashServices && carWashServices.length > 0 && (
          <div className="p-4 border-t border-border">
            <button
              type="button"
              onClick={() => setShowCarWashSection(!showCarWashSection)}
              className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20 border-2 border-blue-200/60 dark:border-blue-700/40 hover:border-blue-400 transition-all"
            >
              <span className="text-sm font-semibold text-blue-800 dark:text-blue-400 flex items-center gap-2">
                <i className="fa-solid fa-car-side" /> Servicios de Autolavado
              </span>
              <i className={`fa-solid fa-chevron-${showCarWashSection ? 'up' : 'down'} text-blue-600 text-xs`} />
            </button>
            {showCarWashSection && (
              <div className="mt-3 space-y-3 animate-scale-in">
                {/* Mini vehicle type selector */}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-2">
                    <i className="fa-solid fa-car mr-1" /> Tipo de vehículo
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {vehicleTypes?.map(vt => (
                      <button
                        key={vt.id}
                        type="button"
                        onClick={() => setMixVehicleId(vt.id)}
                        className={`touch-btn flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border-2 transition-all ${
                          mixVehicleId === vt.id
                            ? "border-blue-500 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300"
                            : "border-border text-muted-foreground hover:border-blue-300"
                        }`}
                      >
                        <i className={`fa-solid ${vt.icon}`} />
                        {vt.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Car wash services grid */}
                {mixVehicleId > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5 gap-3">
                    {carWashServices.map((svc: any) => {
                      const priceEntry = svc.service_prices?.find((p: any) => p.vehicle_type_id === mixVehicleId);
                      if (!priceEntry) return null;
                      const price = Number(priceEntry.price);
                      if (price <= 0) return null;
                      const vt = vehicleTypes?.find(v => v.id === mixVehicleId);
                      return (
                        <button
                          key={`cw-${svc.id}`}
                          type="button"
                          onClick={() => {
                            setTicketItems(prev => [
                              ...prev,
                              {
                                itemType: "service" as const,
                                serviceId: svc.id,
                                name: `🚗 ${svc.name} (${vt?.name || ''})`,
                                price,
                                quantity: 1,
                                discountPercent: 0,
                              },
                            ]);
                            showToast(`🚗 ${svc.name} agregado`);
                          }}
                          className="service-card relative flex flex-col items-center justify-center text-center p-4 min-h-[140px] transition-all duration-200 hover:scale-[1.02] active:scale-95 hover:shadow-md border-blue-200/60 dark:border-blue-700/40 hover:border-blue-400"
                        >
                          <i className={`fa-solid ${svc.icon || 'fa-car-side'} text-3xl text-blue-600 mb-3`} />
                          <h4 className="font-bold text-sm text-foreground leading-tight w-full truncate">{svc.name}</h4>
                          <p className="text-xs text-secondary mt-1 line-clamp-2 w-full">{svc.description}</p>
                          <div className="mt-auto pt-2 w-full">
                            <p className="text-base font-bold text-blue-700 dark:text-blue-400">C${price.toFixed(0)}</p>
                            <p className="text-[10px] text-muted-foreground mt-1">
                              <i className={`fa-solid ${vt?.icon || 'fa-car'} mr-1`} />{vt?.name}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-4 text-muted-foreground text-xs">
                    <i className="fa-solid fa-hand-pointer mr-1" /> Selecciona un tipo de vehículo
                  </div>
                )}
              </div>
            )}
          </div>
        )}
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
            <i className="fa-solid fa-receipt text-secondary" />
            Ticket actual
          </h3>
          <button 
            className="lg:hidden touch-btn w-10 h-10 flex items-center justify-center rounded-full bg-muted/50 text-foreground hover:bg-muted"
            onClick={() => setShowMobileCart(false)}
          >
            <i className="fa-solid fa-xmark" />
          </button>
        </div>

        <div className="px-4 py-3 border-b border-border flex justify-between items-center">
          <div>
            <p className="text-xs text-secondary">Cliente</p>
            <p className="font-semibold text-sm">{customer?.name || "Sin seleccionar"}</p>
          </div>
          <button
            type="button"
            onClick={() => setShowCustomer(true)}
            className="touch-btn px-4 py-3 rounded-lg bg-accent/10 text-accent"
          >
            <i className="fa-solid fa-user-pen text-lg" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-4 space-y-2">
          {ticketItems.length === 0 && (
            <div className="text-center py-12 text-muted-foreground text-sm">
              Agrega servicios o productos
            </div>
          )}
          {ticketItems.map((item, idx) => (
            <div key={idx} className="pos-card p-3 space-y-2">
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">
                    {item.itemType === "product" && (
                      <i className="fa-solid fa-box text-accent mr-1" />
                    )}
                    {item.name}
                  </p>
                  <p className="text-xs text-secondary">
                    {item.itemType === "product" ? "Producto" : "Servicio"}
                  </p>
                </div>
                {item.itemType === "product" && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => updateQuantity(idx, -1)}
                      className="touch-btn w-8 h-8 rounded bg-muted"
                    >
                      −
                    </button>
                    <span className="text-sm font-bold w-6 text-center">{item.quantity}</span>
                    <button
                      type="button"
                      onClick={() => updateQuantity(idx, 1)}
                      className="touch-btn w-8 h-8 rounded bg-muted"
                    >
                      +
                    </button>
                  </div>
                )}
                <p className="font-bold text-sm">C${lineTotal(item).toFixed(0)}</p>
                <button
                  type="button"
                  onClick={() => removeItem(idx)}
                  className="text-destructive p-1"
                >
                  <i className="fa-solid fa-trash-can text-sm" />
                </button>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-muted-foreground">Desc. %</label>
                <input
                  type="number"
                  value={item.discountPercent}
                  onChange={(e) => {
                    const v = Math.max(0, Math.min(100, parseFloat(e.target.value) || 0));
                    setTicketItems((prev) =>
                      prev.map((it, i) => (i === idx ? { ...it, discountPercent: v } : it))
                    );
                  }}
                  className="w-16 px-2 py-1 border rounded text-xs text-right"
                  min={0}
                  max={100}
                />
              </div>
            </div>
          ))}
        </div>

        <div className="p-4 border-t border-border space-y-2">
          <div className="flex justify-between text-lg font-bold">
            <span>TOTAL</span>
            <span className="text-primary">C${total.toFixed(2)}</span>
          </div>
          <button
            type="button"
            disabled={ticketItems.length === 0 || isProcessingSale}
            onClick={() => setShowPayment(true)}
            className="btn-cobrar w-full h-16 disabled:opacity-50 font-bold text-xl"
          >
            <i className="fa-solid fa-money-bill-wave mr-2" />
            COBRAR
          </button>
        </div>
      </div>

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
          onSelect={(c) => {
            setCustomer(c as Customer);
            setShowCustomer(false);
          }}
          onClose={() => setShowCustomer(false)}
        />
      )}
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
                  placeholder="Ej: Servicio de afeitado VIP"
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
                  placeholder="Ej: 120"
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
                    setTicketItems((prev) => [
                      ...prev,
                      {
                        itemType: "service",
                        name: customConcept.trim(),
                        price: amt,
                        quantity: 1,
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
        <div className={toast.type === "success" ? "toast-success" : "toast-error"}>
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
