import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useBusinessSettings } from "@/hooks/useBusinessSettings";

const methodLabels: Record<string, string> = { cash: "Efectivo", card: "Tarjeta", transfer: "Transferencia", mixed: "Mixto" };

export default function Reports() {
  const { data: settings } = useBusinessSettings();
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString().split("T")[0];
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split("T")[0]);
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const loadReport = async () => {
    setLoading(true);
    const from = new Date(dateFrom); from.setHours(0, 0, 0, 0);
    const to = new Date(dateTo); to.setHours(23, 59, 59, 999);

    // Fetch tickets with vehicle type and payments (no profiles join - no FK)
    const { data: rawTickets } = await supabase
      .from("tickets")
      .select("*, vehicle_types(name), payments(*)")
      .gte("created_at", from.toISOString())
      .lte("created_at", to.toISOString())
      .eq("status", "paid")
      .order("created_at", { ascending: false });

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

    // Fetch profiles for cashier names
    const userIds = [...new Set(rawTickets.map((t: any) => t.user_id).filter(Boolean))];
    const { data: profiles } = userIds.length > 0
      ? await supabase.from("profiles").select("id, full_name").in("id", userIds)
      : { data: [] };
    const profileMap: Record<string, string> = {};
    (profiles || []).forEach((p: any) => { profileMap[p.id] = p.full_name || ""; });

    // Merge items + profile into tickets
    const enriched = rawTickets.map((t: any) => ({
      ...t,
      ticket_items: (allItems || []).filter((ti: any) => ti.ticket_id === t.id),
      cashier_name: profileMap[t.user_id] || "—",
    }));

    setTickets(enriched);
    setLoading(false);
  };

  useEffect(() => { loadReport(); }, []);

  const rate = settings?.exchange_rate || 36.5;
  const totalNIO = tickets.reduce((s, t) => s + Number(t.total), 0);

  // Summary aggregations
  const byService: Record<string, { count: number; total: number }> = {};
  const byVehicle: Record<string, { count: number; total: number }> = {};
  const byMethod: Record<string, number> = {};

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

    // By method
    t.payments?.forEach((p: any) => {
      byMethod[p.payment_method] = (byMethod[p.payment_method] || 0) + Number(p.amount);
    });
  });

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString("es-NI", { day: "2-digit", month: "2-digit", year: "numeric" });
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString("es-NI", { hour: "2-digit", minute: "2-digit", hour12: true });
  };

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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="pos-card p-6 text-center">
              <p className="text-sm text-secondary">Total ventas</p>
              <p className="text-2xl font-bold text-foreground">C${totalNIO.toFixed(2)}</p>
              <p className="text-sm text-muted-foreground">~${(totalNIO / rate).toFixed(2)} USD</p>
            </div>
            <div className="pos-card p-6 text-center">
              <p className="text-sm text-secondary">Tickets</p>
              <p className="text-2xl font-bold text-foreground">{tickets.length}</p>
            </div>
            <div className="pos-card p-6 text-center">
              <p className="text-sm text-secondary">Promedio</p>
              <p className="text-2xl font-bold text-foreground">C${tickets.length ? (totalNIO / tickets.length).toFixed(0) : "0"}</p>
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
                  <span className="font-semibold">C${d.total.toFixed(0)}</span>
                </div>
              ))}
            </div>
            <div className="pos-card p-4">
              <h3 className="font-bold text-sm text-foreground mb-3"><i className="fa-solid fa-car mr-2 text-secondary" />Por vehículo</h3>
              {Object.entries(byVehicle).length === 0 && <p className="text-xs text-muted-foreground">Sin datos</p>}
              {Object.entries(byVehicle).map(([type, d]) => (
                <div key={type} className="flex justify-between py-1 border-b border-border last:border-0 text-sm">
                  <span className="text-foreground">{type} ({d.count})</span>
                  <span className="font-semibold">C${d.total.toFixed(0)}</span>
                </div>
              ))}
            </div>
            <div className="pos-card p-4">
              <h3 className="font-bold text-sm text-foreground mb-3"><i className="fa-solid fa-credit-card mr-2 text-secondary" />Por método</h3>
              {Object.entries(byMethod).length === 0 && <p className="text-xs text-muted-foreground">Sin datos</p>}
              {Object.entries(byMethod).map(([method, total]) => (
                <div key={method} className="flex justify-between py-1 border-b border-border last:border-0 text-sm">
                  <span className="text-foreground">{methodLabels[method] || method}</span>
                  <span className="font-semibold">C${total.toFixed(0)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Detail table */}
          <div className="pos-card overflow-hidden">
            <div className="p-4 border-b border-border">
              <h3 className="font-bold text-foreground">
                <i className="fa-solid fa-table mr-2 text-secondary" />Detalle de tickets ({tickets.length})
              </h3>
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
                    <th className="text-left px-4 py-3 font-semibold text-secondary whitespace-nowrap">Método</th>
                    <th className="text-left px-4 py-3 font-semibold text-secondary whitespace-nowrap">Registró</th>
                    <th className="text-right px-4 py-3 font-semibold text-secondary whitespace-nowrap">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {tickets.length === 0 && (
                    <tr>
                      <td colSpan={9} className="px-4 py-12 text-center text-muted-foreground">
                        <i className="fa-solid fa-inbox text-3xl mb-2 opacity-30 block" />
                        No hay tickets en el rango seleccionado
                      </td>
                    </tr>
                  )}
                  {tickets.map((t: any, idx: number) => {
                    const serviceNames = t.ticket_items?.map((ti: any) => ti.services?.name).filter(Boolean).join(", ") || "—";
                    const vehicleName = (t.vehicle_types as any)?.name || "—";
                    const paymentMethods = t.payments?.map((p: any) => methodLabels[p.payment_method] || p.payment_method).join(", ") || "—";
                    const cashierName = t.cashier_name || "—";

                    return (
                      <tr key={t.id} className={`border-b border-border/50 hover:bg-muted/30 transition-colors ${idx % 2 === 0 ? "" : "bg-muted/10"}`}>
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{t.ticket_number}</td>
                        <td className="px-4 py-3 text-foreground whitespace-nowrap">{formatDate(t.created_at)}</td>
                        <td className="px-4 py-3 text-foreground whitespace-nowrap">{formatTime(t.created_at)}</td>
                        <td className="px-4 py-3 text-foreground">{serviceNames}</td>
                        <td className="px-4 py-3 text-foreground">{vehicleName}</td>
                        <td className="px-4 py-3 text-foreground font-mono">{t.vehicle_plate || "—"}</td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-1 rounded-full text-xs bg-accent/20 text-accent whitespace-nowrap">{paymentMethods}</span>
                        </td>
                        <td className="px-4 py-3 text-foreground">{cashierName}</td>
                        <td className="px-4 py-3 text-right font-bold text-primary whitespace-nowrap">C${Number(t.total).toFixed(0)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                {tickets.length > 0 && (
                  <tfoot>
                    <tr className="bg-muted/50 border-t-2 border-border">
                      <td colSpan={8} className="px-4 py-3 font-bold text-foreground text-right">TOTAL:</td>
                      <td className="px-4 py-3 text-right font-bold text-primary text-lg">C${totalNIO.toFixed(2)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
