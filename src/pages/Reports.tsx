import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useBusinessSettings } from "@/hooks/useBusinessSettings";
import TicketPrint from "@/components/pos/TicketPrint";
import { niToday, niFormatDate, niFormatTime } from "@/utils/niDate";

const methodLabels: Record<string, string> = { cash: "Efectivo", card: "Tarjeta", transfer: "Transferencia", mixed: "Mixto" };

export default function Reports() {
  const { data: settings } = useBusinessSettings();
  const [dateFrom, setDateFrom] = useState(() => niToday());
  const [dateTo, setDateTo] = useState(() => niToday());
  const [tickets, setTickets] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingTicket, setEditingTicket] = useState<any>(null);
  const [deletingTicket, setDeletingTicket] = useState<any>(null);
  const [reprintTicket, setReprintTicket] = useState<any>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const loadReport = async () => {
    setLoading(true);
    const [yFrom, mFrom, dFrom] = dateFrom.split("-").map(Number);
    const [yTo, mTo, dTo] = dateTo.split("-").map(Number);
    const from = new Date(yFrom, mFrom - 1, dFrom, 0, 0, 0, 0);
    const to = new Date(yTo, mTo - 1, dTo, 23, 59, 59, 999);

    // Fetch tickets with vehicle type and payments
    const { data: rawTickets, error: ticketsError } = await supabase
      .from("tickets")
      .select("*, vehicle_types(name), payments(*)")
      .gte("created_at", from.toISOString())
      .lte("created_at", to.toISOString())
      .eq("status", "paid")
      .order("created_at", { ascending: false });

    if (ticketsError) {
      console.error("Error loading tickets:", ticketsError);
      setTickets([]);
      setLoading(false);
      return;
    }

    if (!rawTickets || rawTickets.length === 0) {
      setTickets([]);
      setLoading(false);
      return;
    }

    // Fetch ticket_items with service names
    const ticketIds = rawTickets.map((t: any) => t.id);
    const { data: allItems } = await (supabase as any)
      .from("ticket_items")
      .select("*, services(name)")
      .in("ticket_id", ticketIds);

    // Fetch membership washes to identify membership usage
    const { data: membershipWashes } = await supabase
      .from("membership_washes")
      .select("ticket_id, membership_id")
      .in("ticket_id", ticketIds);

    // Create map of ticket_id -> has membership usage
    const membershipWashMap: Record<string, boolean> = {};
    (membershipWashes || []).forEach((mw: any) => {
      if (mw.ticket_id) {
        membershipWashMap[mw.ticket_id] = true;
      }
    });

    // Fetch customers for tickets that have customer_id
    const customerIds = [...new Set(rawTickets.map((t: any) => t.customer_id).filter(Boolean))];
    const { data: customers } = customerIds.length > 0
      ? await supabase.from("customers").select("id, name, plate, phone").in("id", customerIds)
      : { data: [] };
    const customerMap: Record<string, any> = {};
    (customers || []).forEach((c: any) => { customerMap[c.id] = c; });

    // Fetch profiles for cashier names
    const userIds = [...new Set(rawTickets.map((t: any) => t.user_id).filter(Boolean))];
    const { data: profiles } = userIds.length > 0
      ? await supabase.from("profiles").select("id, full_name").in("id", userIds)
      : { data: [] };
    const profileMap: Record<string, string> = {};
    (profiles || []).forEach((p: any) => { profileMap[p.id] = p.full_name || ""; });

    // Merge items, profile, customer, and membership info into tickets
    const enriched = rawTickets.map((t: any) => ({
      ...t,
      ticket_items: (allItems || []).filter((ti: any) => ti.ticket_id === t.id),
      cashier_name: profileMap[t.user_id] || "—",
      customer_data: t.customer_id ? customerMap[t.customer_id] : null,
      customer_name: t.customer_id ? (customerMap[t.customer_id]?.name || "—") : "—",
      is_membership_usage: membershipWashMap[t.id] || false,
      is_membership_sale: t.ticket_number?.startsWith("M-") || false,
    }));

    setTickets(enriched);
    setLoading(false);
  };

  useEffect(() => { loadReport(); loadCatalogs(); }, []);

  const loadCatalogs = async () => {
    const [{ data: svcs }, { data: custs }] = await Promise.all([
      supabase.from("services").select("id, name").eq("is_active", true).order("name"),
      supabase.from("customers").select("id, name").eq("is_general", false).order("name"),
    ]);
    setServices(svcs || []);
    setCustomers(custs || []);
  };

  const handleDeleteConfirm = async () => {
    if (!deletingTicket) return;

    try {
      // Delete ticket (cascade will handle ticket_items and payments)
      const { error } = await supabase
        .from("tickets")
        .delete()
        .eq("id", deletingTicket.id);

      if (error) throw error;

      showToast("Ticket eliminado correctamente");
      setDeletingTicket(null);
      loadReport();
    } catch (err: any) {
      showToast("Error al eliminar ticket: " + err.message);
    }
  };

  const handleEditSave = async () => {
    if (!editingTicket) return;
    const exRate = settings?.exchange_rate || 36.5;

    try {
      // 1. Update ticket fields
      await supabase
        .from("tickets")
        .update({
          vehicle_plate: editingTicket.vehicle_plate,
          total: Number(editingTicket.total),
          customer_id: editingTicket._editCustomerId ?? editingTicket.customer_id,
          vehicle_type_id: editingTicket._editVehicleTypeId ?? editingTicket.vehicle_type_id,
        })
        .eq("id", editingTicket.id);

      // 2. Update ticket_item service if changed
      if (editingTicket._editServiceId && editingTicket.ticket_items?.length > 0) {
        await supabase
          .from("ticket_items")
          .update({ service_id: editingTicket._editServiceId, price: Number(editingTicket.total) })
          .eq("id", editingTicket.ticket_items[0].id);
      }

      const method = editingTicket._editPaymentMethod ?? editingTicket.payments?.[0]?.payment_method ?? "cash";
      const currency = editingTicket._editCurrency ?? editingTicket.payments?.[0]?.currency ?? "NIO";
      const amount = Number(editingTicket.total);
      // Amount received: if USD, convert total NIO to USD for display
      const amountReceived = currency === "USD" ? +(amount / exRate).toFixed(2) : amount;

      if (!editingTicket.payments || editingTicket.payments.length === 0) {
        // No payment → INSERT
        await supabase.from("payments").insert({
          ticket_id: editingTicket.id,
          amount: currency === "USD" ? +(amount / exRate).toFixed(2) : amount,
          currency,
          payment_method: method,
          amount_received: amountReceived,
          change_amount: 0,
          exchange_rate: exRate,
        } as any);
      } else {
        // Has payment → UPDATE
        await supabase
          .from("payments")
          .update({
            amount: currency === "USD" ? +(amount / exRate).toFixed(2) : amount,
            currency,
            payment_method: method,
            amount_received: amountReceived,
            change_amount: 0,
            exchange_rate: exRate,
          })
          .eq("id", editingTicket.payments[0].id);
      }

      showToast("Ticket actualizado correctamente");
      setEditingTicket(null);
      loadReport();
    } catch (err: any) {
      showToast("Error al actualizar ticket: " + err.message);
    }
  };

  const handleReprint = (ticket: any) => {
    console.log('Reprint ticket data:', ticket);

    const isMembershipSale = ticket.is_membership_sale || ticket.ticket_number?.startsWith("M-");

    // Build items array with proper service names and prices
    const itemsFromDB = ticket.ticket_items?.map((ti: any) => ({
      serviceName: ti.services?.name || "Servicio",
      vehicleLabel: (ticket.vehicle_types as any)?.name || "",
      price: Number(ti.price),
    })) || [];

    // For membership sale tickets, enhance the item name with membership context
    let itemsArray: any[];
    if (isMembershipSale && itemsFromDB.length > 0) {
      // The ticket_item.price is the final price paid (after any custom discount)
      const finalPrice = Number(ticket.total);
      const itemTotalFromDB = itemsFromDB.reduce((s: number, i: any) => s + i.price, 0);

      // If there's a difference between the item total and ticket total, there was a discount
      // The item price in DB stores the final paid price for memberships  
      const hasDiscount = itemTotalFromDB > finalPrice;

      itemsArray = [{
        serviceName: `MEMBRESÍA: ${itemsFromDB[0].serviceName}`,
        vehicleLabel: itemsFromDB[0].vehicleLabel,
        price: itemTotalFromDB,
      }];

      // If there's a discount difference, add a discount line
      if (hasDiscount) {
        const discountAmt = itemTotalFromDB - finalPrice;
        itemsArray.push({
          serviceName: "Descuento aplicado",
          vehicleLabel: "",
          price: -discountAmt,
        });
      }
    } else {
      itemsArray = itemsFromDB;
    }

    // Calculate subtotal and discount
    const positiveItems = itemsArray.filter((i: any) => i.price >= 0);
    const negativeItems = itemsArray.filter((i: any) => i.price < 0);
    const subtotal = positiveItems.reduce((sum: number, item: any) => sum + item.price, 0);
    const discount = Math.abs(negativeItems.reduce((sum: number, item: any) => sum + item.price, 0));

    // Get customer data with phone for WhatsApp
    const customerData = ticket.customer_data;
    const customer = customerData ? {
      name: customerData.name || "Cliente General",
      plate: customerData.plate || ticket.vehicle_plate || "",
      phone: customerData.phone || "",
      is_general: false,
    } : {
      name: "Cliente General",
      plate: ticket.vehicle_plate || "",
      phone: "",
      is_general: true,
    };

    // Build payment info from the payments array
    const primaryPayment = ticket.payments?.[0];
    const payment = primaryPayment ? {
      method: primaryPayment.payment_method || "cash",
      currency: primaryPayment.currency || "NIO",
      received: Number(primaryPayment.amount_received || ticket.total),
      change: Number(primaryPayment.change_amount || 0),
    } : null;

    // Prepare ticket data for printing
    const reprintData = {
      ...ticket,
      customer,
      items: itemsArray,
      subtotal,
      discount,
      total: Number(ticket.total),
      payment,
      settings,
    };

    console.log('Prepared reprint data:', reprintData);
    setReprintTicket(reprintData);
  };


  const rate = settings?.exchange_rate || 36.5;
  const totalNIO = tickets.reduce((s, t) => s + Number(t.total), 0);

  // Calculate actual payment totals by currency
  let payTotalNIO = 0;
  let payTotalUSD = 0;
  tickets.forEach((t: any) => {
    t.payments?.forEach((p: any) => {
      if (p.currency === "USD") {
        payTotalUSD += Number(p.amount);
      } else {
        payTotalNIO += Number(p.amount);
      }
    });
  });

  // Membership-specific metrics
  const membershipSalesTotal = tickets
    .filter((t: any) => t.is_membership_sale)
    .reduce((s, t) => s + Number(t.total), 0);
  const membershipUsageCount = tickets.filter((t: any) => t.is_membership_usage).length;
  const regularSalesTotal = tickets
    .filter((t: any) => !t.is_membership_sale && !t.is_membership_usage)
    .reduce((s, t) => s + Number(t.total), 0);

  // Summary aggregations
  const byService: Record<string, { count: number; total: number }> = {};
  const byVehicle: Record<string, { count: number; total: number }> = {};
  const byMethod: Record<string, number> = {};
  const cashBreakdown = { nio: 0, usd: 0 };

  tickets.forEach((t: any) => {
    // By service from ticket_items
    t.ticket_items?.forEach((ti: any) => {
      const sn = ti.services?.name || "Otro";
      byService[sn] = byService[sn] || { count: 0, total: 0 };
      byService[sn].count++;
      byService[sn].total += Number(ti.price);
    });

    // By vehicle
    const vn = (t.vehicle_types as any)?.name || "N/A";
    byVehicle[vn] = byVehicle[vn] || { count: 0, total: 0 };
    byVehicle[vn].count++;
    byVehicle[vn].total += Number(t.total);

    // By method with currency awareness
    t.payments?.forEach((p: any) => {
      let amountNIO = Number(p.amount);
      if (p.currency === "USD") {
        const paymentRate = Number(p.exchange_rate) || rate;
        amountNIO = amountNIO * paymentRate;
        if (p.payment_method === "cash") cashBreakdown.usd += Number(p.amount);
      } else {
        if (p.payment_method === "cash") cashBreakdown.nio += Number(p.amount);
      }
      byMethod[p.payment_method] = (byMethod[p.payment_method] || 0) + amountNIO;
    });
  });

  const filteredTickets = tickets.filter(t => {
    const name = t.customer_name?.toLowerCase() || "";
    return name.includes(searchTerm.toLowerCase());
  });

  const formatDate = (iso: string) => niFormatDate(iso, { day: "2-digit", month: "2-digit", year: "numeric" });
  const formatTime = (iso: string) => niFormatTime(iso);

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <h2 className="text-2xl font-bold text-foreground">
        <i className="fa-solid fa-file-lines mr-3 text-secondary" />Reportes
      </h2>

      {/* Filters */}
      <div className="pos-card p-4 flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-xs font-semibold text-foreground mb-1">Desde</label>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="input-touch" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-foreground mb-1">Hasta</label>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="input-touch" />
        </div>
        <button onClick={loadReport} className="touch-btn bg-accent text-accent-foreground px-6 py-3 rounded-xl font-semibold flex items-center gap-2">
          <i className="fa-solid fa-magnifying-glass" />Consultar
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12"><i className="fa-solid fa-spinner fa-spin text-3xl text-accent" /></div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="pos-card p-6 text-center">
              <p className="text-sm text-secondary">Total ventas</p>
              <p className="text-2xl font-bold text-foreground">C${totalNIO.toFixed(2)}</p>
              <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                {payTotalNIO > 0 && <p>NIO: C${payTotalNIO.toFixed(2)}</p>}
                {payTotalUSD > 0 && <p className="text-green-500">+ USD: ${payTotalUSD.toFixed(2)}</p>}
              </div>
            </div>
            <div className="pos-card p-6 text-center">
              <p className="text-sm text-secondary">Ventas Membresías</p>
              <p className="text-2xl font-bold text-primary">C${membershipSalesTotal.toFixed(2)}</p>
              <p className="text-sm text-muted-foreground">{tickets.filter((t: any) => t.is_membership_sale).length} tickets</p>
            </div>
            <div className="pos-card p-6 text-center">
              <p className="text-sm text-secondary">Usos Membresías</p>
              <p className="text-2xl font-bold text-accent">{membershipUsageCount}</p>
              <p className="text-sm text-muted-foreground">lavados redimidos</p>
            </div>
            <div className="pos-card p-6 text-center">
              <p className="text-sm text-secondary">Ventas Regulares</p>
              <p className="text-2xl font-bold text-foreground">C${regularSalesTotal.toFixed(2)}</p>
              <p className="text-sm text-muted-foreground">{tickets.filter((t: any) => !t.is_membership_sale && !t.is_membership_usage).length} tickets</p>
            </div>
          </div>

          {/* Summary by service / vehicle / method */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="pos-card p-4">
              <h3 className="font-bold text-sm text-foreground mb-3"><i className="fa-solid fa-list-check mr-2 text-secondary" />Por servicio</h3>
              {Object.entries(byService).length === 0 && <p className="text-xs text-muted-foreground">Sin datos</p>}
              {Object.entries(byService).map(([name, d]) => (
                <div key={name} className="flex justify-between py-1 border-b border-border last:border-0 text-sm">
                  <span className="text-foreground">{name} ({d.count})</span>
                  <span className="font-semibold">C${d.total.toFixed(2)}</span>
                </div>
              ))}
            </div>
            <div className="pos-card p-4">
              <h3 className="font-bold text-sm text-foreground mb-3"><i className="fa-solid fa-car mr-2 text-secondary" />Por vehículo</h3>
              {Object.entries(byVehicle).length === 0 && <p className="text-xs text-muted-foreground">Sin datos</p>}
              {Object.entries(byVehicle).map(([type, d]) => (
                <div key={type} className="flex justify-between py-1 border-b border-border last:border-0 text-sm">
                  <span className="text-foreground">{type} ({d.count})</span>
                  <span className="font-semibold">C${d.total.toFixed(2)}</span>
                </div>
              ))}
            </div>
            <div className="pos-card p-4">
              <h3 className="font-bold text-sm text-foreground mb-3"><i className="fa-solid fa-credit-card mr-2 text-secondary" />Por método</h3>
              {Object.entries(byMethod).length === 0 && <p className="text-xs text-muted-foreground">Sin datos</p>}
              {Object.entries(byMethod).map(([method, total]) => (
                <div key={method} className="space-y-1 py-1 border-b border-border last:border-0">
                  <div className="flex justify-between text-sm">
                    <span className="text-foreground">{methodLabels[method] || method}</span>
                    <span className="font-semibold">C${total.toFixed(2)}</span>
                  </div>
                  {method === "cash" && (
                    <div className="flex justify-between text-[10px] text-muted-foreground px-2">
                      <span>NIO: C${cashBreakdown.nio.toFixed(2)}</span>
                      <span>USD: ${cashBreakdown.usd.toFixed(2)}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Detail table */}
          <div className="pos-card overflow-hidden">
            <div className="p-4 border-b border-border flex items-center justify-between gap-4">
              <h3 className="font-bold text-foreground">
                <i className="fa-solid fa-table mr-2 text-secondary" />Detalle de tickets ({filteredTickets.length})
              </h3>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <i className="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs" />
                  <input
                    type="text"
                    placeholder="Buscar por nombre..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-8 pr-4 py-1.5 bg-background border border-border rounded-lg text-xs focus:ring-1 focus:ring-accent outline-none w-48"
                  />
                </div>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="text-left px-4 py-3 font-semibold text-secondary whitespace-nowrap">#</th>
                    <th className="text-left px-4 py-3 font-semibold text-secondary whitespace-nowrap">Fecha</th>
                    <th className="text-left px-4 py-3 font-semibold text-secondary whitespace-nowrap">Hora</th>
                    <th className="text-left px-4 py-3 font-semibold text-secondary whitespace-nowrap">Servicio</th>
                    <th className="text-left px-4 py-3 font-semibold text-secondary whitespace-nowrap">Vehículo</th>
                    <th className="text-left px-4 py-3 font-semibold text-secondary whitespace-nowrap">Placa</th>
                    <th className="text-left px-4 py-3 font-semibold text-secondary whitespace-nowrap">Cliente</th>
                    <th className="text-left px-4 py-3 font-semibold text-secondary whitespace-nowrap">Método</th>
                    <th className="text-left px-4 py-3 font-semibold text-secondary whitespace-nowrap">Registró</th>
                    <th className="text-right px-4 py-3 font-semibold text-secondary whitespace-nowrap">Total</th>
                    <th className="text-center px-4 py-3 font-semibold text-secondary whitespace-nowrap">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTickets.length === 0 && (
                    <tr>
                      <td colSpan={11} className="px-4 py-12 text-center text-muted-foreground">
                        <i className="fa-solid fa-inbox text-3xl mb-2 opacity-30 block" />
                        No se encontraron tickets con los filtros aplicados
                      </td>
                    </tr>
                  )}
                  {filteredTickets.map((t: any, idx: number) => {
                    const serviceNames = t.ticket_items?.map((ti: any) => ti.services?.name).filter(Boolean).join(", ") || "—";
                    const vehicleName = (t.vehicle_types as any)?.name || "—";
                    const paymentMethods = t.payments?.map((p: any) => methodLabels[p.payment_method] || p.payment_method).join(", ") || "—";
                    const cashierName = t.cashier_name || "—";
                    const customerName = t.customer_name || "—";

                    return (
                      <tr key={t.id} className={`border-b border-border/50 hover:bg-muted/30 transition-colors ${idx % 2 === 0 ? "" : "bg-muted/10"}`}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs text-muted-foreground">{t.ticket_number}</span>
                            {t.is_membership_sale && (
                              <span className="px-2 py-0.5 rounded-full text-xs bg-primary/20 text-primary font-semibold" title="Venta de Membresía">
                                <i className="fa-solid fa-id-card mr-1" />Memb.
                              </span>
                            )}
                            {t.is_membership_usage && (
                              <span className="px-2 py-0.5 rounded-full text-xs bg-accent/20 text-accent font-semibold" title="Uso de Membresía">
                                <i className="fa-solid fa-check-circle mr-1" />Uso
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-foreground whitespace-nowrap">{formatDate(t.created_at)}</td>
                        <td className="px-4 py-3 text-foreground whitespace-nowrap">{formatTime(t.created_at)}</td>
                        <td className="px-4 py-3 text-foreground">{serviceNames}</td>
                        <td className="px-4 py-3 text-foreground">{vehicleName}</td>
                        <td className="px-4 py-3 text-foreground font-mono">{t.vehicle_plate || "—"}</td>
                        <td className="px-4 py-3 text-foreground">{customerName}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-1">
                            {t.payments?.map((p: any, pi: number) => (
                              <span key={pi} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs whitespace-nowrap ${p.currency === "USD" ? "bg-green-500/20 text-green-600" : "bg-accent/20 text-accent"}`}>
                                {methodLabels[p.payment_method] || p.payment_method}
                                <span className="font-bold">· {p.currency || "NIO"}</span>
                              </span>
                            )) || <span className="text-muted-foreground text-xs">—</span>}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-foreground">{cashierName}</td>
                        <td className="px-4 py-3 text-right font-bold text-primary whitespace-nowrap">
                          {t.payments?.[0]?.currency === "USD"
                            ? `$${Number(t.total).toFixed(2)}`
                            : `C$${Number(t.total).toFixed(2)}`
                          }
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => handleReprint(t)}
                              className="touch-btn p-2 text-accent hover:bg-accent/10 rounded"
                              title="Reimprimir"
                            >
                              <i className="fa-solid fa-print" />
                            </button>
                            <button
                              onClick={() => setEditingTicket({ ...t })}
                              className="touch-btn p-2 text-secondary hover:bg-secondary/10 rounded"
                              title="Editar"
                            >
                              <i className="fa-solid fa-pen" />
                            </button>
                            <button
                              onClick={() => setDeletingTicket(t)}
                              className="touch-btn p-2 text-destructive hover:bg-destructive/10 rounded"
                              title="Eliminar"
                            >
                              <i className="fa-solid fa-trash-can" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {tickets.length > 0 && (
                  <tfoot>
                    <tr className="bg-muted/50 border-t-2 border-border">
                      <td colSpan={9} className="px-4 py-3 font-bold text-foreground text-right">TOTAL:</td>
                      <td className="px-4 py-3 text-right font-bold text-primary text-lg">C${totalNIO.toFixed(2)}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </>
      )}

      {/* Edit Modal */}
      {editingTicket && (
        <div className="modal-overlay" onClick={() => setEditingTicket(null)}>
          <div className="modal-content animate-scale-in max-w-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-foreground">
                <i className="fa-solid fa-pen mr-2 text-secondary" />
                Editar Ticket {editingTicket.ticket_number}
              </h2>
              <button onClick={() => setEditingTicket(null)} className="touch-btn p-2 text-muted-foreground">
                <i className="fa-solid fa-xmark text-xl" />
              </button>
            </div>

            <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">

              {/* Total + Currency */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-foreground mb-1">Total</label>
                  <input
                    type="number"
                    value={editingTicket.total ?? 0}
                    onChange={(e) => setEditingTicket({ ...editingTicket, total: parseFloat(e.target.value) || 0 })}
                    className="input-touch w-full"
                    step="0.01" min="0"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-foreground mb-1">Moneda</label>
                  <select
                    value={editingTicket._editCurrency ?? editingTicket.payments?.[0]?.currency ?? "NIO"}
                    onChange={(e) => setEditingTicket({ ...editingTicket, _editCurrency: e.target.value })}
                    className="input-touch w-full"
                  >
                    <option value="NIO">C$ Córdobas (NIO)</option>
                    <option value="USD">$ Dólares (USD)</option>
                  </select>
                  <p className="text-xs text-muted-foreground mt-1">
                    Tasa: C${settings?.exchange_rate || 36.5} por $1 USD
                  </p>
                </div>
              </div>

              {/* Payment Method */}
              <div>
                <label className="block text-sm font-semibold text-foreground mb-1">Método de pago</label>
                <select
                  value={editingTicket._editPaymentMethod ?? editingTicket.payments?.[0]?.payment_method ?? "cash"}
                  onChange={(e) => setEditingTicket({ ...editingTicket, _editPaymentMethod: e.target.value })}
                  className="input-touch w-full"
                >
                  <option value="cash">Efectivo</option>
                  <option value="card">Tarjeta</option>
                  <option value="transfer">Transferencia</option>
                </select>
              </div>

              {/* Service */}
              <div>
                <label className="block text-sm font-semibold text-foreground mb-1">Servicio</label>
                <select
                  value={editingTicket._editServiceId ?? editingTicket.ticket_items?.[0]?.service_id ?? ""}
                  onChange={(e) => setEditingTicket({ ...editingTicket, _editServiceId: Number(e.target.value) })}
                  className="input-touch w-full"
                >
                  <option value="">— Sin cambiar —</option>
                  {services.map((s: any) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              {/* Cliente */}
              <div>
                <label className="block text-sm font-semibold text-foreground mb-1">Cliente</label>
                <select
                  value={editingTicket._editCustomerId ?? editingTicket.customer_id ?? ""}
                  onChange={(e) => setEditingTicket({ ...editingTicket, _editCustomerId: e.target.value || null })}
                  className="input-touch w-full"
                >
                  <option value="">Cliente General</option>
                  {customers.map((c: any) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              {/* Placa */}
              <div>
                <label className="block text-sm font-semibold text-foreground mb-1">Placa del vehículo</label>
                <input
                  type="text"
                  value={editingTicket.vehicle_plate || ""}
                  onChange={(e) => setEditingTicket({ ...editingTicket, vehicle_plate: e.target.value })}
                  className="input-touch w-full"
                  placeholder="Ej: ABC-123"
                />
              </div>

              {/* Tipo de vehículo */}
              <div>
                <label className="block text-sm font-semibold text-foreground mb-1">Tipo de vehículo</label>
                <select
                  value={editingTicket._editVehicleTypeId ?? editingTicket.vehicle_type_id ?? ""}
                  onChange={(e) => setEditingTicket({ ...editingTicket, _editVehicleTypeId: Number(e.target.value) || null })}
                  className="input-touch w-full"
                >
                  <option value="">— Sin cambiar —</option>
                  <option value={1}>Moto</option>
                  <option value={2}>Sedán</option>
                  <option value={3}>SUV</option>
                  <option value={4}>Pick up</option>
                  <option value={5}>Microbús</option>
                  <option value={6}>Taxi</option>
                </select>
              </div>

              {(!editingTicket.payments || editingTicket.payments.length === 0) && (
                <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-xs text-yellow-700">
                  <i className="fa-solid fa-triangle-exclamation mr-1" />
                  Este ticket no tiene pago registrado. Se creará uno nuevo al guardar.
                </div>
              )}
            </div>

            <div className="flex gap-2 mt-6">
              <button
                onClick={() => setEditingTicket(null)}
                className="touch-btn flex-1 py-3 rounded-xl border border-border text-foreground font-semibold"
              >
                Cancelar
              </button>
              <button
                onClick={handleEditSave}
                className="flex-1 py-3 rounded-xl bg-accent text-accent-foreground font-semibold hover:bg-accent/90 transition-colors"
              >
                <i className="fa-solid fa-save mr-2" />Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingTicket && (
        <div className="modal-overlay" onClick={() => setDeletingTicket(null)}>
          <div className="modal-content animate-scale-in max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-foreground">
                <i className="fa-solid fa-triangle-exclamation mr-2 text-destructive" />
                Confirmar eliminación
              </h2>
              <button onClick={() => setDeletingTicket(null)} className="touch-btn p-2 text-muted-foreground">
                <i className="fa-solid fa-xmark text-xl" />
              </button>
            </div>
            <p className="text-foreground mb-6">
              ¿Estás seguro de que deseas eliminar el ticket <strong>{deletingTicket.ticket_number}</strong>?
              Esta acción no se puede deshacer.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setDeletingTicket(null)}
                className="touch-btn flex-1 py-3 rounded-xl border border-border text-foreground font-semibold"
              >
                Cancelar
              </button>
              <button
                onClick={handleDeleteConfirm}
                className="flex-1 py-3 rounded-xl bg-destructive text-white font-semibold hover:bg-red-600 transition-colors"
              >
                <i className="fa-solid fa-trash-can mr-2" />
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reprint Modal */}
      {reprintTicket && (
        <TicketPrint
          ticket={reprintTicket}
          onClose={() => setReprintTicket(null)}
        />
      )}

      {/* Toast */}
      {toast && <div className="toast-success"><i className="fa-solid fa-circle-check mr-2" />{toast}</div>}
    </div>
  );
}
