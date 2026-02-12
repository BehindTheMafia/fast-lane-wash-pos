import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export default function Memberships() {
  const [plans, setPlans] = useState<any[]>([]);
  const [memberships, setMemberships] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAssign, setShowAssign] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState("");
  const [selectedPlan, setSelectedPlan] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const [{ data: p }, { data: m }, { data: c }] = await Promise.all([
      supabase.from("membership_plans").select("*").eq("active", true),
      supabase.from("customer_memberships").select("*, customers(name), membership_plans(name, wash_count, discount_percent)").eq("active", true),
      supabase.from("customers").select("id, name").eq("is_general", false).order("name"),
    ]);
    setPlans(p || []);
    setMemberships(m || []);
    setCustomers(c || []);
    setLoading(false);
  };

  const handleAssign = async () => {
    if (!selectedCustomer || !selectedPlan) return;
    await supabase.from("customer_memberships").insert({
      customer_id: selectedCustomer,
      plan_id: selectedPlan,
    });
    setShowAssign(false);
    setToast("Membresía asignada");
    setTimeout(() => setToast(null), 3000);
    loadData();
  };

  if (loading) return <div className="flex items-center justify-center h-full"><i className="fa-solid fa-spinner fa-spin text-3xl text-accent" /></div>;

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-foreground">
          <i className="fa-solid fa-id-card mr-3 text-secondary" />Membresías
        </h2>
        <button onClick={() => setShowAssign(true)} className="touch-btn bg-accent text-accent-foreground px-4 py-2 rounded-xl font-semibold flex items-center gap-2">
          <i className="fa-solid fa-plus" />Asignar plan
        </button>
      </div>

      {/* Plans */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {plans.map((p) => (
          <div key={p.id} className="pos-card p-6">
            <h3 className="font-bold text-lg text-foreground">{p.name}</h3>
            <p className="text-sm text-secondary mt-1">{p.description}</p>
            <div className="mt-3 flex gap-4 text-sm">
              <span className="px-3 py-1 rounded-full bg-accent/10 text-accent font-semibold">{p.discount_percent}% desc.</span>
              <span className="px-3 py-1 rounded-full bg-primary/10 text-primary font-semibold">{p.wash_count} lavados</span>
            </div>
          </div>
        ))}
      </div>

      {/* Active memberships */}
      <div className="pos-card p-4">
        <h3 className="font-bold text-foreground mb-3"><i className="fa-solid fa-users mr-2 text-secondary" />Membresías activas</h3>
        <div className="space-y-2">
          {memberships.map((m: any) => (
            <div key={m.id} className="flex items-center justify-between p-3 border border-border rounded-lg">
              <div>
                <p className="font-semibold text-foreground">{m.customers?.name}</p>
                <p className="text-xs text-secondary">{m.membership_plans?.name}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-foreground">{m.washes_used}/{m.membership_plans?.wash_count} lavados</p>
                <div className="w-24 h-2 bg-muted rounded-full mt-1 overflow-hidden">
                  <div className="h-full bg-primary rounded-full" style={{ width: `${Math.min(100, (m.washes_used / (m.membership_plans?.wash_count || 1)) * 100)}%` }} />
                </div>
              </div>
            </div>
          ))}
          {memberships.length === 0 && <p className="text-sm text-muted-foreground">Sin membresías activas</p>}
        </div>
      </div>

      {/* Assign modal */}
      {showAssign && (
        <div className="modal-overlay" onClick={() => setShowAssign(false)}>
          <div className="modal-content animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-bold text-foreground mb-4"><i className="fa-solid fa-id-card mr-2 text-secondary" />Asignar membresía</h3>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-semibold text-foreground block mb-1">Cliente</label>
                <select value={selectedCustomer} onChange={(e) => setSelectedCustomer(e.target.value)} className="input-touch">
                  <option value="">Seleccionar...</option>
                  {customers.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm font-semibold text-foreground block mb-1">Plan</label>
                <select value={selectedPlan} onChange={(e) => setSelectedPlan(e.target.value)} className="input-touch">
                  <option value="">Seleccionar...</option>
                  {plans.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.discount_percent}%)</option>)}
                </select>
              </div>
              <button onClick={handleAssign} className="btn-cobrar w-full"><i className="fa-solid fa-check mr-2" />Asignar</button>
            </div>
          </div>
        </div>
      )}
      {toast && <div className="toast-success"><i className="fa-solid fa-circle-check mr-2" />{toast}</div>}
    </div>
  );
}
