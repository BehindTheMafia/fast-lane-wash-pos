import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useBusinessSettings } from "@/hooks/useBusinessSettings";
import { niStartOfDay, niFormatTime, niFormatLongDate, niFormatShortDate, niNow } from "@/utils/niDate";
import { useBusinessLine } from "@/contexts/BusinessLineContext";
import { BUSINESS_LINE_LABELS } from "@/lib/businessLine";

// ─── Types ───────────────────────────────────────────────────────────────────
interface TicketDetail {
  id: string;
  ticket_number: string;
  total: number;
  method: string;
  created_at: string;
  service_name: string;
  vehicle_name: string;
  plate: string;
  customer_name: string;
  cashier_name: string;
  currency: string;
  payment_amount: number;
}

interface DayStats {
  cashNIO: number;
  cashUSD: number;
  card: number;
  cardUSD: number;
  transfer: number;
  transferUSD: number;
  // From mixed payments (decomposed)
  mixedCashNIO: number;
  mixedCardNIO: number;
  mixedTransferNIO: number;
  mixedCashUSD: number;
  mixedCardUSD: number;
  mixedTransferUSD: number;
  totalTickets: number;
  cashTickets: number;
  cardTickets: number;
  transferTickets: number;
  mixedTickets: number;
  tickets: TicketDetail[];
}

type ToastType = { msg: string; type: "success" | "error" } | null;
type MethodFilter = "all" | "cash" | "card" | "transfer" | "mixed";

interface MixedTicketBreakdown {
  ticket_id: string;
  parts: { method: string; applied_nio: number; currency: string; amount: number }[];
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function CashClose() {
  const { businessLine } = useBusinessLine();
  const { user, profile } = useAuth();
  const { data: settings } = useBusinessSettings();

  // Data
  const [dayStats, setDayStats] = useState<DayStats>({
    cashNIO: 0, cashUSD: 0, card: 0, cardUSD: 0, transfer: 0, transferUSD: 0,
    mixedCashNIO: 0, mixedCardNIO: 0, mixedTransferNIO: 0,
    mixedCashUSD: 0, mixedCardUSD: 0, mixedTransferUSD: 0,
    totalTickets: 0, cashTickets: 0, cardTickets: 0, transferTickets: 0, mixedTickets: 0,
    tickets: [],
  });
  const [history, setHistory] = useState<any[]>([]);
  const [mixedBreakdowns, setMixedBreakdowns] = useState<MixedTicketBreakdown[]>([]);
  const [loading, setLoading] = useState(true);

  // User inputs
  const [cashCounted, setCashCounted] = useState("");
  const [cashCountedUSD, setCashCountedUSD] = useState("");
  const [egresos, setEgresos] = useState<{ amount: string; reason: string }[]>([]);
  const [note, setNote] = useState("");

  // UI state
  const [methodFilter, setMethodFilter] = useState<MethodFilter | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<ToastType>(null);
  const [showHistory, setShowHistory] = useState(false);

  // ── Load data ───────────────────────────────────
  useEffect(() => { loadAll(); }, [businessLine]);

  const loadAll = async () => {
    setLoading(true);
    await Promise.all([loadDayStats(), loadHistory()]);
    setLoading(false);
  };

  const loadDayStats = async () => {
    const todayISO = niStartOfDay();

    // 1. Fetch paid tickets for today's business line first (single source of truth)
    const { data: lineTicketsToday } = await supabase
      .from("tickets")
      .select("id")
      .eq("business_line", businessLine)
      .eq("status", "paid")  // ← solo tickets pagados
      .gte("created_at", todayISO);

    const allowedTicketIds = new Set((lineTicketsToday || []).map((t: { id: number }) => t.id));

    if (allowedTicketIds.size === 0) {
      setDayStats({
        cashNIO: 0, cashUSD: 0, card: 0, cardUSD: 0, transfer: 0, transferUSD: 0,
        mixedCashNIO: 0, mixedCardNIO: 0, mixedTransferNIO: 0,
        mixedCashUSD: 0, mixedCardUSD: 0, mixedTransferUSD: 0,
        totalTickets: 0,
        cashTickets: 0, cardTickets: 0, transferTickets: 0, mixedTickets: 0,
        tickets: [],
      });
      setMixedBreakdowns([]);
      return;
    }

    // Fetch payments only for those paid tickets
    const { data: paymentsRaw } = await supabase
      .from("payments")
      .select("*")
      .in("ticket_id", Array.from(allowedTicketIds));

    const payments = (paymentsRaw || []);

    if (!payments || payments.length === 0) {
      setDayStats({
        cashNIO: 0, cashUSD: 0, card: 0, cardUSD: 0, transfer: 0, transferUSD: 0,
        mixedCashNIO: 0, mixedCardNIO: 0, mixedTransferNIO: 0,
        mixedCashUSD: 0, mixedCardUSD: 0, mixedTransferUSD: 0,
        totalTickets: 0,
        cashTickets: 0, cardTickets: 0, transferTickets: 0, mixedTickets: 0,
        tickets: [],
      });
      setMixedBreakdowns([]);
      return;
    }

    const ticketIds = payments.map((p: any) => p.ticket_id);

    // 2. Fetch tickets for these payments
    const { data: ticketsRaw } = await supabase
      .from("tickets")
      .select("*, vehicle_types(name)")
      .eq("business_line", businessLine)
      .in("id", ticketIds);

    const ticketsMap: Record<number, any> = {};
    (ticketsRaw || []).forEach((t: any) => {
      ticketsMap[t.id] = t;
    });

    // 3. Fetch ticket_items for these tickets
    const { data: ticketItems } = await supabase
      .from("ticket_items")
      .select("ticket_id, services(name), products(name), service_name_snapshot")
      .in("ticket_id", ticketIds) as any;

    const itemsMap: Record<number, any[]> = {};
    (ticketItems || []).forEach((ti: any) => {
      if (!itemsMap[ti.ticket_id]) itemsMap[ti.ticket_id] = [];
      itemsMap[ti.ticket_id].push(ti);
    });

    // Collect unique user_ids to fetch cashier names
    const userIds = new Set<string>();
    payments.forEach((p: any) => {
      const t = ticketsMap[p.ticket_id];
      if (t?.user_id) userIds.add(t.user_id);
    });

    // Fetch profiles for cashier names
    const profileMap: Map<string, string> = new Map();
    if (userIds.size > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", Array.from(userIds));
      if (profiles) {
        profiles.forEach((pr: any) => profileMap.set(pr.id, pr.full_name || "—"));
      }
    }

    // Fetch customer names for tickets that have customer_id
    const customerMap: Map<number, { name: string; plate: string }> = new Map();
    const customerIds = [...new Set((ticketsRaw || []).map((t: any) => t.customer_id).filter(Boolean))];
    if (customerIds.length > 0) {
      try {
        const { data: customers } = await supabase
          .from("customers")
          .select("id, name, plate")
          .in("id", customerIds);
        if (customers) {
          const custById: Record<number, any> = {};
          customers.forEach((c: any) => { custById[c.id] = c; });
          
          (ticketsRaw || []).forEach((t: any) => {
            if (t.customer_id && custById[t.customer_id]) {
              const c = custById[t.customer_id];
              customerMap.set(t.id, { name: c.name, plate: c.plate || "" });
            }
          });
        }
      } catch (err) {
        console.error("Error fetching customers for cash close:", err);
      }
    }

    let cashNIO = 0, cashUSD = 0, card = 0, cardUSD = 0, transfer = 0, transferUSD = 0;
    let cashTickets = 0, cardTickets = 0, transferTickets = 0, mixedTickets = 0;
    const ticketMap: Map<string, TicketDetail> = new Map();

    payments.forEach((p: any) => {
      const t = ticketsMap[p.ticket_id];
      if (!t) return;
      if (!ticketMap.has(p.ticket_id)) {
        const items = itemsMap[p.ticket_id] || [];
        const firstItem = items[0];
        const serviceName =
          firstItem?.service_name_snapshot ||
          firstItem?.products?.name ||
          firstItem?.services?.name ||
          "—";
        const vehicleName = t.vehicle_types?.name || (businessLine === "barbershop" ? "—" : "—");
        const custData = customerMap.get(p.ticket_id);
        const customerName = custData?.name || "Cliente General";
        const plate = t.vehicle_plate || custData?.plate || "—";
        const cashierName = t.user_id ? (profileMap.get(t.user_id) || "—") : "—";

        ticketMap.set(p.ticket_id, {
          id: p.ticket_id,
          ticket_number: t.ticket_number || "—",
          total: Number(t.total),
          method: p.payment_method,
          created_at: t.created_at,
          service_name: serviceName,
          vehicle_name: vehicleName,
          plate,
          customer_name: customerName,
          cashier_name: cashierName,
          currency: p.currency || "NIO",
          payment_amount: Number(p.amount),
        });
      }

      const isUSD = p.currency === "USD";
      if (p.payment_method === "cash") {
        if (isUSD) { cashUSD += Number(p.amount); } else { cashNIO += Number(p.amount); }
        cashTickets++;
      } else if (p.payment_method === "card") {
        if (isUSD) { cardUSD += Number(p.amount); } else { card += Number(p.amount); }
        cardTickets++;
      } else if (p.payment_method === "transfer") {
        if (isUSD) { transferUSD += Number(p.amount); } else { transfer += Number(p.amount); }
        transferTickets++;
      } else if (p.payment_method === "mixed") {
        mixedTickets++;
      }
    });

    // ── Fetch mixed payment breakdown and distribute to correct buckets ──
    let mixedCashNIO = 0, mixedCardNIO = 0, mixedTransferNIO = 0;
    let mixedCashUSD = 0, mixedCardUSD = 0, mixedTransferUSD = 0;
    const { data: mixedParts, error: mixedPartsErr } = await (supabase as any)
      .from("ticket_mixed_payments")
      .select("*")
      .in("ticket_id", ticketIds);

    if (mixedPartsErr) console.error("[CashClose] ticket_mixed_payments error:", mixedPartsErr.message);

    // Build per-ticket breakdown map
    const breakdownMap = new Map<string, { method: string; applied_nio: number; currency: string; amount: number }[]>();

    if (mixedParts) {
      mixedParts.forEach((mp: any) => {
        const isUSD = mp.currency === "USD";
        const applied = Math.max(0, Number(mp.applied_nio) || 0);
        const partAmount = Number(mp.amount) || 0;

        if (isUSD) {
          if (mp.method === "cash") {
            mixedCashUSD += partAmount;
            cashUSD += partAmount;
          } else if (mp.method === "card") {
            mixedCardUSD += partAmount;
            cardUSD += partAmount;
          } else if (mp.method === "transfer") {
            mixedTransferUSD += partAmount;
            transferUSD += partAmount;
          }
        } else {
          const nioAmount = applied > 0 ? applied : partAmount;
          if (mp.method === "cash") {
            mixedCashNIO += nioAmount;
            cashNIO += nioAmount;
          } else if (mp.method === "card") {
            mixedCardNIO += nioAmount;
            card += nioAmount;
          } else if (mp.method === "transfer") {
            mixedTransferNIO += nioAmount;
            transfer += nioAmount;
          }
        }

        const tid = String(mp.ticket_id);
        if (!breakdownMap.has(tid)) breakdownMap.set(tid, []);
        breakdownMap.get(tid)!.push({
          method: mp.method,
          applied_nio: applied,
          currency: mp.currency || "NIO",
          amount: partAmount,
        });
      });
    }

    // Convert map to array state
    const breakdownArr: MixedTicketBreakdown[] = [];
    breakdownMap.forEach((parts, ticket_id) => {
      breakdownArr.push({ ticket_id, parts });
    });
    setMixedBreakdowns(breakdownArr);

    const tickets = Array.from(ticketMap.values()).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    setDayStats({
      cashNIO, cashUSD, card, cardUSD, transfer, transferUSD,
      mixedCashNIO, mixedCardNIO, mixedTransferNIO,
      mixedCashUSD, mixedCardUSD, mixedTransferUSD,
      totalTickets: tickets.length,
      cashTickets, cardTickets, transferTickets, mixedTickets,
      tickets,
    });
  };

  const loadHistory = async () => {
    const { data: closures } = await supabase
      .from("cash_closures")
      .select("*")
      .eq("business_line", businessLine)
      .order("closed_at", { ascending: false });

    if (!closures) return;

    // Collect cashier IDs
    const cashierIds = Array.from(new Set(closures.map(c => c.cashier_id)));

    // Fetch profiles
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", cashierIds);

    const profileMap: Map<string, string> = new Map();
    if (profiles) {
      profiles.forEach(p => profileMap.set(p.id, p.full_name || "—"));
    }

    // Map profiles back to closures for display
    const historyWithNames = closures.map(c => ({
      ...c,
      profiles: { full_name: profileMap.get(c.cashier_id) || "Usuario desconocido" }
    }));

    setHistory(historyWithNames);
  };

  // ── Calculations ──────────────────────────────── 
  const rate = settings?.exchange_rate || 36.5;
  const totalUSD = dayStats.cashUSD + dayStats.cardUSD + dayStats.transferUSD;
  const totalNIO = dayStats.cashNIO + dayStats.card + dayStats.transfer;
  const totalDay = totalNIO + (totalUSD * rate);

  const totalEgresos = egresos.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
  const cashUSDinNIO = dayStats.cashUSD * rate;
  const expectedCash = dayStats.cashNIO + cashUSDinNIO - totalEgresos;

  const counted = parseFloat(cashCounted) || 0;
  const countedUSD = parseFloat(cashCountedUSD) || 0;
  const countedUSDinNIO = countedUSD * rate;
  const totalCounted = counted + countedUSDinNIO;
  const difference = totalCounted - expectedCash;
  const hasCounted = cashCounted.trim() !== "";
  const cuadra = hasCounted && Math.abs(difference) < 0.01;
  const sobra = hasCounted && difference > 0.01;
  const falta = hasCounted && difference < -0.01;

  // ── Visibility by role + setting ─────────────────────
  // Admins/owners always see everything.
  // Cajeros only see amounts when show_expected_cash_to_cashier === true.
  const userRole = profile?.role ?? "";
  const isPrivileged = userRole === "admin" || userRole === "owner";
  const settingEnabled = (settings as any)?.show_expected_cash_to_cashier ?? true;
  const canSeeExpected = isPrivileged || settingEnabled;

  // ── Save ───────────────────────────────────────
  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);

    const egresosText = egresos
      .filter(e => parseFloat(e.amount) > 0)
      .map(e => `${e.reason || "Sin motivo"}: C$${parseFloat(e.amount).toFixed(2)}`)
      .join(" | ");

    const { error } = await supabase.from("cash_closures").insert({
      cashier_id: user.id,
      business_line: businessLine,
      shift: "",
      initial_balance: 0,
      total_cash_nio: dayStats.cashNIO,
      total_cash_usd: dayStats.cashUSD,
      total_card: dayStats.card,
      total_card_usd: dayStats.cardUSD,
      total_transfer: dayStats.transfer,
      total_transfer_usd: dayStats.transferUSD,
      total_expenses: totalEgresos,
      expected_total: expectedCash,
      counted_total: totalCounted,
      difference,
      bills_count: {},
      coins_count: {},
      observations: [note, egresosText ? `Egresos: ${egresosText}` : ""].filter(Boolean).join(" | ") || null,
      closed_at: niNow(),
    } as any);

    if (!error) {
      showToast("✅ Cierre de caja guardado correctamente");
      setCashCounted("");
      setCashCountedUSD("");
      setEgresos([]);
      setNote("");
      setShowConfirm(false);
      await loadHistory();
    } else {
      showToast("Error al guardar el cierre: " + error.message, "error");
    }
    setSaving(false);
  };

  // ── Helpers ────────────────────────────────────
  const filteredTickets = methodFilter
    ? dayStats.tickets.filter(t => methodFilter === "all" ? true : t.method === methodFilter)
    : [];

  const methodLabel = (m: string) =>
    m === "cash" ? "Efectivo" : m === "card" ? "Tarjeta" : m === "transfer" ? "Transferencia" : m === "mixed" ? "Mixto" : m;

  const methodBadgeClass = (m: string) =>
    m === "cash"
      ? "bg-emerald-100 text-emerald-700"
      : m === "card"
        ? "bg-blue-100 text-blue-700"
        : m === "mixed"
          ? "bg-orange-100 text-orange-700"
          : "bg-violet-100 text-violet-700";

  const fmtDate = (iso: string) => niFormatShortDate(iso);
  const fmtTime = (iso: string) => niFormatTime(iso);

  const toggleMethodFilter = (m: MethodFilter) => {
    setMethodFilter(methodFilter === m ? null : m);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <i className="fa-solid fa-spinner fa-spin text-5xl text-primary" />
        <p className="text-xl text-muted-foreground">Cargando información del día...</p>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-background p-4 md:p-6 space-y-6 animate-fade-in">

      {/* ─── HEADER ───────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-3xl font-bold text-foreground flex items-center gap-3">
            <span className="text-4xl">🏦</span> Cierre de Caja — {BUSINESS_LINE_LABELS[businessLine]}
          </h2>
          <p className="text-muted-foreground mt-1">
            {niFormatLongDate()}
            {" · "}{profile?.full_name || "—"}
          </p>
        </div>
        <button
          onClick={() => setShowHistory(!showHistory)}
          className="touch-btn flex items-center gap-2 px-4 py-2 rounded-xl bg-muted text-muted-foreground hover:bg-muted/80 text-sm font-semibold transition-colors"
        >
          <i className="fa-solid fa-clock-rotate-left" />
          Cierres anteriores
        </button>
      </div>

      {/* ─── HISTORY PANEL (collapsible) ──────────────────── */}
      {showHistory && (
        <div className="pos-card p-4 animate-scale-in">
          <h3 className="font-bold text-foreground mb-3 flex items-center gap-2">
            <i className="fa-solid fa-history text-secondary" /> Últimos cierres registrados
          </h3>
          {history.length === 0 ? (
            <p className="text-muted-foreground text-sm">No hay cierres anteriores.</p>
          ) : (
            <div className="space-y-3">
              {history.map((h: any) => {
                const diff = Number(h.difference);
                const cashNIO = Number(h.total_cash_nio || 0);
                const cashUSD = Number(h.total_cash_usd || 0);
                const cardNIO = Number(h.total_card || 0);
                const cardUSD = Number(h.total_card_usd || 0);
                const transNIO = Number(h.total_transfer || 0);
                const transUSD = Number(h.total_transfer_usd || 0);

                const hTotalUSD = cashUSD + cardUSD + transUSD;
                const totalDayH = cashNIO + transNIO + cardNIO + (hTotalUSD * rate);

                // Parse egresos and notes from observations field
                const observations: string = h.observations || "";
                // observations format: "nota | Egresos: motivo1: C$xx | motivo2: C$yy"
                const egresosMatch = observations.match(/Egresos: (.+)/);
                const egresosRaw = egresosMatch ? egresosMatch[1] : "";
                const egresosItems = egresosRaw
                  ? egresosRaw.split(" | ").map((e: string) => {
                      const parts = e.split(": C$");
                      return { reason: parts[0] || "Sin motivo", amount: parseFloat(parts[1] || "0") };
                    })
                  : [];
                const noteText = observations.split(" | Egresos:")[0].trim();
                const totalExpenses = Number(h.total_expenses || 0);

                return (
                  <div key={h.id} className="p-4 rounded-xl bg-background border border-border text-sm space-y-3">
                    {/* Header row */}
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div>
                        <p className="font-bold text-foreground">
                          {niFormatShortDate(h.closed_at)}
                          {" · "}
                          {niFormatTime(h.closed_at)}
                        </p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <i className="fa-solid fa-user-check text-[10px]" />
                          {h.profiles?.full_name || "Usuario desconocido"}
                        </p>
                      </div>
                      <span className={`text-xs font-black px-3 py-1 rounded-full shrink-0 ${Math.abs(diff) < 0.01
                        ? "bg-emerald-100 text-emerald-700"
                        : diff > 0 ? "bg-blue-100 text-blue-700" : "bg-red-100 text-red-700"
                        }`}>
                        {Math.abs(diff) < 0.01 ? "✅ Cuadró" : diff > 0 ? `⬆ Sobró C$${diff.toFixed(2)}` : `⬇ Faltó C$${Math.abs(diff).toFixed(2)}`}
                      </span>
                    </div>

                    {/* Payment method grid */}
                    <div className="grid grid-cols-3 gap-2 pt-1 border-t border-border">
                      <div className="text-center">
                        <p className="text-xs text-emerald-600 font-semibold"><i className="fa-solid fa-money-bills mr-1" />Efectivo</p>
                        <p className="font-black text-foreground">C${cashNIO.toFixed(2)}</p>
                        {cashUSD > 0 && <p className="text-[10px] text-green-600 font-bold leading-none">+${cashUSD.toFixed(2)} USD</p>}
                      </div>
                      <div className="text-center border-x border-border">
                        <p className="text-xs text-violet-600 font-semibold"><i className="fa-solid fa-building-columns mr-1" />Transfer.</p>
                        <p className="font-black text-foreground">C${transNIO.toFixed(2)}</p>
                        {transUSD > 0 && <p className="text-[10px] text-green-600 font-bold leading-none">+${transUSD.toFixed(2)} USD</p>}
                      </div>
                      <div className="text-center">
                        <p className="text-xs text-blue-600 font-semibold"><i className="fa-solid fa-credit-card mr-1" />Tarjeta</p>
                        <p className="font-black text-foreground">C${cardNIO.toFixed(2)}</p>
                        {cardUSD > 0 && <p className="text-[10px] text-green-600 font-bold leading-none">+${cardUSD.toFixed(2)} USD</p>}
                      </div>
                    </div>

                    {/* Totals row */}
                    <div className="flex justify-between pt-1 border-t border-border text-[10px] text-muted-foreground">
                      <span>Total: <strong className="text-foreground">C${totalDayH.toFixed(2)}</strong>{hTotalUSD > 0 && <span className="ml-1 text-green-600 font-bold">(${hTotalUSD.toFixed(2)} USD)</span>}</span>
                      <span>Contado: <strong className="text-foreground">C${Number(h.counted_total).toFixed(2)}</strong></span>
                    </div>

                    {/* Egresos del cierre */}
                    {egresosItems.length > 0 && (
                      <div className="pt-2 border-t border-border space-y-1.5">
                        <p className="text-[10px] font-bold text-destructive uppercase tracking-wide flex items-center gap-1">
                          <i className="fa-solid fa-arrow-trend-down" /> Egresos registrados
                        </p>
                        {egresosItems.map((eg: { reason: string; amount: number }, idx: number) => (
                          <div key={idx} className="flex justify-between items-center px-2 py-1 rounded-lg bg-destructive/10 border border-destructive/15">
                            <span className="text-[11px] text-foreground truncate mr-2">{eg.reason}</span>
                            <span className="text-[11px] font-black text-destructive shrink-0">− C${eg.amount.toFixed(2)}</span>
                          </div>
                        ))}
                        <div className="flex justify-between text-[11px] font-black pt-1">
                          <span className="text-muted-foreground">Total egresos:</span>
                          <span className="text-destructive">− C${totalExpenses.toFixed(2)}</span>
                        </div>
                      </div>
                    )}

                    {/* Nota del cierre */}
                    {noteText && (
                      <div className="flex items-start gap-2 px-3 py-2 rounded-xl bg-secondary/10 border border-secondary/20">
                        <i className="fa-solid fa-note-sticky text-secondary text-xs mt-0.5 shrink-0" />
                        <div>
                          <p className="text-[9px] font-bold text-secondary uppercase tracking-wide">Nota</p>
                          <p className="text-[11px] text-foreground leading-snug">{noteText}</p>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ─── SECTION 1: RESUMEN DEL DÍA ──────────────────── */}
      <div className="pos-card p-6 space-y-4">
        <div className="flex items-center gap-3 mb-2">
          <span className="flex items-center justify-center w-10 h-10 rounded-full bg-primary text-primary-foreground font-bold text-lg">1</span>
          <h3 className="text-xl font-bold text-foreground">RESUMEN DEL DÍA — según facturas registradas</h3>
        </div>
        <p className="text-muted-foreground text-sm -mt-1">
          Haz clic en cualquier método de pago para ver el detalle de las facturas.
        </p>

        {/* Clickable cards — only shown when canSeeExpected */}
        {canSeeExpected ? (
        <div className={`grid grid-cols-1 sm:grid-cols-2 ${dayStats.mixedTickets > 0 ? 'lg:grid-cols-5' : 'lg:grid-cols-4'} gap-4 mt-2`}>
          {/* Cash */}
          <button
            onClick={() => toggleMethodFilter("cash")}
            className={`rounded-2xl p-5 text-left transition-all duration-200 border-2 ${methodFilter === "cash"
              ? "border-emerald-500 ring-2 ring-emerald-300 scale-[1.02] bg-emerald-100 dark:bg-emerald-900/40"
              : "border-emerald-200 bg-emerald-50 hover:border-emerald-400 hover:scale-[1.01] dark:bg-emerald-900/20 dark:border-emerald-700/40"
              }`}>
            <div className="flex items-center gap-2 mb-3">
              <i className="fa-solid fa-money-bills text-2xl text-emerald-600" />
              <span className="font-bold text-emerald-700 dark:text-emerald-400 text-base">Efectivo</span>
              {methodFilter === "cash" && <i className="fa-solid fa-chevron-down text-xs text-emerald-500 ml-auto" />}
            </div>
            <p className="text-4xl font-black text-emerald-700 dark:text-emerald-300">C${dayStats.cashNIO.toFixed(2)}</p>
            <p className="text-xs text-emerald-600 mt-1">{dayStats.cashTickets} factura{dayStats.cashTickets !== 1 ? "s" : ""}</p>
            {dayStats.cashUSD > 0 && (
              <div className="flex flex-col">
                <p className="text-xs text-green-500 mt-0.5">+ ${dayStats.cashUSD.toFixed(2)} USD</p>
                <p className="text-[10px] text-emerald-500 opacity-80">(≈ C${(dayStats.cashNIO + dayStats.cashUSD * rate).toFixed(2)})</p>
              </div>
            )}
          </button>

          {/* Transfer */}
          <button
            onClick={() => toggleMethodFilter("transfer")}
            className={`rounded-2xl p-5 text-left transition-all duration-200 border-2 ${methodFilter === "transfer"
              ? "border-violet-500 ring-2 ring-violet-300 scale-[1.02] bg-violet-100 dark:bg-violet-900/40"
              : "border-violet-200 bg-violet-50 hover:border-violet-400 hover:scale-[1.01] dark:bg-violet-900/20 dark:border-violet-700/40"
              }`}>
            <div className="flex items-center gap-2 mb-3">
              <i className="fa-solid fa-building-columns text-2xl text-violet-600" />
              <span className="font-bold text-violet-700 dark:text-violet-400 text-base">Transferencia</span>
              {methodFilter === "transfer" && <i className="fa-solid fa-chevron-down text-xs text-violet-500 ml-auto" />}
            </div>
            <p className="text-4xl font-black text-violet-700 dark:text-violet-300">C${dayStats.transfer.toFixed(2)}</p>
            <p className="text-xs text-violet-600 mt-1">{dayStats.transferTickets} factura{dayStats.transferTickets !== 1 ? "s" : ""}</p>
            {dayStats.transferUSD > 0 && (
              <div className="flex flex-col">
                <p className="text-xs text-green-500 mt-0.5">+ ${dayStats.transferUSD.toFixed(2)} USD</p>
                <p className="text-[10px] text-violet-500 opacity-80">(≈ C${(dayStats.transfer + dayStats.transferUSD * rate).toFixed(2)})</p>
              </div>
            )}
          </button>

          {/* Mixed — only shown when there are mixed tickets */}
          {dayStats.mixedTickets > 0 && (
            <button
              onClick={() => toggleMethodFilter("mixed")}
              className={`rounded-2xl p-5 text-left transition-all duration-200 border-2 ${methodFilter === "mixed"
                ? "border-orange-500 ring-2 ring-orange-300 scale-[1.02] bg-orange-100 dark:bg-orange-900/40"
                : "border-orange-200 bg-orange-50 hover:border-orange-400 hover:scale-[1.01] dark:bg-orange-900/20 dark:border-orange-700/40"
                }`}>
              <div className="flex items-center gap-2 mb-3">
                <i className="fa-solid fa-shuffle text-2xl text-orange-600" />
                <span className="font-bold text-orange-700 dark:text-orange-400 text-base">Mixto</span>
                {methodFilter === "mixed" && <i className="fa-solid fa-chevron-down text-xs text-orange-500 ml-auto" />}
              </div>
              <p className="text-4xl font-black text-orange-700 dark:text-orange-300">
                C${(
                  dayStats.mixedCashNIO + dayStats.mixedCardNIO + dayStats.mixedTransferNIO
                  + (dayStats.mixedCashUSD + dayStats.mixedCardUSD + dayStats.mixedTransferUSD) * rate
                ).toFixed(2)}
              </p>
              <p className="text-xs text-orange-600 mt-1">{dayStats.mixedTickets} factura{dayStats.mixedTickets !== 1 ? "s" : ""}</p>
              <div className="mt-2 space-y-1">
                {dayStats.mixedCashNIO > 0 && (
                  <div className="flex items-center gap-1.5">
                    <i className="fa-solid fa-money-bills text-[9px] text-emerald-600" />
                    <p className="text-[10px] text-emerald-600 font-semibold">Ef. C${dayStats.mixedCashNIO.toFixed(2)}</p>
                  </div>
                )}
                {dayStats.mixedCashUSD > 0 && (
                  <div className="flex items-center gap-1.5">
                    <i className="fa-solid fa-money-bills text-[9px] text-emerald-600" />
                    <p className="text-[10px] text-emerald-600 font-semibold">Ef. ${dayStats.mixedCashUSD.toFixed(2)}</p>
                  </div>
                )}
                {dayStats.mixedCardNIO > 0 && (
                  <div className="flex items-center gap-1.5">
                    <i className="fa-solid fa-credit-card text-[9px] text-blue-600" />
                    <p className="text-[10px] text-blue-600 font-semibold">Tj. C${dayStats.mixedCardNIO.toFixed(2)}</p>
                  </div>
                )}
                {dayStats.mixedCardUSD > 0 && (
                  <div className="flex items-center gap-1.5">
                    <i className="fa-solid fa-credit-card text-[9px] text-blue-600" />
                    <p className="text-[10px] text-blue-600 font-semibold">Tj. ${dayStats.mixedCardUSD.toFixed(2)}</p>
                  </div>
                )}
                {dayStats.mixedTransferNIO > 0 && (
                  <div className="flex items-center gap-1.5">
                    <i className="fa-solid fa-building-columns text-[9px] text-violet-600" />
                    <p className="text-[10px] text-violet-600 font-semibold">Tr. C${dayStats.mixedTransferNIO.toFixed(2)}</p>
                  </div>
                )}
                {dayStats.mixedTransferUSD > 0 && (
                  <div className="flex items-center gap-1.5">
                    <i className="fa-solid fa-building-columns text-[9px] text-violet-600" />
                    <p className="text-[10px] text-violet-600 font-semibold">Tr. ${dayStats.mixedTransferUSD.toFixed(2)}</p>
                  </div>
                )}
              </div>
            </button>
          )}

          {/* Card */}
          <button
            onClick={() => toggleMethodFilter("card")}
            className={`rounded-2xl p-5 text-left transition-all duration-200 border-2 ${methodFilter === "card"
              ? "border-blue-500 ring-2 ring-blue-300 scale-[1.02] bg-blue-100 dark:bg-blue-900/40"
              : "border-blue-200 bg-blue-50 hover:border-blue-400 hover:scale-[1.01] dark:bg-blue-900/20 dark:border-blue-700/40"
              }`}>
            <div className="flex items-center gap-2 mb-3">
              <i className="fa-solid fa-credit-card text-2xl text-blue-600" />
              <span className="font-bold text-blue-700 dark:text-blue-400 text-base">Tarjeta</span>
              {methodFilter === "card" && <i className="fa-solid fa-chevron-down text-xs text-blue-500 ml-auto" />}
            </div>
            <p className="text-4xl font-black text-blue-700 dark:text-blue-300">C${dayStats.card.toFixed(2)}</p>
            <p className="text-xs text-blue-600 mt-1">{dayStats.cardTickets} factura{dayStats.cardTickets !== 1 ? "s" : ""}</p>
            {dayStats.cardUSD > 0 && (
              <div className="flex flex-col">
                <p className="text-xs text-green-500 mt-0.5">+ ${dayStats.cardUSD.toFixed(2)} USD</p>
                <p className="text-[10px] text-blue-500 opacity-80">(≈ C${(dayStats.card + dayStats.cardUSD * rate).toFixed(2)})</p>
              </div>
            )}
          </button>

          {/* Grand Total */}
          <button
            onClick={() => toggleMethodFilter("all")}
            className={`rounded-2xl p-5 text-left transition-all duration-200 border-2 ${methodFilter === "all"
              ? "border-foreground/50 ring-2 ring-foreground/20 scale-[1.02] bg-foreground/10"
              : "border-foreground/20 bg-foreground/5 hover:border-foreground/40 hover:scale-[1.01]"
              }`}>
            <div className="flex items-center gap-2 mb-3">
              <i className="fa-solid fa-chart-simple text-2xl text-foreground/60" />
              <span className="font-bold text-foreground text-base">TOTAL GENERAL</span>
              {methodFilter === "all" && <i className="fa-solid fa-chevron-down text-xs text-foreground/60 ml-auto" />}
            </div>
            <p className="text-4xl font-black text-foreground">C${totalNIO.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground mt-1">{dayStats.totalTickets} factura{dayStats.totalTickets !== 1 ? "s" : ""}</p>
            {totalUSD > 0 && (
              <div className="flex flex-col">
                <p className="text-xs text-green-500 mt-0.5">+ ${totalUSD.toFixed(2)} USD</p>
                <p className="text-[10px] text-muted-foreground opacity-80">(Incluye todos los USD a tasa C${rate})</p>
              </div>
            )}
          </button>
        </div>
        ) : (
          /* Cashier blind mode — ticket count only, no amounts */
          <div className="mt-2 rounded-2xl border-2 border-primary/20 bg-primary/5 p-5 flex items-start gap-4">
            <i className="fa-solid fa-eye-slash text-3xl text-primary/50 mt-1 shrink-0" />
            <div className="space-y-1">
              <p className="font-bold text-foreground">Modo de conteo independiente</p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Los montos del sistema están ocultos para tu rol en este negocio.
                Ingresa el efectivo contado en la sección siguiente y el sistema
                calculará el resultado automáticamente al finalizar el cierre.
              </p>
              <p className="text-xs text-muted-foreground">
                <i className="fa-solid fa-receipt mr-1" />
                Facturas registradas hoy: <strong>{dayStats.totalTickets}</strong>
              </p>
            </div>
          </div>
        )}

        {/* ── TICKETS TABLE (shown when a card is clicked) ── */}
        {methodFilter && (
          <div className="animate-scale-in space-y-3 mt-2">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-foreground text-sm flex items-center gap-2">
                <i className="fa-solid fa-list text-secondary" />
                {methodFilter === "all" ? "Todas las facturas" : `Facturas — ${methodLabel(methodFilter)}`}
                <span className="text-xs text-muted-foreground font-normal">({filteredTickets.length})</span>
              </h4>
              <button
                onClick={() => setMethodFilter(null)}
                className="touch-btn text-xs px-3 py-1 rounded-lg bg-muted text-muted-foreground hover:bg-muted/80"
              >
                <i className="fa-solid fa-xmark mr-1" /> Cerrar
              </button>
            </div>

            {filteredTickets.length === 0 ? (
              <p className="text-center text-muted-foreground py-6 text-sm">No hay facturas con este método de pago hoy.</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50 text-muted-foreground">
                      <th className="px-3 py-2.5 text-left font-semibold">#</th>
                      <th className="px-3 py-2.5 text-left font-semibold">Fecha</th>
                      <th className="px-3 py-2.5 text-left font-semibold">Hora</th>
                      <th className="px-3 py-2.5 text-left font-semibold">Servicio</th>
                      <th className="px-3 py-2.5 text-left font-semibold">Vehículo</th>
                      <th className="px-3 py-2.5 text-left font-semibold">Placa</th>
                      <th className="px-3 py-2.5 text-left font-semibold">Cliente</th>
                      <th className="px-3 py-2.5 text-left font-semibold">Método</th>
                      <th className="px-3 py-2.5 text-left font-semibold">Registró</th>
                      <th className="px-3 py-2.5 text-right font-semibold">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTickets.map((t, i) => {
                      const mixedBreakdown = t.method === "mixed"
                        ? mixedBreakdowns.find(b => b.ticket_id === String(t.id))
                        : undefined;
                      return (
                        <tr key={t.id} className={`border-t border-border ${i % 2 === 0 ? "bg-background" : "bg-muted/20"} hover:bg-primary/5 transition-colors`}>
                          <td className="px-3 py-2.5 font-semibold text-foreground">{t.ticket_number}</td>
                          <td className="px-3 py-2.5 text-muted-foreground">{fmtDate(t.created_at)}</td>
                          <td className="px-3 py-2.5 text-muted-foreground">{fmtTime(t.created_at)}</td>
                          <td className="px-3 py-2.5 text-foreground">{t.service_name}</td>
                          <td className="px-3 py-2.5 text-foreground">{t.vehicle_name}</td>
                          <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">{t.plate}</td>
                          <td className="px-3 py-2.5 text-foreground">{t.customer_name}</td>
                          <td className="px-3 py-2.5">
                            <div className="flex flex-col gap-1">
                              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${methodBadgeClass(t.method)}`}>
                                {methodLabel(t.method)}
                              </span>
                              {t.method === "mixed" && !mixedBreakdown && (
                                <span className="text-[9px] text-muted-foreground italic">Desglose no disponible</span>
                              )}
                              {mixedBreakdown && (
                                <div className="space-y-0.5">
                                  {mixedBreakdown.parts.map((part, pi) => {
                                    const partLabel = part.method === "cash" ? "Ef." : part.method === "card" ? "Tj." : "Tr.";
                                    const partColor = part.method === "cash" ? "text-emerald-600" : part.method === "card" ? "text-blue-600" : "text-violet-600";
                                    const partIcon = part.method === "cash" ? "fa-money-bills" : part.method === "card" ? "fa-credit-card" : "fa-building-columns";
                                    const isPartUSD = part.currency === "USD";
                                    const displayAmt = isPartUSD ? part.amount : (part.applied_nio > 0 ? part.applied_nio : part.amount);
                                    const sym = isPartUSD ? "$" : "C$";
                                    return (
                                      <div key={pi} className={`flex items-center gap-1 text-[9px] font-semibold ${partColor}`}>
                                        <i className={`fa-solid ${partIcon} text-[8px]`} />
                                        {partLabel} {sym}{Number(displayAmt).toFixed(2)}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-muted-foreground text-xs">{t.cashier_name}</td>
                          <td className="px-3 py-2.5 text-right font-black text-foreground">
                            {t.currency === "USD" ? "$" : "C$"}{t.payment_amount.toFixed(2)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-border bg-muted/30">
                      <td colSpan={9} className="px-3 py-2.5 font-bold text-foreground text-right">Total:</td>
                      <td className="px-3 py-2.5 text-right font-black text-primary text-lg">
                        {(() => {
                          let nio = 0, usd = 0;
                          filteredTickets.forEach(ft => {
                            if (ft.currency === "USD") usd += Number(ft.payment_amount);
                            else nio += Number(ft.payment_amount);
                          });
                          if (nio > 0 && usd > 0) return `C$${nio.toFixed(2)} + $${usd.toFixed(2)}`;
                          if (usd > 0) return `$${usd.toFixed(2)}`;
                          return `C$${nio.toFixed(2)}`;
                        })()}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ─── SECTION 2: DATOS DEL CIERRE ────────────────── */}
      <div className="pos-card p-6 space-y-5">
        <div className="flex items-center gap-3 mb-1">
          <span className="flex items-center justify-center w-10 h-10 rounded-full bg-primary text-primary-foreground font-bold text-lg">2</span>
          <h3 className="text-xl font-bold text-foreground">DATOS DEL CIERRE</h3>
        </div>
        <p className="text-muted-foreground text-sm">
          Completa los campos para registrar el cierre. Solo se comparará el efectivo contado con las ventas en efectivo registradas hoy.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {/* Efectivo registrado en facturas — only when canSeeExpected */}
          {canSeeExpected ? (
          <div className="rounded-2xl border-2 border-emerald-300 bg-emerald-50 dark:bg-emerald-900/20 dark:border-emerald-700 p-6 space-y-2">
            <label className="flex items-center gap-2 text-sm font-bold text-emerald-700 dark:text-emerald-300">
              <i className="fa-solid fa-money-bills text-emerald-600 text-xl" />
              Efectivo registrado en facturas
            </label>
            <p className="text-xs text-emerald-600">
              Total que el sistema registró como pagado en efectivo hoy.
            </p>
            <p className="text-5xl font-black text-emerald-700 dark:text-emerald-300 mt-2 tabular-nums">
              C${dayStats.cashNIO.toFixed(2)}
            </p>
            {dayStats.cashUSD > 0 && (
              <p className="text-lg font-bold text-green-500">
                + ${dayStats.cashUSD.toFixed(2)} USD
                <span className="text-xs text-emerald-500 ml-1">(≈ TOTAL C${(dayStats.cashNIO + dayStats.cashUSD * rate).toFixed(2)})</span>
              </p>
            )}
            <p className="text-xs text-emerald-500 mt-1">
              {dayStats.cashTickets} factura{dayStats.cashTickets !== 1 ? "s" : ""} en efectivo
            </p>
          </div>
          ) : (
          /* Blind-mode info card */
          <div className="rounded-2xl border-2 border-primary/30 bg-primary/5 p-6 space-y-3 flex flex-col justify-center">
            <div className="flex items-center gap-2 text-primary">
              <i className="fa-solid fa-hand-holding-dollar text-2xl" />
              <span className="font-bold text-base">Conteo de efectivo</span>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Cuenta el dinero físico disponible en caja e ingresa los montos encontrados.
              El sistema comparará automáticamente tu conteo con la información registrada
              una vez finalices el cierre.
            </p>
          </div>
          )}

          {/* Efectivo contado — inputs NIO y USD */}
          <div className="rounded-2xl border-2 border-primary/50 bg-primary/5 p-6 space-y-3">
            <label className="flex items-center gap-2 text-sm font-bold text-foreground">
              <i className="fa-solid fa-hand-holding-dollar text-primary text-xl" />
              Efectivo contado en caja
            </label>
            <p className="text-xs text-muted-foreground">
              Ingresa el monto en córdobas y/o en dólares que hay en caja.
            </p>
            <div className="flex items-center gap-2">
              <span className="text-xl font-black text-muted-foreground w-8">C$</span>
              <input
                type="number"
                value={cashCounted}
                onChange={(e) => setCashCounted(e.target.value)}
                className="flex-1 text-3xl font-black text-center rounded-2xl border-2 border-primary bg-background focus:ring-4 focus:ring-primary/20 py-3 px-3 focus:outline-none transition-all"
                placeholder="0"
                min={0}
                step={1}
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xl font-black text-green-600 w-8">$</span>
              <input
                type="number"
                value={cashCountedUSD}
                onChange={(e) => setCashCountedUSD(e.target.value)}
                className="flex-1 text-3xl font-black text-center rounded-2xl border-2 border-green-400 bg-background focus:ring-4 focus:ring-green-200 py-3 px-3 focus:outline-none transition-all"
                placeholder="0.00 USD"
                min={0}
                step={0.01}
              />
            </div>
            {countedUSD > 0 && (
              <p className="text-xs text-green-500">≈ C${countedUSDinNIO.toFixed(2)} (a C${rate}/USD)</p>
            )}
          </div>
        </div>

        {/* ── EGRESOS / RETIROS ───────────────────── */}
        <div className="rounded-2xl border-2 border-destructive/20 bg-destructive/5 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm font-bold text-foreground">
              <i className="fa-solid fa-arrow-trend-down text-destructive" />
              Egresos / Retiros de efectivo
              {egresos.filter(e => parseFloat(e.amount) > 0).length > 0 && (
                <span className="ml-1 bg-destructive text-white text-[10px] font-black px-2 py-0.5 rounded-full">
                  {egresos.filter(e => parseFloat(e.amount) > 0).length}
                </span>
              )}
            </label>
            <button
              onClick={() => setEgresos([...egresos, { amount: "", reason: "" }])}
              className="touch-btn text-xs px-3 py-1.5 rounded-lg bg-destructive/10 text-destructive font-semibold hover:bg-destructive/20 transition-colors"
            >
              <i className="fa-solid fa-plus mr-1" /> Agregar egreso
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            ¿Sacaron dinero de la caja hoy? (compras, pagos a proveedores…) Estos montos se restan del efectivo esperado.
          </p>

          {/* Input rows */}
          {egresos.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-4 opacity-50">
              <i className="fa-solid fa-circle-minus text-3xl text-destructive" />
              <p className="text-xs text-muted-foreground italic">Sin egresos registrados.</p>
            </div>
          )}
          {egresos.map((eg, i) => (
            <div key={i} className="flex items-center gap-2 animate-scale-in">
              <div className="flex items-center gap-1 shrink-0">
                <span className="text-xs font-bold text-muted-foreground">C$</span>
                <input
                  type="number"
                  value={eg.amount}
                  onChange={(e) => { const n = [...egresos]; n[i].amount = e.target.value; setEgresos(n); }}
                  className="w-24 input-touch text-base font-black text-center py-2"
                  placeholder="0"
                  min={0}
                />
              </div>
              <input
                type="text"
                value={eg.reason}
                onChange={(e) => { const n = [...egresos]; n[i].reason = e.target.value; setEgresos(n); }}
                className="flex-1 input-touch text-sm py-2"
                placeholder="Motivo (ej: Compra de suministros, pago proveedor...)"
              />
              <button
                onClick={() => setEgresos(egresos.filter((_, j) => j !== i))}
                className="touch-btn p-2 text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
              >
                <i className="fa-solid fa-trash-can" />
              </button>
            </div>
          ))}

          {/* ── Live egreso summary chips ── */}
          {egresos.filter(e => parseFloat(e.amount) > 0).length > 0 && (
            <div className="mt-2 space-y-2 pt-3 border-t border-destructive/20">
              <p className="text-xs font-semibold text-destructive uppercase tracking-wide flex items-center gap-1">
                <i className="fa-solid fa-receipt" /> Detalle de egresos registrados
              </p>
              <div className="space-y-1.5">
                {egresos.filter(e => parseFloat(e.amount) > 0).map((eg, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl bg-destructive/10 border border-destructive/20"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <i className="fa-solid fa-minus-circle text-destructive text-xs shrink-0" />
                      <span className="text-sm text-foreground truncate">
                        {eg.reason.trim() || <span className="italic text-muted-foreground">Sin motivo</span>}
                      </span>
                    </div>
                    <span className="font-black text-destructive text-sm shrink-0">− C${parseFloat(eg.amount).toFixed(2)}</span>
                  </div>
                ))}
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-destructive/30 text-sm font-black">
                <span className="text-foreground flex items-center gap-1">
                  <i className="fa-solid fa-sigma text-destructive" /> Total egresos:
                </span>
                <span className="text-destructive text-base">− C${totalEgresos.toFixed(2)}</span>
              </div>
            </div>
          )}
        </div>

        {/* ── EXPECTED CASH breakdown ─────────────────────────── */}
        {canSeeExpected && (
        <div className={`rounded-2xl border p-4 transition-all duration-300 ${
          totalEgresos > 0
            ? "bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-700"
            : "bg-background border-border"
        }`}>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
            <i className={`fa-solid fa-calculator ${totalEgresos > 0 ? "text-amber-600" : "text-muted-foreground"}`} />
            Efectivo esperado en caja
          </p>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Ventas en efectivo (NIO):</span>
              <span className="font-semibold">+ C${dayStats.cashNIO.toFixed(2)}</span>
            </div>
            {dayStats.cashUSD > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Ventas efectivo USD (≈ C${rate}):</span>
                <span className="font-semibold text-green-600">+ C${cashUSDinNIO.toFixed(2)}</span>
              </div>
            )}
            {totalEgresos > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Egresos / Retiros:</span>
                <span className="font-semibold text-destructive">− C${totalEgresos.toFixed(2)}</span>
              </div>
            )}
            <div className={`flex justify-between pt-2 border-t ${
              totalEgresos > 0 ? "border-amber-200" : "border-border"
            }`}>
              <span className="font-bold text-foreground">💵 Total esperado:</span>
              <span className="font-black text-lg text-foreground">C${expectedCash.toFixed(2)}</span>
            </div>
          </div>
        </div>
        )}

        {/* ── RESULTADO INMEDIATO ─────────────────────────── */}
        {hasCounted && (
          <div className={`rounded-2xl p-6 border-4 transition-all duration-300 text-center ${cuadra
            ? "bg-emerald-50 border-emerald-400 dark:bg-emerald-900/30 dark:border-emerald-600"
            : sobra
              ? "bg-blue-50 border-blue-400 dark:bg-blue-900/30 dark:border-blue-600"
              : "bg-red-50 border-red-400 dark:bg-red-900/30 dark:border-red-600"
            }>`}>
            {cuadra && (
              <>
                <p className="text-6xl mb-2">✅</p>
                <p className="text-4xl font-black text-emerald-700 dark:text-emerald-300">¡CUADRA!</p>
                <p className="text-emerald-600 font-semibold mt-1 text-lg">El efectivo coincide con las ventas</p>
              </>
            )}
            {sobra && (
              <>
                <p className="text-6xl mb-2">⬆️</p>
                <p className="text-3xl font-black text-blue-700 dark:text-blue-300">SOBRA</p>
                <p className="text-5xl font-black text-blue-700 dark:text-blue-300 mt-1">C${difference.toFixed(2)}</p>
                <p className="text-blue-600 font-semibold mt-1">de más en la caja</p>
              </>
            )}
            {falta && (
              <>
                <p className="text-6xl mb-2">⬇️</p>
                <p className="text-3xl font-black text-red-700 dark:text-red-300">FALTA</p>
                <p className="text-5xl font-black text-red-700 dark:text-red-300 mt-1">C${Math.abs(difference).toFixed(2)}</p>
                <p className="text-red-600 font-semibold mt-1">de menos en la caja</p>
              </>
            )}
            {/* Detail breakdown — only when canSeeExpected */}
            {canSeeExpected && (
            <div className="mt-4 bg-white/60 dark:bg-black/20 rounded-xl p-4 text-base space-y-2 max-w-md mx-auto">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Efectivo esperado:</span>
                <span className="font-bold">C${expectedCash.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Efectivo contado:</span>
                <span className="font-bold">C${counted.toFixed(2)}</span>
              </div>
              <div className={`flex justify-between pt-2 border-t ${cuadra ? "border-emerald-200" : sobra ? "border-blue-200" : "border-red-200"}`}>
                <span className="font-bold">Diferencia:</span>
                <span className={`font-black text-lg ${cuadra ? "text-emerald-700" : sobra ? "text-blue-700" : "text-red-700"}`}>
                  {difference >= 0 ? "+" : ""}C${difference.toFixed(2)}
                </span>
              </div>
            </div>
            )}
          </div>
        )}

        {/* Note */}
        <div className="space-y-2">
          <label className="block text-sm font-semibold text-foreground mb-1">
            <i className="fa-solid fa-note-sticky mr-2 text-secondary" />
            Nota del cierre (opcional)
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="input-touch text-base"
            rows={2}
            placeholder="Ej: Sin novedades, turno normal..."
          />
          {/* Live note preview */}
          {note.trim() && (
            <div className="animate-scale-in flex items-start gap-2 px-3 py-2.5 rounded-xl bg-secondary/10 border border-secondary/30">
              <i className="fa-solid fa-note-sticky text-secondary mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-[10px] font-bold text-secondary uppercase tracking-wide mb-0.5">Vista previa de la nota</p>
                <p className="text-sm text-foreground leading-snug whitespace-pre-wrap break-words">{note}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ─── CLOSE BUTTON ────────────────────────────────── */}
      <button
        onClick={() => setShowConfirm(true)}
        disabled={!hasCounted}
        className="w-full py-6 rounded-2xl font-black text-2xl flex items-center justify-center gap-4 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed hover:scale-[1.01] active:scale-[0.99]"
        style={{
          background: hasCounted
            ? "linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--secondary)) 100%)"
            : undefined,
          color: hasCounted ? "white" : undefined,
          border: hasCounted ? "none" : "3px solid hsl(var(--border))",
        }}
      >
        <i className="fa-solid fa-vault text-3xl" />
        CERRAR CAJA
      </button>

      {
        !hasCounted && (
          <p className="text-center text-muted-foreground text-sm -mt-4">
            👆 Primero ingresa el efectivo contado
          </p>
        )
      }

      {/* ─── CONFIRM MODAL ────────────────────────────────── */}
      {
        showConfirm && (
          <div className="modal-overlay" onClick={() => !saving && setShowConfirm(false)}>
            <div className="modal-content animate-scale-in max-w-lg" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-2xl font-black text-foreground flex items-center gap-2">
                  <i className="fa-solid fa-vault text-secondary" /> Confirmar Cierre
                </h2>
                {!saving && (
                  <button onClick={() => setShowConfirm(false)} className="touch-btn p-2 text-muted-foreground">
                    <i className="fa-solid fa-xmark text-xl" />
                  </button>
                )}
              </div>

              <div className="space-y-3 mb-5">
                <div className={`rounded-2xl p-4 text-center border-2 ${cuadra ? "bg-emerald-50 border-emerald-300" : sobra ? "bg-blue-50 border-blue-300" : "bg-red-50 border-red-300"}`}>
                  <p className="text-2xl mb-1">{cuadra ? "✅" : "⚠️"}</p>
                  <p className={`text-xl font-black ${cuadra ? "text-emerald-700" : sobra ? "text-blue-700" : "text-red-700"}`}>
                    {cuadra ? "¡Cuadra!" : sobra ? `Sobra C$${difference.toFixed(2)}` : `Falta C$${Math.abs(difference).toFixed(2)}`}
                  </p>
                </div>

                <div className="pos-card p-4 space-y-3 text-sm">
                  <p className="font-bold text-foreground text-base">Resumen del cierre:</p>
                  <div className={`grid gap-2 ${dayStats.mixedTickets > 0 ? 'grid-cols-2' : 'grid-cols-3'}`}>
                    <div className="text-center p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                      <i className="fa-solid fa-money-bills text-emerald-600 text-lg mb-1 block" />
                      <p className="text-xs text-emerald-600 font-semibold">Efectivo</p>
                      <p className="font-black text-emerald-700">C${dayStats.cashNIO.toFixed(2)}</p>
                      {dayStats.cashUSD > 0 && <p className="text-[10px] text-green-600 font-bold leading-none">+ ${dayStats.cashUSD.toFixed(2)} USD</p>}
                    </div>
                    <div className="text-center p-3 rounded-xl bg-violet-50 border border-violet-200">
                      <i className="fa-solid fa-building-columns text-violet-600 text-lg mb-1 block" />
                      <p className="text-xs text-violet-600 font-semibold">Transfer.</p>
                      <p className="font-black text-violet-700">C${dayStats.transfer.toFixed(2)}</p>
                      {dayStats.transferUSD > 0 && <p className="text-[10px] text-green-600 font-bold leading-none">+ ${dayStats.transferUSD.toFixed(2)} USD</p>}
                    </div>
                    <div className="text-center p-3 rounded-xl bg-blue-50 border border-blue-200">
                      <i className="fa-solid fa-credit-card text-blue-600 text-lg mb-1 block" />
                      <p className="text-xs text-blue-600 font-semibold">Tarjeta</p>
                      <p className="font-black text-blue-700">C${dayStats.card.toFixed(2)}</p>
                      {dayStats.cardUSD > 0 && <p className="text-[10px] text-green-600 font-bold leading-none">+ ${dayStats.cardUSD.toFixed(2)} USD</p>}
                    </div>
                    {dayStats.mixedTickets > 0 && (
                      <div className="col-span-2 p-3 rounded-xl bg-orange-50 border border-orange-200">
                        <div className="flex items-center gap-2 mb-2">
                          <i className="fa-solid fa-shuffle text-orange-600" />
                          <p className="text-xs text-orange-600 font-semibold">Mixto ({dayStats.mixedTickets} factura{dayStats.mixedTickets !== 1 ? "s" : ""})</p>
                          <p className="font-black text-orange-700 ml-auto">C${(dayStats.mixedCashNIO + dayStats.mixedCardNIO + dayStats.mixedTransferNIO).toFixed(2)}</p>
                        </div>
                        <div className="flex gap-3 flex-wrap">
                          {dayStats.mixedCashNIO > 0 && (
                            <div className="flex items-center gap-1 text-[10px] text-emerald-600 font-semibold">
                              <i className="fa-solid fa-money-bills text-[9px]" /> Ef. C${dayStats.mixedCashNIO.toFixed(2)}
                            </div>
                          )}
                          {dayStats.mixedCardNIO > 0 && (
                            <div className="flex items-center gap-1 text-[10px] text-blue-600 font-semibold">
                              <i className="fa-solid fa-credit-card text-[9px]" /> Tj. C${dayStats.mixedCardNIO.toFixed(2)}
                            </div>
                          )}
                          {dayStats.mixedTransferNIO > 0 && (
                            <div className="flex items-center gap-1 text-[10px] text-violet-600 font-semibold">
                              <i className="fa-solid fa-building-columns text-[9px]" /> Tr. C${dayStats.mixedTransferNIO.toFixed(2)}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Ventas en efectivo:</span>
                      <span className="font-semibold">C${dayStats.cashNIO.toFixed(2)}</span>
                    </div>
                    {totalEgresos > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Egresos / Retiros:</span>
                        <span className="font-semibold text-destructive">− C${totalEgresos.toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex justify-between pt-1 border-t border-border">
                      <span className="text-muted-foreground">Efectivo esperado:</span>
                      {canSeeExpected
                        ? <span className="font-semibold">C${expectedCash.toFixed(2)}</span>
                        : <span className="font-semibold text-muted-foreground italic">Oculto</span>
                      }
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Efectivo contado:</span>
                      <span className="font-semibold">C${counted.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between font-black text-base pt-1 border-t border-border">
                      <span>Diferencia:</span>
                      <span className={cuadra ? "text-emerald-600" : sobra ? "text-blue-600" : "text-destructive"}>
                        {difference >= 0 ? "+" : ""}C${difference.toFixed(2)}
                      </span>
                    </div>
                  </div>
                  {note && (
                    <div className="text-xs pt-1 border-t border-border">
                      <span className="text-muted-foreground">Nota: </span>
                      <span className="text-foreground">{note}</span>
                    </div>
                  )}
                </div>

                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-800 dark:bg-amber-900/20 dark:border-amber-700 dark:text-amber-200">
                  <i className="fa-solid fa-triangle-exclamation mr-2" />
                  Una vez guardado, el cierre <strong>no puede modificarse</strong>.
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowConfirm(false)}
                  disabled={saving}
                  className="touch-btn flex-1 py-4 rounded-2xl border-2 border-border text-foreground font-bold text-base disabled:opacity-50"
                >
                  <i className="fa-solid fa-arrow-left mr-2" /> Revisar
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 py-4 rounded-2xl bg-accent text-accent-foreground font-black text-base disabled:opacity-70 flex items-center justify-center gap-2 transition-all hover:bg-accent/90"
                >
                  {saving ? (
                    <><i className="fa-solid fa-spinner fa-spin" /> Guardando...</>
                  ) : (
                    <><i className="fa-solid fa-check" /> SÍ, CERRAR CAJA</>
                  )}
                </button>
              </div>
            </div>
          </div>
        )
      }

      {/* ─── TOAST ────────────────────────────────────────── */}
      {
        toast && (
          <div className={toast.type === "success" ? "toast-success" : "toast-error"}>
            {toast.msg}
          </div>
        )
      }
    </div >
  );
}
