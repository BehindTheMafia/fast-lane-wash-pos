import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useBusinessSettings } from "@/hooks/useBusinessSettings";

interface Stats {
  totalSalesNIO: number;
  totalSalesUSD: number;
  ticketCount: number;
  topServices: { name: string; count: number }[];
  topVehicles: { type: string; count: number }[];
}

export default function Dashboard() {
  const { data: settings } = useBusinessSettings();
  const [stats, setStats] = useState<Stats>({ totalSalesNIO: 0, totalSalesUSD: 0, ticketCount: 0, topServices: [], topVehicles: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadStats = async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const { data: tickets } = await supabase
        .from("tickets")
        .select("*, services(name), payments(*)")
        .gte("created_at", today.toISOString())
        .eq("status", "paid");

      if (!tickets) { setLoading(false); return; }

      let totalNIO = 0, totalUSD = 0;
      const svcCount: Record<string, number> = {};
      const vehCount: Record<string, number> = {};

      tickets.forEach((t: any) => {
        totalNIO += Number(t.total);
        t.payments?.forEach((p: any) => {
          if (p.currency === "USD") totalUSD += Number(p.amount);
        });
        const svcName = t.services?.name || "Otro";
        svcCount[svcName] = (svcCount[svcName] || 0) + 1;
        vehCount[t.vehicle_type] = (vehCount[t.vehicle_type] || 0) + 1;
      });

      const rate = settings?.exchange_rate || 36.5;
      totalUSD = totalUSD || totalNIO / rate;

      setStats({
        totalSalesNIO: totalNIO,
        totalSalesUSD: +(totalNIO / rate).toFixed(2),
        ticketCount: tickets.length,
        topServices: Object.entries(svcCount).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
        topVehicles: Object.entries(vehCount).map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count),
      });
      setLoading(false);
    };
    loadStats();
  }, [settings]);

  const vehicleLabels: Record<string, string> = { moto: "Moto", sedan: "Sedán", suv: "SUV", pickup: "Pick up", microbus: "Microbús" };

  if (loading) {
    return <div className="flex items-center justify-center h-full"><i className="fa-solid fa-spinner fa-spin text-3xl text-accent" /></div>;
  }

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <h2 className="text-2xl font-bold text-foreground">
        <i className="fa-solid fa-chart-pie mr-3 text-secondary" />Dashboard
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
              <span className="text-sm text-foreground">{vehicleLabels[v.type] || v.type}</span>
              <span className="font-bold text-accent">{v.count}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
