import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useBusinessSettings } from "@/hooks/useBusinessSettings";

export default function Reports() {
  const { data: settings } = useBusinessSettings();
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setHours(0,0,0,0); return d.toISOString().split("T")[0];
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split("T")[0]);
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const loadReport = async () => {
    setLoading(true);
    const from = new Date(dateFrom); from.setHours(0,0,0,0);
    const to = new Date(dateTo); to.setHours(23,59,59,999);
    const { data } = await supabase
      .from("tickets")
      .select("*, services(name), payments(*), customers(name)")
      .gte("created_at", from.toISOString())
      .lte("created_at", to.toISOString())
      .eq("status", "paid")
      .order("created_at", { ascending: false });
    setTickets(data || []);
    setLoading(false);
  };

  useEffect(() => { loadReport(); }, []);

  const rate = settings?.exchange_rate || 36.5;
  const totalNIO = tickets.reduce((s, t) => s + Number(t.total), 0);
  const byService: Record<string, { count: number; total: number }> = {};
  const byVehicle: Record<string, { count: number; total: number }> = {};
  const byMethod: Record<string, number> = {};
  const vehicleLabels: Record<string, string> = { moto: "Moto", sedan: "Sedán", suv: "SUV", pickup: "Pick up", microbus: "Microbús" };
  const methodLabels: Record<string, string> = { cash: "Efectivo", card: "Tarjeta", transfer: "Transferencia" };

  tickets.forEach((t: any) => {
    const sn = t.services?.name || "Otro";
    byService[sn] = byService[sn] || { count: 0, total: 0 };
    byService[sn].count++;
    byService[sn].total += Number(t.total);

    byVehicle[t.vehicle_type] = byVehicle[t.vehicle_type] || { count: 0, total: 0 };
    byVehicle[t.vehicle_type].count++;
    byVehicle[t.vehicle_type].total += Number(t.total);

    t.payments?.forEach((p: any) => {
      byMethod[p.payment_method] = (byMethod[p.payment_method] || 0) + Number(p.amount);
    });
  });

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
          {/* Summary */}
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

          {/* By service / vehicle / method */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="pos-card p-4">
              <h3 className="font-bold text-sm text-foreground mb-3"><i className="fa-solid fa-list-check mr-2 text-secondary" />Por servicio</h3>
              {Object.entries(byService).map(([name, d]) => (
                <div key={name} className="flex justify-between py-1 border-b border-border last:border-0 text-sm">
                  <span className="text-foreground">{name} ({d.count})</span>
                  <span className="font-semibold">C${d.total.toFixed(0)}</span>
                </div>
              ))}
            </div>
            <div className="pos-card p-4">
              <h3 className="font-bold text-sm text-foreground mb-3"><i className="fa-solid fa-car mr-2 text-secondary" />Por vehículo</h3>
              {Object.entries(byVehicle).map(([type, d]) => (
                <div key={type} className="flex justify-between py-1 border-b border-border last:border-0 text-sm">
                  <span className="text-foreground">{vehicleLabels[type] || type} ({d.count})</span>
                  <span className="font-semibold">C${d.total.toFixed(0)}</span>
                </div>
              ))}
            </div>
            <div className="pos-card p-4">
              <h3 className="font-bold text-sm text-foreground mb-3"><i className="fa-solid fa-credit-card mr-2 text-secondary" />Por método</h3>
              {Object.entries(byMethod).map(([method, total]) => (
                <div key={method} className="flex justify-between py-1 border-b border-border last:border-0 text-sm">
                  <span className="text-foreground">{methodLabels[method] || method}</span>
                  <span className="font-semibold">C${total.toFixed(0)}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
