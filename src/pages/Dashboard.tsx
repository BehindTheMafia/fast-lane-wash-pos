import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useBusinessSettings } from "@/hooks/useBusinessSettings";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface Stats {
  totalSalesNIO: number;
  totalSalesUSD: number;
  ticketCount: number;
  topServices: { name: string; count: number }[];
  topVehicles: { type: string; count: number }[];
  recentTickets: any[];
}

export default function Dashboard() {
  const { data: settings } = useBusinessSettings();
  const { profile, isAdmin, isOwner } = useAuth();
  const canDelete = isAdmin || isOwner || profile?.role === "cajero";

  const [stats, setStats] = useState<Stats>({ totalSalesNIO: 0, totalSalesUSD: 0, ticketCount: 0, topServices: [], topVehicles: [], recentTickets: [] });
  const [loading, setLoading] = useState(true);

  const loadStats = async () => {
    setLoading(true);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Fetch tickets with vehicle_types and payments
    const { data: tickets } = await supabase
      .from("tickets")
      .select("*, vehicle_types(name), payments(*)")
      .gte("created_at", today.toISOString())
      .eq("status", "paid")
      .order("created_at", { ascending: false });

    // Fetch ticket_items with services for today's tickets
    const { data: ticketItems } = await (supabase as any)
      .from("ticket_items")
      .select("*, services(name), tickets(created_at, status)")
      .gte("tickets.created_at", today.toISOString())
      .eq("tickets.status", "paid");

    if (!tickets) { setLoading(false); return; }

    const rate = settings?.exchange_rate || 36.5;
    let totalNIO = 0;
    const svcCount: Record<string, number> = {};
    const vehCount: Record<string, number> = {};

    tickets.forEach((t: any) => {
      totalNIO += Number(t.total);

      // By vehicle
      const vn = (t.vehicle_types as any)?.name || "N/A";
      vehCount[vn] = (vehCount[vn] || 0) + 1;
    });

    // By service from ticket_items
    ticketItems?.forEach((ti: any) => {
      const svcName = ti.services?.name || "Otro";
      svcCount[svcName] = (svcCount[svcName] || 0) + 1;
    });

    setStats({
      totalSalesNIO: totalNIO,
      totalSalesUSD: +(totalNIO / rate).toFixed(2),
      ticketCount: tickets.length,
      topServices: Object.entries(svcCount).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
      topVehicles: Object.entries(vehCount).map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count),
      recentTickets: tickets,
    });
    setLoading(false);
  };

  useEffect(() => {
    loadStats();
  }, [settings]);

  const handleDeleteTicket = async (ticketId: number) => {
    if (!window.confirm("¿Estás seguro de que deseas eliminar este ticket? Esta acción no se puede deshacer.")) {
      return;
    }

    try {
      const { error } = await supabase
        .from("tickets")
        .delete()
        .eq("id", ticketId);

      if (error) throw error;

      toast.success("Ticket eliminado correctamente");
      loadStats(); // Refresh data
    } catch (error: any) {
      console.error("Error deleting ticket:", error);
      toast.error("Error al eliminar el ticket: " + (error.message || "Permisos insuficientes"));
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-full"><i className="fa-solid fa-spinner fa-spin text-3xl text-accent" /></div>;
  }

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString("es-NI", { hour: "2-digit", minute: "2-digit", hour12: true });
  };

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <h2 className="text-2xl font-bold text-foreground">
        <i className="fa-solid fa-chart-pie mr-3 text-secondary" />Dashboard — Hoy
      </h2>

      {/* Metric cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="pos-card p-6 text-center">
          <i className="fa-solid fa-money-bill-trend-up text-3xl text-primary mb-2" />
          <p className="text-sm text-secondary">Ventas del día</p>
          <p className="text-3xl font-bold text-foreground">C${stats.totalSalesNIO.toFixed(0)}</p>
          <p className="text-sm text-muted-foreground">~${stats.totalSalesUSD.toFixed(2)} USD</p>
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
            C${stats.ticketCount > 0 ? (stats.totalSalesNIO / stats.ticketCount).toFixed(0) : "0"}
          </p>
        </div>
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
                <th className="text-right px-4 py-3 font-semibold text-secondary">Total</th>
                {canDelete && <th className="text-center px-4 py-3 font-semibold text-secondary">Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {stats.recentTickets.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                    <i className="fa-solid fa-inbox text-2xl mb-2 opacity-30 block" />
                    No hay tickets hoy
                  </td>
                </tr>
              )}
              {stats.recentTickets.map((t: any, idx: number) => (
                <tr key={t.id} className={`border-b border-border/50 hover:bg-muted/30 transition-colors ${idx % 2 === 0 ? "" : "bg-muted/10"}`}>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{t.ticket_number}</td>
                  <td className="px-4 py-3 text-foreground">{formatTime(t.created_at)}</td>
                  <td className="px-4 py-3 text-foreground">{(t.vehicle_types as any)?.name || "—"}</td>
                  <td className="px-4 py-3 text-foreground font-mono">{t.vehicle_plate || "—"}</td>
                  <td className="px-4 py-3 text-right font-bold text-primary">C${Number(t.total).toFixed(0)}</td>
                  {canDelete && (
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => handleDeleteTicket(t.id)}
                        className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        title="Eliminar ticket"
                      >
                        <i className="fa-solid fa-trash-can" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
