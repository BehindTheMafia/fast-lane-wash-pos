import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useBusinessSettings } from "@/hooks/useBusinessSettings";
import { useAuth } from "@/hooks/useAuth";
import { useBusinessLine } from "@/contexts/BusinessLineContext";
import { useLowStockProducts } from "@/hooks/useProducts";
import { BUSINESS_LINE_LABELS } from "@/lib/businessLine";
import { toast } from "sonner";
import TicketPrint from "@/components/pos/TicketPrint";
import PermissionModal from "@/components/PermissionModal";
import { niStartOfDay, niFormatTime } from "@/utils/niDate";

const methodLabels: Record<string, string> = { cash: "Efectivo", card: "Tarjeta", transfer: "Transferencia", mixed: "Mixto" };
const methodBadgeClass = (m: string) =>
  m === "cash" ? "bg-emerald-100 text-emerald-700"
    : m === "card" ? "bg-blue-100 text-blue-700"
      : m === "transfer" ? "bg-violet-100 text-violet-700"
        : m === "mixed" ? "bg-orange-100 text-orange-700"
          : "bg-muted text-muted-foreground";

interface Stats {
  totalSalesNIO: number;
  payNIO: number;
  payUSD: number;
  cashNIO: number;
  cardNIO: number;
  transferNIO: number;
  mixedTotal: number;
  mixedCashNIO: number;
  mixedCardNIO: number;
  mixedTransferNIO: number;
  cashTickets: number;
  cardTickets: number;
  transferTickets: number;
  mixedTickets: number;
  ticketCount: number;
  topServices: { name: string; count: number }[];
  topVehicles: { type: string; count: number }[];
  recentTickets: any[];
}

export default function Dashboard() {
  const { businessLine, isBarbershop } = useBusinessLine();
  const { data: settings } = useBusinessSettings();
  const { data: lowStockProducts } = useLowStockProducts();
  const { profile, isAdmin, isOwner, isCajero } = useAuth();
  // canDelete affects if the delete button is functional
  const canDeleteRole = isAdmin || isOwner;

  const [stats, setStats] = useState<Stats>({
    totalSalesNIO: 0, payNIO: 0, payUSD: 0,
    cashNIO: 0, cardNIO: 0, transferNIO: 0,
    mixedTotal: 0, mixedCashNIO: 0, mixedCardNIO: 0, mixedTransferNIO: 0,
    cashTickets: 0, cardTickets: 0, transferTickets: 0, mixedTickets: 0,
    ticketCount: 0, topServices: [], topVehicles: [], recentTickets: [],
  });
  const [loading, setLoading] = useState(true);
  const [printTicket, setPrintTicket] = useState<any>(null);
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [loadingPrint, setLoadingPrint] = useState<number | null>(null);
  const [mixedBreakdownMap, setMixedBreakdownMap] = useState<Record<string, { method: string; applied_nio: number; currency: string; amount: number }[]>>({});

  const loadStats = async () => {
    setLoading(true);
    const todayISO = niStartOfDay();

    // 1. Fetch tickets (without payments join - fetch separately for reliability)
    const { data: tickets, error: ticketsErr } = await supabase
      .from("tickets")
      .select("*, vehicle_types(name)")
      .eq("business_line", businessLine)
      .gte("created_at", todayISO)
      .eq("status", "paid")
      .order("created_at", { ascending: false });

    if (ticketsErr) console.error("[Dashboard] tickets error:", ticketsErr.message);

    if (!tickets || tickets.length === 0) {
      setStats({
        totalSalesNIO: 0, payNIO: 0, payUSD: 0,
        cashNIO: 0, cardNIO: 0, transferNIO: 0,
        mixedTotal: 0, mixedCashNIO: 0, mixedCardNIO: 0, mixedTransferNIO: 0,
        cashTickets: 0, cardTickets: 0, transferTickets: 0, mixedTickets: 0,
        ticketCount: 0, topServices: [], topVehicles: [], recentTickets: [],
      });
      setLoading(false);
      return;
    }

    const ticketIds = tickets.map((t: any) => t.id);

    // 2. Fetch payments separately for these tickets
    const { data: paymentsRaw, error: paymentsErr } = await supabase
      .from("payments")
      .select("*")
      .in("ticket_id", ticketIds);

    if (paymentsErr) console.error("[Dashboard] payments error:", paymentsErr.message);

    // Build a payments map: ticket_id -> payments[]
    // Use String() keys to prevent UUID/number type mismatch
    const paymentsMap: Record<string, any[]> = {};
    (paymentsRaw || []).forEach((p: any) => {
      const key = String(p.ticket_id);
      if (!paymentsMap[key]) paymentsMap[key] = [];
      paymentsMap[key].push(p);
    });

    // Merge payments into tickets
    const ticketsWithPayments = tickets.map((t: any) => ({
      ...t,
      payments: paymentsMap[String(t.id)] || [],
    }));

    // 3. Fetch ticket_items with services
    const { data: ticketItems } = await supabase
      .from("ticket_items")
      .select("ticket_id, services(name), products(name), service_name_snapshot, item_type")
      .in("ticket_id", ticketIds) as any;

    const rate = settings?.exchange_rate || 36.5;
    let totalNIO = 0;
    const svcCount: Record<string, number> = {};
    const vehCount: Record<string, number> = {};

    ticketsWithPayments.forEach((t: any) => {
      totalNIO += Number(t.total);
      const vn = (t.vehicle_types as any)?.name || "N/A";
      vehCount[vn] = (vehCount[vn] || 0) + 1;
    });

    (ticketItems || []).forEach((ti: any) => {
      const svcName =
        ti.service_name_snapshot ||
        (ti.products as any)?.name ||
        (ti.services as any)?.name ||
        "Otro";
      svcCount[svcName] = (svcCount[svcName] || 0) + 1;
    });

    // 4. Payment method breakdown
    let payNIO = 0, payUSD = 0;
    let cashNIO = 0, cardNIO = 0, transferNIO = 0;
    let cashTickets = 0, cardTickets = 0, transferTickets = 0, mixedTickets = 0;

    ticketsWithPayments.forEach((t: any) => {
      const tPayments: any[] = t.payments || [];
      tPayments.forEach((p: any) => {
        if (p.currency === "USD") payUSD += Number(p.amount);
        else payNIO += Number(p.amount);
      });

      // Count tickets per method based on primary payment
      const primaryPayment = tPayments[0];
      if (primaryPayment) {
        const m = primaryPayment.payment_method;
        const amt = Number(primaryPayment.amount);
        if (m === "cash") { cashNIO += amt; cashTickets++; }
        else if (m === "card") { cardNIO += amt; cardTickets++; }
        else if (m === "transfer") { transferNIO += amt; transferTickets++; }
        else if (m === "mixed") { mixedTickets++; }
      }
    });

    // 5. Fetch mixed payment breakdowns
    let mixedCashNIO = 0, mixedCardNIO = 0, mixedTransferNIO = 0;
    const bMap: Record<string, { method: string; applied_nio: number; currency: string; amount: number }[]> = {};
    let mixedCashUSD = 0, mixedCardUSD = 0, mixedTransferUSD = 0;

    const { data: mixedParts, error: mixedPartsErr } = await (supabase as any)
      .from("ticket_mixed_payments")
      .select("*")
      .in("ticket_id", ticketIds);

    if (mixedPartsErr) console.error("[Dashboard] ticket_mixed_payments error:", mixedPartsErr.message);

    if (mixedParts && mixedParts.length > 0) {
      mixedParts.forEach((mp: any) => {
        const isUSD = mp.currency === "USD";
        const applied = Math.max(0, Number(mp.applied_nio) || 0);
        const partAmount = Number(mp.amount) || 0;

        if (isUSD) {
          if (mp.method === "cash") mixedCashUSD += partAmount;
          else if (mp.method === "card") mixedCardUSD += partAmount;
          else if (mp.method === "transfer") mixedTransferUSD += partAmount;
        } else {
          const nioAmount = applied > 0 ? applied : partAmount;
          if (mp.method === "cash") { mixedCashNIO += nioAmount; cashNIO += nioAmount; }
          else if (mp.method === "card") { mixedCardNIO += nioAmount; cardNIO += nioAmount; }
          else if (mp.method === "transfer") { mixedTransferNIO += nioAmount; transferNIO += nioAmount; }
        }

        const tid = String(mp.ticket_id);
        if (!bMap[tid]) bMap[tid] = [];
        bMap[tid].push({ method: mp.method, applied_nio: applied, currency: mp.currency || "NIO", amount: partAmount });
      });
    }
    setMixedBreakdownMap(bMap);

    const mixedTotal = mixedCashNIO + mixedCardNIO + mixedTransferNIO
      + (mixedCashUSD + mixedCardUSD + mixedTransferUSD) * rate;

    setStats({
      totalSalesNIO: totalNIO,
      payNIO, payUSD,
      cashNIO, cardNIO, transferNIO,
      mixedTotal, mixedCashNIO, mixedCardNIO, mixedTransferNIO,
      cashTickets, cardTickets, transferTickets, mixedTickets,
      ticketCount: tickets.length,
      topServices: Object.entries(svcCount).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
      topVehicles: Object.entries(vehCount).map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count),
      recentTickets: ticketsWithPayments,
    });
    setLoading(false);
  };


  useEffect(() => {
    loadStats();
  }, [settings, businessLine]);

  const handleDeleteTicket = async (ticketId: number) => {
    if (isCajero) {
      setShowPermissionModal(true);
      return;
    }

    if (!window.confirm("¿Estás seguro de que deseas eliminar este ticket? Esta acción no se puede deshacer.")) {
      return;
    }

    try {
      // 1. Check if this ticket has membership wash records
      const { data: washRecords } = await supabase
        .from("membership_washes")
        .select("id, membership_id")
        .eq("ticket_id", ticketId);

      // 2. If membership usage exists, revert the washes_used counter
      if (washRecords && washRecords.length > 0) {
        const washCountByMembership: Record<number, number> = {};
        washRecords.forEach((w: any) => {
          washCountByMembership[w.membership_id] = (washCountByMembership[w.membership_id] || 0) + 1;
        });

        for (const [membershipId, count] of Object.entries(washCountByMembership)) {
          const { data: membership } = await supabase
            .from("customer_memberships")
            .select("washes_used")
            .eq("id", Number(membershipId))
            .single();

          if (membership) {
            const newCount = Math.max(0, (membership.washes_used || 0) - count);
            await supabase
              .from("customer_memberships")
              .update({ washes_used: newCount })
              .eq("id", Number(membershipId));
          }
        }

        // Delete the membership_washes records
        await supabase
          .from("membership_washes")
          .delete()
          .eq("ticket_id", ticketId);
      }

      // 3. Delete ticket (cascade handles ticket_items and payments)
      const { error } = await supabase
        .from("tickets")
        .delete()
        .eq("id", ticketId);

      if (error) throw error;

      toast.success("Ticket eliminado correctamente");
      loadStats();
    } catch (error: any) {
      console.error("Error deleting ticket:", error);
      toast.error("Error al eliminar el ticket: " + (error.message || "Permisos insuficientes"));
    }
  };

  const handleReprintTicket = async (ticketId: number) => {
    setLoadingPrint(ticketId);
    try {
      // Fetch ticket with all related data
      const { data: ticket, error } = await supabase
        .from("tickets")
        .select("*, vehicle_types(name), ticket_items(*, services(name))")
        .eq("id", ticketId)
        .single();

      if (error || !ticket) throw new Error("No se pudo cargar el ticket");

      // Fetch payment info
      const { data: payments } = await supabase
        .from("payments")
        .select("*")
        .eq("ticket_id", ticketId);

      // Fetch customer if customer_id exists
      let customer: any = null;
      try {
        const { data: ticketWithCustomer } = await supabase
          .from("tickets")
          .select("customer_id, customers(name, phone, plate, is_general)")
          .eq("id", ticketId)
          .single() as any;
        if (ticketWithCustomer?.customers) {
          customer = ticketWithCustomer.customers;
        }
      } catch { /* customer_id may not exist */ }

      // Build ticket object for TicketPrint component
      const items = (ticket.ticket_items || []).map((ti: any) => ({
        serviceName: ti.services?.name || ti.service_name_snapshot || "Servicio",
        vehicleLabel: ticket.vehicle_types?.name || "—",
        price: Number(ti.price),
        qty: 1,
      }));

      // Build payment info, including mixed breakdown if applicable
      let payment: any = null;
      if (payments && payments.length > 0) {
        const p0 = payments[0];
        const isMixed = p0.payment_method === "mixed";

        payment = {
          method: isMixed ? "mixed"
            : p0.payment_method === "cash" ? "Efectivo"
              : p0.payment_method === "card" ? "Tarjeta"
                : p0.payment_method === "transfer" ? "Transferencia"
                  : p0.payment_method,
          currency: p0.currency || "NIO",
          received: Number(p0.amount_received || p0.amount),
          change: Number(p0.change_amount || 0),
          amount: Number(p0.amount || 0),
        };

        if (isMixed) {
          const { data: mixedRows } = await (supabase as any)
            .from("ticket_mixed_payments")
            .select("method, amount, currency")
            .eq("ticket_id", ticketId);

          if (mixedRows && mixedRows.length > 0) {
            payment.mixedPayments = mixedRows.map((r: any) => ({
              method: r.method,
              amount: Number(r.amount),
              received: Number(r.amount),
              change: 0,
            }));
          }
        }
      }

      const subtotal = items.reduce((s: number, i: any) => s + i.price, 0);
      const discount = subtotal - Number(ticket.total);

      setPrintTicket({
        ticket_number: ticket.ticket_number,
        created_at: ticket.created_at,
        total: ticket.total,
        subtotal,
        discount: discount > 0 ? discount : 0,
        items,
        customer: customer || { name: "Cliente General", is_general: true },
        payment,
        settings,
      });
    } catch (err: any) {
      toast.error("Error al cargar ticket: " + (err.message || "Intente de nuevo"));
    } finally {
      setLoadingPrint(null);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-full"><i className="fa-solid fa-spinner fa-spin text-3xl text-accent" /></div>;
  }

  const formatTime = (iso: string) => niFormatTime(iso);
  const rate = settings?.exchange_rate || 36.5;

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <h2 className="text-2xl font-bold text-foreground">
        <i className="fa-solid fa-chart-pie mr-3 text-secondary" />
        Dashboard — {BUSINESS_LINE_LABELS[businessLine]} — Hoy
      </h2>

      {/* Metric cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="pos-card p-6 text-center">
          <i className="fa-solid fa-money-bill-trend-up text-3xl text-primary mb-2" />
          <p className="text-sm text-secondary">Ventas del día</p>
          <p className="text-3xl font-bold text-foreground">C${stats.totalSalesNIO.toFixed(2)}</p>
          <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
            {stats.payNIO > 0 && <p>NIO: C${stats.payNIO.toFixed(2)}</p>}
            {stats.payUSD > 0 && <p className="text-green-500">+ USD: ${stats.payUSD.toFixed(2)}</p>}
          </div>
        </div>
        <div className="pos-card p-6 text-center">
          <i className="fa-solid fa-ticket text-3xl text-secondary mb-2" />
          <p className="text-sm text-secondary">Tickets del día</p>
          <p className="text-3xl font-bold text-foreground">{stats.ticketCount}</p>
        </div>
        <div className="pos-card p-6 text-center">
          <i className="fa-solid fa-chart-line text-3xl text-accent mb-2" />
          <p className="text-sm text-secondary">Promedio por ticket</p>
          <p className="text-3xl font-bold text-foreground">
            C${stats.ticketCount > 0 ? (stats.totalSalesNIO / stats.ticketCount).toFixed(2) : "0.00"}
          </p>
        </div>
      </div>

      {/* Payment method breakdown */}
      <div className={`grid grid-cols-1 sm:grid-cols-2 ${stats.mixedTickets > 0 ? 'lg:grid-cols-4' : 'lg:grid-cols-3'} gap-4`}>
        <div className="pos-card p-5 border-l-4 border-emerald-500">
          <div className="flex items-center gap-2 mb-2">
            <i className="fa-solid fa-money-bills text-xl text-emerald-600" />
            <span className="font-bold text-emerald-700 dark:text-emerald-400">Efectivo</span>
          </div>
          <p className="text-2xl font-black text-emerald-700 dark:text-emerald-300">C${stats.cashNIO.toFixed(2)}</p>
          <p className="text-xs text-emerald-600 mt-1">{stats.cashTickets} ticket{stats.cashTickets !== 1 ? "s" : ""}</p>
        </div>
        <div className="pos-card p-5 border-l-4 border-blue-500">
          <div className="flex items-center gap-2 mb-2">
            <i className="fa-solid fa-credit-card text-xl text-blue-600" />
            <span className="font-bold text-blue-700 dark:text-blue-400">Tarjeta</span>
          </div>
          <p className="text-2xl font-black text-blue-700 dark:text-blue-300">C${stats.cardNIO.toFixed(2)}</p>
          <p className="text-xs text-blue-600 mt-1">{stats.cardTickets} ticket{stats.cardTickets !== 1 ? "s" : ""}</p>
        </div>
        <div className="pos-card p-5 border-l-4 border-violet-500">
          <div className="flex items-center gap-2 mb-2">
            <i className="fa-solid fa-building-columns text-xl text-violet-600" />
            <span className="font-bold text-violet-700 dark:text-violet-400">Transferencia</span>
          </div>
          <p className="text-2xl font-black text-violet-700 dark:text-violet-300">C${stats.transferNIO.toFixed(2)}</p>
          <p className="text-xs text-violet-600 mt-1">{stats.transferTickets} ticket{stats.transferTickets !== 1 ? "s" : ""}</p>
        </div>
        {stats.mixedTickets > 0 && (
          <div className="pos-card p-5 border-l-4 border-orange-500">
            <div className="flex items-center gap-2 mb-2">
              <i className="fa-solid fa-shuffle text-xl text-orange-600" />
              <span className="font-bold text-orange-700 dark:text-orange-400">Mixto</span>
            </div>
            <p className="text-2xl font-black text-orange-700 dark:text-orange-300">C${stats.mixedTotal.toFixed(2)}</p>
            <p className="text-xs text-orange-600 mt-1">{stats.mixedTickets} ticket{stats.mixedTickets !== 1 ? "s" : ""}</p>
            <div className="mt-2 space-y-0.5">
              {stats.mixedCashNIO > 0 && (
                <div className="flex items-center gap-1 text-[10px] text-emerald-600 font-semibold">
                  <i className="fa-solid fa-money-bills text-[9px]" /> Ef. C${stats.mixedCashNIO.toFixed(2)}
                </div>
              )}
              {stats.mixedCardNIO > 0 && (
                <div className="flex items-center gap-1 text-[10px] text-blue-600 font-semibold">
                  <i className="fa-solid fa-credit-card text-[9px]" /> Tj. C${stats.mixedCardNIO.toFixed(2)}
                </div>
              )}
              {stats.mixedTransferNIO > 0 && (
                <div className="flex items-center gap-1 text-[10px] text-violet-600 font-semibold">
                  <i className="fa-solid fa-building-columns text-[9px]" /> Tr. C${stats.mixedTransferNIO.toFixed(2)}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Top services and vehicles */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="pos-card p-6">
          <h3 className="font-bold text-foreground mb-4 flex items-center gap-2">
            <i className="fa-solid fa-ranking-star text-secondary" />Top Servicios
          </h3>
          {stats.topServices.length === 0 && <p className="text-sm text-muted-foreground">Sin datos hoy</p>}
          {stats.topServices.map((s, i) => (
            <div key={i} className="flex items-center justify-between py-2 border-b border-border last:border-0">
              <span className="text-sm text-foreground">{s.name}</span>
              <span className="font-bold text-accent">{s.count}</span>
            </div>
          ))}
        </div>
        {isBarbershop ? (
          <div className="pos-card p-6">
            <h3 className="font-bold text-foreground mb-4 flex items-center gap-2">
              <i className="fa-solid fa-triangle-exclamation text-amber-600" />
              Stock bajo
            </h3>
            {!lowStockProducts?.length && (
              <p className="text-sm text-muted-foreground">Inventario OK</p>
            )}
            {lowStockProducts?.map((p) => (
              <div key={p.id} className="flex justify-between py-2 border-b border-border last:border-0">
                <span className="text-sm">{p.name}</span>
                <span className="text-xs font-bold text-amber-600">{p.stock_quantity} uds</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="pos-card p-6">
            <h3 className="font-bold text-foreground mb-4 flex items-center gap-2">
              <i className="fa-solid fa-car text-secondary" />Top Vehículos
            </h3>
            {stats.topVehicles.length === 0 && <p className="text-sm text-muted-foreground">Sin datos hoy</p>}
            {stats.topVehicles.map((v, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <span className="text-sm text-foreground">{v.type}</span>
                <span className="font-bold text-accent">{v.count}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent tickets table */}
      <div className="pos-card overflow-hidden">
        <div className="p-4 border-b border-border">
          <h3 className="font-bold text-foreground">
            <i className="fa-solid fa-clock-rotate-left mr-2 text-secondary" />Últimos tickets
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50">
                <th className="text-left px-4 py-3 font-semibold text-secondary"># Ticket</th>
                <th className="text-left px-4 py-3 font-semibold text-secondary">Hora</th>
                <th className="text-left px-4 py-3 font-semibold text-secondary">Vehículo</th>
                <th className="text-left px-4 py-3 font-semibold text-secondary">Placa</th>
                <th className="text-left px-4 py-3 font-semibold text-secondary">Método</th>
                <th className="text-right px-4 py-3 font-semibold text-secondary">Total</th>
                <th className="text-center px-4 py-3 font-semibold text-secondary">Acciones</th>
              </tr>
            </thead>
              <tbody>
                {stats.recentTickets.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                      <i className="fa-solid fa-inbox text-2xl mb-2 opacity-30 block" />
                      No hay tickets hoy
                    </td>
                  </tr>
                )}
                {stats.recentTickets.map((t: any, idx: number) => {
                  const payMethod = t.payments?.[0]?.payment_method || "—";
                  const isMixed = payMethod === "mixed";
                  const mixedParts = isMixed ? (mixedBreakdownMap[String(t.id)] || []) : [];
                  return (
                  <tr key={t.id} className={`border-b border-border/50 hover:bg-muted/30 transition-colors ${idx % 2 === 0 ? "" : "bg-muted/10"}`}>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{t.ticket_number}</td>
                    <td className="px-4 py-3 text-foreground">{formatTime(t.created_at)}</td>
                    <td className="px-4 py-3 text-foreground">{(t.vehicle_types as any)?.name || "—"}</td>
                    <td className="px-4 py-3 text-foreground font-mono">{t.vehicle_plate || "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-0.5">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold w-fit ${methodBadgeClass(payMethod)}`}>
                          {methodLabels[payMethod] || payMethod}
                        </span>
                        {isMixed && mixedParts.length === 0 && (
                          <span className="text-[9px] text-muted-foreground italic">Desglose no disponible</span>
                        )}
                        {isMixed && mixedParts.length > 0 && (
                          <div className="flex flex-col gap-0.5 mt-0.5">
                            {mixedParts.map((part, pi) => {
                              const pLabel = part.method === "cash" ? "Ef." : part.method === "card" ? "Tj." : "Tr.";
                              const pColor = part.method === "cash" ? "text-emerald-600" : part.method === "card" ? "text-blue-600" : "text-violet-600";
                              const pIcon = part.method === "cash" ? "fa-money-bills" : part.method === "card" ? "fa-credit-card" : "fa-building-columns";
                              const isPartUSD = part.currency === "USD";
                              const displayAmt = isPartUSD ? part.amount : (part.applied_nio > 0 ? part.applied_nio : part.amount);
                              const sym = isPartUSD ? "$" : "C$";
                              return (
                                <span key={pi} className={`text-[9px] font-semibold ${pColor} flex items-center gap-1`}>
                                  <i className={`fa-solid ${pIcon} text-[8px]`} />
                                  {pLabel} {sym}{Number(displayAmt).toFixed(2)}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-primary whitespace-nowrap">
                      <div>C${Number(t.total).toFixed(2)}</div>
                      {t.payments?.[0]?.currency === "USD" && (
                        <div className="text-xs font-normal text-green-500">USD: ${Number(t.payments[0].amount).toFixed(2)}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => handleReprintTicket(t.id)}
                          disabled={loadingPrint === t.id}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50"
                          title="Reimprimir ticket"
                        >
                          <i className={`fa-solid ${loadingPrint === t.id ? "fa-spinner fa-spin" : "fa-print"}`} />
                        </button>
                        <button
                          onClick={() => handleDeleteTicket(t.id)}
                          className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          title="Eliminar ticket"
                        >
                          <i className="fa-solid fa-trash-can" />
                        </button>
                      </div>
                    </td>
                </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Reprint modal */}
      {printTicket && (
        <TicketPrint
          ticket={printTicket}
          onClose={() => setPrintTicket(null)}
        />
      )}
      <PermissionModal 
        isOpen={showPermissionModal} 
        onClose={() => setShowPermissionModal(false)} 
      />
    </div>
  );
}
