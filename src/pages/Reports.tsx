import { useTicketRefresh } from "@/hooks/useTicketRefresh";
import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useBusinessSettings } from "@/hooks/useBusinessSettings";
import { useAuth } from "@/hooks/useAuth";
import TicketPrint from "@/components/pos/TicketPrint";
import PermissionModal from "@/components/PermissionModal";
import ReportsSalesTrendChart from "@/components/reports/ReportsSalesTrendChart";
import ReportsVehicleByDayChart from "@/components/reports/ReportsVehicleByDayChart";
import { buildSalesTrendData, buildVehicleVisitsByDayData } from "@/lib/reportsChartData";
import { fetchReportRows, fetchReportRowsForIds } from "@/lib/fetchReportRows";
import { niToday, niFormatDate, niFormatTime } from "@/utils/niDate";
import { useQueryClient } from "@tanstack/react-query";
import { deleteReportTicket, invalidateTicketData } from "@/lib/ticketMutation";
import { useBusinessLine } from "@/contexts/BusinessLineContext";
import { BUSINESS_LINE_LABELS } from "@/lib/businessLine";

const methodLabels: Record<string, string> = { cash: "Efectivo", card: "Tarjeta", transfer: "Transferencia", mixed: "Mixto" };

export default function Reports() {
  const queryClient = useQueryClient();
  const { businessLine, isBarbershop } = useBusinessLine();
  const { data: settings } = useBusinessSettings();
  const { isCajero } = useAuth();
  const [dateFrom, setDateFrom] = useState(() => niToday());
  const [dateTo, setDateTo] = useState(() => niToday());
  const [tickets, setTickets] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [vehicleTypes, setVehicleTypes] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingTicket, setEditingTicket] = useState<any>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingTicket, setDeletingTicket] = useState<any>(null);
  const [reprintTicket, setReprintTicket] = useState<any>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  // Map ticket_id -> mixed parts for breakdown display
  const [mixedPartsMap, setMixedPartsMap] = useState<Record<string, { method: string; amount: number; currency: string; applied_nio: number }[]>>({});

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const loadReport = async () => {
    setLoading(true);
    const fromISO = `${dateFrom}T00:00:00-06:00`;
    const toISO = `${dateTo}T23:59:59-06:00`;

    try {
      // Match every paid ticket in the selected date range, not just the first API page.
      const rawTickets = await fetchReportRows((from, to) => supabase
        .from("tickets")
        .select("*, vehicle_types(name)")
        .eq("business_line", businessLine)
        .gte("created_at", fromISO)
        .lte("created_at", toISO)
        .eq("status", "paid")
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to));

      console.log("[Reports] tickets query:", { from: fromISO, to: toISO, count: rawTickets.length });

      if (rawTickets.length === 0) {
        setTickets([]);
        setMixedPartsMap({});
        return;
      }

      const ticketIds = rawTickets.map((t: any) => t.id);
      const customerIds = [...new Set(rawTickets.map((t: any) => t.customer_id).filter(Boolean))];
      const userIds = [...new Set(rawTickets.map((t: any) => t.user_id).filter(Boolean))];

      // Related rows are also paginated; a long report can have more than 1,000 items.
      const [paymentsRaw, allItems, membershipWashes, customers, profiles] = await Promise.all([
        fetchReportRowsForIds(ticketIds, (chunk, from, to) => supabase
          .from("payments").select("*").in("ticket_id", chunk).order("id").range(from, to)),
        fetchReportRowsForIds(ticketIds, (chunk, from, to) => (supabase as any)
          .from("ticket_items").select("*, services(name)").in("ticket_id", chunk).order("id").range(from, to)),
        fetchReportRowsForIds(ticketIds, (chunk, from, to) => supabase
          .from("membership_washes").select("ticket_id, membership_id").in("ticket_id", chunk).order("id").range(from, to)),
        fetchReportRowsForIds(customerIds, (chunk, from, to) => supabase
          .from("customers").select("id, name, plate, phone").in("id", chunk).order("id").range(from, to)),
        fetchReportRowsForIds(userIds, (chunk, from, to) => supabase
          .from("profiles").select("id, full_name").in("id", chunk).order("id").range(from, to)),
      ]);

    // Build a payments map: ticket_id -> payments[]
    // Use String() keys to prevent UUID/number type mismatch
    const paymentsMap: Record<string, any[]> = {};
    paymentsRaw.forEach((p: any) => {
      const key = String(p.ticket_id);
      if (!paymentsMap[key]) paymentsMap[key] = [];
      paymentsMap[key].push(p);
    });

    // Merge payments into rawTickets
    const rawTicketsWithPayments = rawTickets.map((t: any) => ({
      ...t,
      payments: paymentsMap[String(t.id)] || [],
    }));

    // Create map of ticket_id -> has membership usage
    const membershipWashMap: Record<string, boolean> = {};
    membershipWashes.forEach((mw: any) => {
      if (mw.ticket_id) {
        membershipWashMap[mw.ticket_id] = true;
      }
    });

    const customerMap: Record<string, any> = {};
    customers.forEach((c: any) => { customerMap[c.id] = c; });

    const profileMap: Record<string, string> = {};
    profiles.forEach((p: any) => { profileMap[p.id] = p.full_name || ""; });

    const itemsMap: Record<string, any[]> = {};
    allItems.forEach((item: any) => {
      const key = String(item.ticket_id);
      if (!itemsMap[key]) itemsMap[key] = [];
      itemsMap[key].push(item);
    });

    // Merge items, profile, customer, and membership info into tickets
    const enriched = rawTicketsWithPayments.map((t: any) => ({
      ...t,
      ticket_items: itemsMap[String(t.id)] || [],
      cashier_name: profileMap[t.user_id] || "—",
      customer_data: t.customer_id ? customerMap[t.customer_id] : null,
      customer_name: t.customer_id ? (customerMap[t.customer_id]?.name || "—") : "—",
      is_membership_usage: membershipWashMap[String(t.id)] || false,
      is_membership_sale: t.ticket_number?.startsWith("M-") || t.ticket_number?.startsWith("MR-") || false,
    }));

    // Fetch mixed payment breakdowns for mixed tickets in range
    const mixedTicketIds = rawTicketsWithPayments
      .filter((t: any) => t.payments?.some((p: any) => p.payment_method === "mixed"))
      .map((t: any) => t.id);

    if (mixedTicketIds.length > 0) {
      try {
        const mixedRows = await fetchReportRowsForIds(mixedTicketIds, (chunk, from, to) => (supabase as any)
          .from("ticket_mixed_payments")
          .select("ticket_id, method, amount, currency, applied_nio")
          .in("ticket_id", chunk)
          .order("id")
          .range(from, to));
        const partsMap: Record<string, { method: string; amount: number; currency: string; applied_nio: number }[]> = {};
        mixedRows.forEach((row: any) => {
          const tid = String(row.ticket_id);
          if (!partsMap[tid]) partsMap[tid] = [];
          partsMap[tid].push({
            method: row.method,
            amount: Number(row.amount),
            currency: row.currency,
            applied_nio: Math.max(0, Number(row.applied_nio) || 0),
          });
        });
        setMixedPartsMap(partsMap);
      } catch (error) {
        console.error("[Reports] ticket_mixed_payments error:", error);
        setMixedPartsMap({});
      }
    } else {
      setMixedPartsMap({});
    }

    setTickets(enriched);
    } catch (error) {
      console.error("Error loading tickets:", error);
      showToast("Error al cargar todos los tickets del reporte");
      setTickets([]);
      setMixedPartsMap({});
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadReport(); loadCatalogs(); }, [businessLine]);

  const loadCatalogs = async () => {
    const [{ data: svcs }, { data: custs }, { data: vehicles }] = await Promise.all([
      supabase.from("services").select("id, name, service_prices(vehicle_type_id, price, variant_sort)")
        .eq("is_active", true).eq("is_extra", false).eq("business_line", businessLine).order("name"),
      supabase.from("customers").select("id, name, is_general").order("name"),
      supabase.from("vehicle_types").select("id, name, is_active").order("sort_order"),
    ]);
    setServices(svcs || []);
    setCustomers(custs || []);
    setVehicleTypes(vehicles || []);
  };

  useTicketRefresh(loadReport);

  const handleDeleteConfirm = async () => {
    if (isCajero) {
      setShowPermissionModal(true);
      return;
    }
    if (!deletingTicket) return;

    try {
      await deleteReportTicket(deletingTicket.id);
      await invalidateTicketData(queryClient);

      showToast("Ticket eliminado correctamente");
      setDeletingTicket(null);
      loadReport();
    } catch (err: any) {
      showToast("Error al eliminar ticket: " + err.message);
    }
  };

  const handleEditSave = async () => {
    if (!editingTicket || savingEdit) return;
    const items = editingTicket.ticket_items || [];
    const payments = editingTicket.payments || [];
    const protectedTicket = editingTicket.is_membership_sale || editingTicket.is_membership_usage || editingTicket.is_loyalty_redemption;
    const singleItem = items.length === 1 && items[0]?.item_type === "service";
    const mixedPayment = payments.length !== 1 || payments[0]?.payment_method === "mixed" || !!mixedPartsMap[String(editingTicket.id)]?.length;
    const originalServiceId = items[0]?.service_id ?? null;
    const serviceId = editingTicket._editServiceId ?? originalServiceId;
    const vehicleTypeId = editingTicket._editVehicleTypeId ?? editingTicket.vehicle_type_id;
    const serviceChanged = serviceId !== originalServiceId;
    const vehicleChanged = vehicleTypeId !== editingTicket.vehicle_type_id;
    const canEditMoney = !protectedTicket && singleItem && !mixedPayment;
    const paymentChanged = editingTicket._editPaymentMethod && editingTicket._editPaymentMethod !== payments[0]?.payment_method;
    const currencyChanged = editingTicket._editCurrency && editingTicket._editCurrency !== payments[0]?.currency;
    if (protectedTicket) { showToast("Este ticket tiene membresía o canje; conserva su registro original"); return; }
    if (!Number.isFinite(Number(editingTicket.total)) || Number(editingTicket.total) < 0) {
      showToast("Ingresa un total válido"); return;
    }
    if (!canEditMoney && Number(editingTicket.total) !== Number(editingTicket._originalTotal ?? editingTicket.total)) {
      showToast("No se puede modificar el total de este ticket"); return;
    }
    if (mixedPayment && (paymentChanged || currencyChanged)) { showToast("No se puede modificar el pago de este ticket"); return; }
    if (serviceChanged && !singleItem) { showToast("Solo se puede cambiar el servicio de tickets con un concepto"); return; }
    if ((serviceChanged || vehicleChanged) && serviceId != null && businessLine === "car_wash") {
      const selected = services.find((s: any) => s.id === serviceId);
      if (selected && !selected.service_prices?.some((p: any) => p.vehicle_type_id === vehicleTypeId && Number(p.price) >= 0)) {
        showToast("Ese servicio no está disponible para el tipo de vehículo elegido"); return;
      }
      if (serviceChanged && !selected) { showToast("Selecciona un servicio activo del catálogo"); return; }
    }
    setSavingEdit(true);
    try {
      const changes: Record<string, unknown> = {
        vehicle_plate: editingTicket.vehicle_plate ?? editingTicket.plate,
        total: Number(editingTicket.total),
        customer_id: editingTicket._editCustomerId ?? editingTicket.customer_id,
        vehicle_type_id: vehicleTypeId,
        service_id: serviceChanged ? serviceId : undefined,
      };
      if (editingTicket._editPaymentMethod && editingTicket._editPaymentMethod !== editingTicket.payments?.[0]?.payment_method) {
        changes.payment_method = editingTicket._editPaymentMethod;
      }
      if (editingTicket._editCurrency && editingTicket._editCurrency !== editingTicket.payments?.[0]?.currency) {
        changes.currency = editingTicket._editCurrency;
      }
      const { data, error } = await (supabase as any).rpc("edit_report_ticket", {
        p_ticket_id: editingTicket.id, p_changes: changes,
        p_expected_updated_at: editingTicket.updated_at || null,
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "No se pudo actualizar el ticket");
      await invalidateTicketData(queryClient);

      showToast("Ticket actualizado correctamente");
      setEditingTicket(null);
      loadReport();
    } catch (err: any) {
      console.error("Error in handleEditSave:", err);
      let errMsg = err.message || JSON.stringify(err);
      if (errMsg.includes("permission denied") || errMsg.includes("403") || errMsg.includes("row-level security")) {
        errMsg = "Error de permisos (RLS): El usuario no tiene autorización para editar este pago o ticket. Favor contactar al administrador para habilitar las políticas de edición.";
      }
      showToast("Error al actualizar ticket: " + errMsg);
    } finally {
      setSavingEdit(false);
    }
  };

  const handleReprint = (ticket: any) => {
    console.log('Reprint ticket data:', ticket);

    const isMembershipSale = ticket.is_membership_sale || ticket.ticket_number?.startsWith("M-") || ticket.ticket_number?.startsWith("MR-");

    // Build items array with proper service names and prices
    const itemsFromDB = ticket.ticket_items?.map((ti: any) => {
      const finalPrice = Number(ti.price);
      const originalPrice = (ti.price_snapshot !== null && ti.price_snapshot !== undefined) 
        ? Number(ti.price_snapshot) 
        : finalPrice;
        
      let discountPercent = 0;
      if (originalPrice > 0 && finalPrice < originalPrice) {
        discountPercent = Math.round((1 - finalPrice / originalPrice) * 100);
      }

      return {
        serviceName: ti.services?.name || ti.service_name_snapshot || "Servicio",
        vehicleLabel: (ticket.vehicle_types as any)?.name || "",
        price: originalPrice,
        discountPercent: discountPercent,
        quantity: Number(ti.quantity || 1),
      };
    }) || [];

    // For membership sale tickets, enhance the item name with membership context
    let itemsArray: any[];
    if (isMembershipSale && itemsFromDB.length > 0) {
      // The ticket.total is the final price paid
      const finalPrice = Number(ticket.total);
      const itemTotalFromDB = itemsFromDB.reduce((s: number, i: any) => s + (i.price * i.quantity), 0);

      // If there's a difference between the item total and ticket total, there was a discount
      const hasDiscount = itemTotalFromDB > finalPrice;

      itemsArray = [{
        serviceName: `MEMBRESÍA: ${itemsFromDB[0].serviceName}`,
        vehicleLabel: itemsFromDB[0].vehicleLabel,
        price: itemTotalFromDB,
        quantity: 1,
        discountPercent: 0,
      }];

      // If there's a discount difference, add a discount line
      if (hasDiscount) {
        const discountAmt = itemTotalFromDB - finalPrice;
        itemsArray.push({
          serviceName: "Descuento aplicado",
          vehicleLabel: "",
          price: -discountAmt,
          quantity: 1,
          discountPercent: 0,
        });
      }
    } else {
      itemsArray = itemsFromDB;
    }

    // Calculate subtotal and discount
    const subtotal = itemsArray.reduce((sum: number, item: any) => {
      if (item.price < 0) return sum;
      return sum + (item.price * (item.quantity || 1));
    }, 0);

    const discount = itemsArray.reduce((sum: number, item: any) => {
      if (item.price < 0) {
        return sum + Math.abs(item.price);
      }
      if (item.discountPercent > 0) {
        return sum + (item.price * (item.quantity || 1) * (item.discountPercent / 100));
      }
      return sum;
    }, 0);

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
    const isMixed = primaryPayment?.payment_method === "mixed";

    // Retrieve mixed parts for reprint if available
    const mixedParts = isMixed
      ? (mixedPartsMap[String(ticket.id)] || []).map((part: any) => ({
          method: part.method,
          amount: part.amount,
          received: part.amount,
          change: 0,
        }))
      : undefined;

    const payment = primaryPayment ? {
      method: primaryPayment.payment_method || "cash",
      currency: primaryPayment.currency || "NIO",
      received: Number(primaryPayment.amount_received || ticket.total),
      change: Number(primaryPayment.change_amount || 0),
      amount: Number(primaryPayment.amount || ticket.total),
      ...(isMixed && mixedParts ? { mixedPayments: mixedParts } : {}),
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

  // Calculate actual payment totals by currency
  // IMPORTANT: skip "mixed" payments — their amount is the NIO equivalent of the full ticket
  // which would double-count once we also sum from ticket_mixed_payments parts.
  // For mixed tickets we compute currency totals from the parts breakdown instead.
  let payTotalNIO = 0;
  let payTotalUSD = 0;
  tickets.forEach((t: any) => {
    t.payments?.forEach((p: any) => {
      if (p.payment_method === "mixed") {
        // Contribute from parts breakdown (already loaded in mixedPartsMap)
        const parts = mixedPartsMap[String(t.id)] || [];
        if (parts.length > 0) {
          parts.forEach((part) => {
            if (part.currency === "USD") {
              payTotalUSD += Number(part.amount);
            } else {
              // Use applied_nio if available, else part.amount
              payTotalNIO += part.applied_nio > 0 ? part.applied_nio : Number(part.amount);
            }
          });
        } else {
          // Fallback: no parts available, count as NIO
          payTotalNIO += Number(p.amount);
        }
      } else if (p.currency === "USD") {
        payTotalUSD += Number(p.amount);
      } else {
        payTotalNIO += Number(p.amount);
      }
    });
  });

  const totalNIO = payTotalNIO + (payTotalUSD * rate);

  // Membership-specific metrics
  const membershipSalesTotal = tickets
    .filter((t: any) => t.is_membership_sale)
    .reduce((s, t) => s + Number(t.total), 0);
  const membershipUsageCount = tickets.filter((t: any) => t.is_membership_usage).length;
  const regularSalesTotal = tickets
    .filter((t: any) => !t.is_membership_sale && !t.is_membership_usage)
    .reduce((s, t) => s + Number(t.total), 0);

  // Loyalty redemption metrics
  const loyaltyTickets = tickets.filter((t: any) => t.is_loyalty_redemption);
  const loyaltyCanjesCount = loyaltyTickets.length;
  const loyaltyOriginalTotal = loyaltyTickets.reduce((s: number, t: any) => s + Number(t.loyalty_original_amount || 0), 0);

  // Summary aggregations — single source of truth: payments + ticket_mixed_payments
  const byService: Record<string, { count: number; total: number }> = {};
  const byVehicle: Record<string, { count: number; total: number }> = {};
  const byMethod: Record<string, number> = {};
  const cashBreakdown = { nio: 0, usd: 0 };
  // Mixed sub-breakdown
  const mixedSubBreakdown: Record<string, number> = { cash: 0, card: 0, transfer: 0 };

  tickets.forEach((t: any) => {
    // By service: use tickets.total distributed proportionally across items
    // (consistent with byVehicle which also uses t.total)
    const items = t.ticket_items || [];
    if (items.length > 0) {
      // Compute raw sum of item prices to get proportions
      const itemPriceSum = items.reduce((s: number, ti: any) => s + Number(ti.price), 0);
      const ticketTotal = Number(t.total);
      items.forEach((ti: any) => {
        const sn = ti.services?.name || ti.service_name_snapshot || "Otro";
        byService[sn] = byService[sn] || { count: 0, total: 0 };
        byService[sn].count++;
        // Distribute tickets.total proportionally — if only one item, full total goes to it
        const proportion = itemPriceSum > 0 ? (Number(ti.price) / itemPriceSum) : (1 / items.length);
        byService[sn].total += ticketTotal * proportion;
      });
    }

    // By vehicle
    const vn = (t.vehicle_types as any)?.name || "N/A";
    byVehicle[vn] = byVehicle[vn] || { count: 0, total: 0 };
    byVehicle[vn].count++;
    byVehicle[vn].total += Number(t.total);

    // By method with currency awareness and mixed payment distribution
    t.payments?.forEach((p: any) => {
      // Convert USD payments to NIO equivalent before accumulating into byMethod
      // Without this, a $6.03 USD cash payment appears as C$6.03 instead of C$220.10
      const exRate = settings?.exchange_rate || 36.5;
      const amountNIO = p.currency === "USD" ? Number(p.amount) * exRate : Number(p.amount);
      
      if (p.payment_method === "mixed") {
        const parts = mixedPartsMap[String(t.id)] || [];
        const exRate = settings?.exchange_rate || 36.5;
        const mixedTotalNio = parts.length > 0
          ? parts.reduce((s, part) => {
              const partNio = part.applied_nio > 0
                ? part.applied_nio
                : (part.currency === "USD" ? part.amount * exRate : part.amount);
              return s + partNio;
            }, 0)
          : Number(t.total);
        byMethod["mixed"] = (byMethod["mixed"] || 0) + mixedTotalNio;

        parts.forEach((part) => {
          const partNio = part.applied_nio > 0
            ? part.applied_nio
            : (part.currency === "USD" ? part.amount * exRate : part.amount);

          byMethod[part.method] = (byMethod[part.method] || 0) + partNio;
          mixedSubBreakdown[part.method] = (mixedSubBreakdown[part.method] || 0) + partNio;

          if (part.method === "cash") {
            if (part.currency === "USD") {
              cashBreakdown.usd += Number(part.amount);
            } else {
              cashBreakdown.nio += partNio;
            }
          }
        });
      } else {
        // Normal payment
        if (p.currency === "USD") {
          if (p.payment_method === "cash") cashBreakdown.usd += Number(p.amount);
        } else {
          if (p.payment_method === "cash") cashBreakdown.nio += Number(p.amount);
        }
        byMethod[p.payment_method] = (byMethod[p.payment_method] || 0) + amountNIO;
      }
    });
  });

  const filteredTickets = tickets.filter(t => {
    const name = t.customer_name?.toLowerCase() || "";
    return name.includes(searchTerm.toLowerCase());
  });

  const salesTrendData = useMemo(
    () => buildSalesTrendData(tickets, dateFrom, dateTo),
    [tickets, dateFrom, dateTo],
  );
  const vehicleByDayChartData = useMemo(
    () => buildVehicleVisitsByDayData(tickets, dateFrom, dateTo),
    [tickets, dateFrom, dateTo],
  );
  const chartGranularity = dateFrom === dateTo ? "minute" : "day";

  const formatDate = (iso: string) => niFormatDate(iso, { day: "2-digit", month: "2-digit", year: "numeric" });
  const formatTime = (iso: string) => niFormatTime(iso);

  const editItem = editingTicket?.ticket_items?.[0];
  const editPayment = editingTicket?.payments?.[0];
  const editProtected = !!(editingTicket?.is_membership_sale || editingTicket?.is_membership_usage || editingTicket?.is_loyalty_redemption);
  const editSingleService = editingTicket?.ticket_items?.length === 1 && editItem?.item_type === "service";
  const editSinglePayment = editingTicket?.payments?.length === 1 && editPayment?.payment_method !== "mixed" && !mixedPartsMap[String(editingTicket?.id)]?.length;
  const editMoneyAllowed = editSingleService && editSinglePayment && !editProtected;
  const editServiceId = editingTicket?._editServiceId ?? editItem?.service_id;
  const editVehicleTypeId = editingTicket?._editVehicleTypeId ?? editingTicket?.vehicle_type_id;
  const editSelectedService = services.find((s: any) => s.id === Number(editServiceId));
  const editTariff = editSelectedService?.service_prices
    ?.filter((p: any) => p.vehicle_type_id === Number(editVehicleTypeId))
    .sort((a: any, b: any) => a.variant_sort - b.variant_sort)[0];
  const editCurrency = editingTicket?._editCurrency ?? editPayment?.currency ?? "NIO";
  const editRate = Number(editPayment?.exchange_rate) || Number(settings?.exchange_rate) || 36.5;

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <h2 className="text-2xl font-bold text-foreground">
        <i className="fa-solid fa-file-lines mr-3 text-secondary" />
        Reportes — {BUSINESS_LINE_LABELS[businessLine]}
      </h2>

      {/* Filters */}
      <div className="pos-card p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-12 gap-3 items-end">
          <div className="sm:col-span-1 md:col-span-4">
            <label className="block text-xs font-semibold text-foreground mb-1.5 flex items-center gap-1.5">
              <i className="fa-regular fa-calendar text-secondary text-[11px]" />
              <span>Desde</span>
            </label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full h-11 px-3 bg-background border border-border rounded-xl text-sm font-medium text-foreground focus:ring-2 focus:ring-accent outline-none transition-all"
            />
          </div>

          <div className="sm:col-span-1 md:col-span-4">
            <label className="block text-xs font-semibold text-foreground mb-1.5 flex items-center gap-1.5">
              <i className="fa-regular fa-calendar-check text-secondary text-[11px]" />
              <span>Hasta</span>
            </label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full h-11 px-3 bg-background border border-border rounded-xl text-sm font-medium text-foreground focus:ring-2 focus:ring-accent outline-none transition-all"
            />
          </div>

          <div className="sm:col-span-2 md:col-span-4">
            <button
              onClick={loadReport}
              className="w-full h-11 bg-accent text-accent-foreground rounded-xl font-bold text-sm flex items-center justify-center gap-2 shadow-md hover:bg-accent/90 active:scale-[0.98] transition-all cursor-pointer"
            >
              <i className="fa-solid fa-magnifying-glass text-xs" />
              <span>Consultar Reporte</span>
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12"><i className="fa-solid fa-spinner fa-spin text-3xl text-accent" /></div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
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
            {/* Loyalty redemptions card */}
            {loyaltyCanjesCount > 0 && (
              <div className="pos-card p-6 text-center border-amber-300/40" style={{ borderColor: "#C89B5A" }}>
                <p className="text-sm text-secondary flex items-center justify-center gap-1.5">
                  <i className="fa-solid fa-star text-amber-500 text-xs" />
                  Canjes Lealtad
                </p>
                <p className="text-2xl font-bold" style={{ color: "#7F0000" }}>C${loyaltyOriginalTotal.toFixed(2)}</p>
                <p className="text-sm text-muted-foreground">{loyaltyCanjesCount} canje{loyaltyCanjesCount > 1 ? "s" : ""}</p>
              </div>
            )}
          </div>

          {/* Interactive charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
            <div className="pos-card p-4 h-full flex flex-col justify-between space-y-3">
              <div>
                <h3 className="font-bold text-sm text-foreground mb-1">
                  <i className="fa-solid fa-chart-line mr-2 text-secondary" />
                  Ventas en el período
                </h3>
                <p className="text-xs text-muted-foreground">
                  {chartGranularity === "minute"
                    ? "Por minuto · hora exacta (HH:mm:ss) en tooltip"
                    : "Por día"} · Córdobas (C$)
                </p>
              </div>
              <div className="flex-1 flex flex-col justify-between">
                <ReportsSalesTrendChart data={salesTrendData} granularity={chartGranularity} />
              </div>
            </div>
            {!isBarbershop && (
              <div className="pos-card p-4 h-full flex flex-col justify-between space-y-3">
                <div>
                  <h3 className="font-bold text-sm text-foreground mb-1">
                    <i className="fa-solid fa-car mr-2 text-secondary" />
                    Vehículos por día
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Visitas por tipo de vehículo en cada fecha del período
                  </p>
                </div>
                <div className="flex-1 flex flex-col justify-between">
                  <ReportsVehicleByDayChart data={vehicleByDayChartData} />
                </div>
              </div>
            )}
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
                    <span className="text-foreground font-semibold">{methodLabels[method] || method}</span>
                    <span className="font-semibold">C${(total as number).toFixed(2)}</span>
                  </div>
                  {method === "cash" && (cashBreakdown.nio > 0 || cashBreakdown.usd > 0) && (
                    <div className="px-2 pt-0.5 space-y-0.5">
                      <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide">Incluye:</p>
                      {cashBreakdown.nio > 0 && (
                        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                          <span className="text-emerald-400 font-bold">•</span>
                          <span>NIO: C${cashBreakdown.nio.toFixed(2)}</span>
                        </div>
                      )}
                      {cashBreakdown.usd > 0 && (
                        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                          <span className="text-green-400 font-bold">•</span>
                          <span>USD: ${cashBreakdown.usd.toFixed(2)}</span>
                          <span className="italic text-[9px] opacity-70">(ya convertido en el total)</span>
                        </div>
                      )}
                    </div>
                  )}
                  {method === "mixed" && (
                    <div className="px-2 space-y-0.5">
                      {mixedSubBreakdown.cash > 0 && (
                        <div className="flex justify-between text-[10px] text-emerald-600 font-semibold">
                          <span><i className="fa-solid fa-money-bills mr-1" />Efectivo (mixto):</span>
                          <span>C${mixedSubBreakdown.cash.toFixed(2)}</span>
                        </div>
                      )}
                      {mixedSubBreakdown.card > 0 && (
                        <div className="flex justify-between text-[10px] text-blue-600 font-semibold">
                          <span><i className="fa-solid fa-credit-card mr-1" />Tarjeta (mixto):</span>
                          <span>C${mixedSubBreakdown.card.toFixed(2)}</span>
                        </div>
                      )}
                      {mixedSubBreakdown.transfer > 0 && (
                        <div className="flex justify-between text-[10px] text-violet-600 font-semibold">
                          <span><i className="fa-solid fa-building-columns mr-1" />Transfer. (mixto):</span>
                          <span>C${mixedSubBreakdown.transfer.toFixed(2)}</span>
                        </div>
                      )}
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
                    const rawServiceNames = t.ticket_items?.map((ti: any) => ti.services?.name || ti.service_name_snapshot).filter(Boolean).join(", ");
                    const serviceNames = rawServiceNames || (t.is_loyalty_redemption ? "Servicio Premium (Canje)" : "—");
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
                            {t.is_loyalty_redemption && (
                              <span className="px-2 py-0.5 rounded-full text-xs font-semibold" title="Canje Programa de Lealtad" style={{ backgroundColor: "#FEF2DD", color: "#7F0000", border: "1px solid #C89B5A" }}>
                                <i className="fa-solid fa-star mr-1" />Canje
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
                            {t.payments && t.payments.length > 0 ? (
                              t.payments.map((p: any, pi: number) => {
                                const isMixed = p.payment_method === "mixed";
                                const parts = isMixed ? (mixedPartsMap[String(t.id)] || []) : [];
                                return (
                                  <div key={pi} className="flex flex-col gap-0.5">
                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs whitespace-nowrap ${p.currency === "USD" ? "bg-green-500/20 text-green-600" : isMixed ? "bg-orange-100 text-orange-700" : "bg-accent/20 text-accent"}`}>
                                      {methodLabels[p.payment_method] || p.payment_method}
                                      <span className="font-bold">· {p.currency || "NIO"}</span>
                                    </span>
                                    {isMixed && parts.length === 0 && (
                                      <span className="text-[9px] text-muted-foreground italic pl-1">Desglose no disponible</span>
                                    )}
                                    {isMixed && parts.length > 0 && (
                                      <div className="flex flex-col gap-0.5 pl-1">
                                        {parts.map((part, ppi) => {
                                          const partLabel = part.method === "cash" ? "Ef." : part.method === "card" ? "Tj." : "Tr.";
                                          const partColor = part.method === "cash" ? "text-emerald-600" : part.method === "card" ? "text-blue-600" : "text-violet-600";
                                          const isPartUSD = part.currency === "USD";
                                          const exRate = settings?.exchange_rate || 36.5;
                                          const partNio = part.applied_nio > 0
                                            ? part.applied_nio
                                            : (isPartUSD ? part.amount * exRate : part.amount);
                                          const sym = isPartUSD ? "$" : "C$";
                                          const displayAmt = isPartUSD ? part.amount : partNio;
                                          return (
                                            <span key={ppi} className={`text-[9px] font-semibold ${partColor}`}>
                                              ↳ {partLabel} {sym}{displayAmt.toFixed(2)}
                                              {isPartUSD && (
                                                <span className="text-muted-foreground font-normal ml-1">(≈C${partNio.toFixed(2)})</span>
                                              )}
                                            </span>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                );
                              })
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-foreground">{cashierName}</td>
                        <td className="px-4 py-3 text-right font-bold text-primary whitespace-nowrap">
                          <div>C${Number(t.total).toFixed(2)}</div>
                          {t.payments?.[0]?.currency === "USD" && (
                            <div className="text-xs font-normal text-green-500">USD: ${Number(t.payments[0].amount).toFixed(2)}</div>
                          )}
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
                              onClick={() => {
                                if (isCajero) { setShowPermissionModal(true); return; }
                                if (t.is_membership_sale || t.is_membership_usage || t.is_loyalty_redemption) {
                                  showToast("Los tickets de membresía y canje conservan su registro original"); return;
                                }
                                setEditingTicket({ ...t, _originalTotal: t.total });
                              }}
                              className="touch-btn p-2 text-secondary hover:bg-secondary/10 rounded"
                              title={t.is_membership_sale || t.is_membership_usage || t.is_loyalty_redemption ? "Ticket de membresía o canje protegido" : "Editar"}
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
                      <td className="px-4 py-3 text-right font-bold text-primary text-lg space-y-1">
                        {(() => {
                          let nio = 0, usd = 0;
                          filteredTickets.forEach((t: any) => {
                            t.payments?.forEach((p: any) => {
                              if (p.currency === "USD") usd += Number(p.amount);
                              else nio += Number(p.amount);
                            });
                          });
                          return (
                            <>
                              <div>C${nio.toFixed(2)}</div>
                              {usd > 0 && (
                                <div className="text-green-500 text-sm">+ ${usd.toFixed(2)} USD</div>
                              )}
                            </>
                          );
                        })()}
                      </td>
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
              {!editMoneyAllowed && (
                <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-xs text-yellow-800">
                  {editSingleService ? "El pago de este ticket tiene un desglose especial o falta su registro. Puedes corregir cliente y vehículo; el total y el pago se conservan." : "Este ticket contiene varios conceptos. Puedes corregir cliente y vehículo; el servicio, total y pago se conservan."}
                </div>
              )}

              {/* Total + Currency */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-foreground mb-1">Total</label>
                  <input
                    type="number"
                    value={editingTicket.total ?? 0}
                    onChange={(e) => setEditingTicket({ ...editingTicket, total: e.target.value })}
                    className="input-touch w-full"
                    step="0.01" min="0" disabled={!editMoneyAllowed || savingEdit}
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-foreground mb-1">Moneda</label>
                  <select
                    value={editingTicket._editCurrency ?? editingTicket.payments?.[0]?.currency ?? "NIO"}
                    onChange={(e) => setEditingTicket({ ...editingTicket, _editCurrency: e.target.value })}
                    className="input-touch w-full" disabled={!editMoneyAllowed || savingEdit}
                  >
                    <option value="NIO">C$ Córdobas (NIO)</option>
                    <option value="USD">$ Dólares (USD)</option>
                  </select>
                  <p className="text-xs text-muted-foreground mt-1">
                    Tasa registrada: C${editRate} por $1 USD
                  </p>
                </div>
              </div>

              {/* Payment Method */}
              <div>
                <label className="block text-sm font-semibold text-foreground mb-1">Método de pago</label>
                <select
                  value={editingTicket._editPaymentMethod ?? editingTicket.payments?.[0]?.payment_method ?? "cash"}
                  onChange={(e) => setEditingTicket({ ...editingTicket, _editPaymentMethod: e.target.value })}
                  className="input-touch w-full" disabled={!editMoneyAllowed || savingEdit}
                >
                  <option value="cash">Efectivo</option>
                  <option value="card">Tarjeta</option>
                  <option value="transfer">Transferencia</option>
                  {editPayment?.payment_method === "mixed" && <option value="mixed">Mixto</option>}
                </select>
              </div>

              {editMoneyAllowed && (Number(editingTicket.total) !== Number(editingTicket._originalTotal) || editCurrency !== (editPayment?.currency || "NIO")) && (
                <p className="text-xs text-muted-foreground">
                  El pago se recalculará a {editCurrency === "USD" ? "$" : "C$"}{(editCurrency === "USD" ? Number(editingTicket.total) / editRate : Number(editingTicket.total)).toFixed(2)}. Se reiniciarán efectivo recibido y cambio.
                </p>
              )}
              {editMoneyAllowed && editingTicket._editPaymentMethod && editingTicket._editPaymentMethod !== editPayment?.payment_method && (
                <p className="text-xs text-muted-foreground">Al corregir solo el método se conservan el importe recibido y el cambio registrados.</p>
              )}

              {/* Service */}
              <div>
                <label className="block text-sm font-semibold text-foreground mb-1">Servicio</label>
                <select
                  value={editingTicket._editServiceId ?? editingTicket.ticket_items?.[0]?.service_id ?? ""}
                  onChange={(e) => setEditingTicket({ ...editingTicket, _editServiceId: Number(e.target.value) })}
                  className="input-touch w-full" disabled={!editSingleService || editProtected || savingEdit}
                >
                  {!editItem?.service_id && <option value="">{editItem?.service_name_snapshot || "Sin servicio asignado"}</option>}
                  {editItem?.service_id && !editSelectedService && <option value={editItem.service_id}>{editItem.service_name_snapshot || "Servicio anterior"} (inactivo)</option>}
                  {services.map((s: any) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                {businessLine === "car_wash" && editSingleService && editSelectedService && (
                  <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>{editTariff ? `Tarifa actual para ${vehicleTypes.find((v: any) => v.id === Number(editVehicleTypeId))?.name || "vehículo"}: C$${Number(editTariff.price).toFixed(2)}` : "Este servicio no tiene tarifa para el vehículo seleccionado"}</span>
                    {editTariff && editMoneyAllowed && Number(editTariff.price) !== Number(editingTicket.total) && (
                      <button type="button" className="font-semibold text-secondary whitespace-nowrap" onClick={() => setEditingTicket({ ...editingTicket, total: Number(editTariff.price) })}>Aplicar tarifa</button>
                    )}
                  </div>
                )}
              </div>

              {/* Cliente */}
              <div>
                <label className="block text-sm font-semibold text-foreground mb-1">Cliente</label>
                <select
                  value={editingTicket._editCustomerId ?? editingTicket.customer_id ?? ""}
                  onChange={(e) => setEditingTicket({ ...editingTicket, _editCustomerId: Number(e.target.value) })}
                  className="input-touch w-full" disabled={savingEdit}
                >
                  {!editingTicket.customer_id && <option value="">— Sin cliente —</option>}
                  {editingTicket.customer_id && !customers.some((c: any) => c.id === editingTicket.customer_id) && <option value={editingTicket.customer_id}>{editingTicket.customer_name || "Cliente anterior"}</option>}
                  {customers.map((c: any) => (
                    <option key={c.id} value={c.id}>{c.name}{c.is_general ? " (General)" : ""}</option>
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
                  className="input-touch w-full" disabled={savingEdit}
                  placeholder="Ej: ABC-123"
                />
              </div>

              {/* Tipo de vehículo */}
              <div>
                <label className="block text-sm font-semibold text-foreground mb-1">Tipo de vehículo</label>
                <select
                  value={editingTicket._editVehicleTypeId ?? editingTicket.vehicle_type_id ?? ""}
                  onChange={(e) => setEditingTicket({ ...editingTicket, _editVehicleTypeId: Number(e.target.value) || null })}
                  className="input-touch w-full" disabled={savingEdit}
                >
                  {!editingTicket.vehicle_type_id && <option value="">— Sin tipo de vehículo —</option>}
                  {vehicleTypes.filter((v: any) => v.is_active || v.id === editingTicket.vehicle_type_id).map((v: any) => (
                    <option key={v.id} value={v.id}>{v.name}{!v.is_active ? " (inactivo)" : ""}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <button
                onClick={() => setEditingTicket(null)}
                className="touch-btn flex-1 py-3 rounded-xl border border-border text-foreground font-semibold"
              >
                Cancelar
              </button>
              <button
                onClick={handleEditSave} disabled={savingEdit}
                className="flex-1 py-3 rounded-xl bg-accent text-accent-foreground font-semibold hover:bg-accent/90 transition-colors disabled:opacity-50"
              >
                <i className="fa-solid fa-save mr-2" />{savingEdit ? "Guardando…" : "Guardar"}
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
      <PermissionModal 
        isOpen={showPermissionModal} 
        onClose={() => setShowPermissionModal(false)} 
      />
    </div>
  );
}
