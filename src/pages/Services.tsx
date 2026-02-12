import { useState } from "react";
import { useAllServices } from "@/hooks/useServices";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

// Map vehicle type names to IDs
const vehicleTypeMap: Record<string, number> = {
  moto: 1,
  sedan: 2,
  suv: 3,
  pickup: 4,
  microbus: 5
};

const vehicleTypes = ["moto", "sedan", "suv", "pickup", "microbus"];
const vehicleLabels: Record<string, string> = { moto: "Moto", sedan: "Sedán", suv: "SUV", pickup: "Pick up", microbus: "Microbús" };

export default function Services() {
  const { data: services, isLoading, refetch } = useAllServices();
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ name: "", description: "", prices: {} as Record<string, string> });
  const [toast, setToast] = useState<string | null>(null);

  const startEdit = (svc: any) => {
    const prices: Record<string, string> = {};
    svc.service_prices?.forEach((p: any) => {
      // Find vehicle type name by ID
      const vehicleTypeName = Object.keys(vehicleTypeMap).find(key => vehicleTypeMap[key] === p.vehicle_type_id);
      if (vehicleTypeName) {
        prices[vehicleTypeName] = String(p.price);
      }
    });
    setEditing(svc);
    setForm({ name: svc.name, description: svc.description || "", prices });
  };

  const startNew = () => {
    setEditing("new");
    const prices: Record<string, string> = {};
    vehicleTypes.forEach((v) => { prices[v] = "0"; });
    setForm({ name: "", description: "", prices });
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;

    // Validate prices
    for (const v of vehicleTypes) {
      const p = parseFloat(form.prices[v] || "0");
      if (p < 0) { setToast("No se permiten precios negativos"); setTimeout(() => setToast(null), 3000); return; }
    }

    if (editing === "new") {
      const { data: svc, error } = await supabase.from("services").insert({ name: form.name, description: form.description } as any).select().single();
      if (!error && svc) {
        for (const v of vehicleTypes) {
          await supabase.from("service_prices").insert({
            service_id: svc.id,
            vehicle_type_id: vehicleTypeMap[v],
            price: parseFloat(form.prices[v] || "0")
          } as any);
        }
      }
    } else {
      await supabase.from("services").update({ name: form.name, description: form.description } as any).eq("id", editing.id);
      for (const v of vehicleTypes) {
        await supabase.from("service_prices").upsert(
          { service_id: editing.id, vehicle_type_id: vehicleTypeMap[v], price: parseFloat(form.prices[v] || "0") } as any,
          { onConflict: "service_id,vehicle_type_id" }
        );
      }
    }
    setEditing(null);
    setToast("Servicio guardado");
    setTimeout(() => setToast(null), 3000);
    refetch();
  };

  const toggleActive = async (svc: any) => {
    await supabase.from("services").update({ is_active: !svc.is_active } as any).eq("id", svc.id);
    refetch();
  };

  if (isLoading) return <div className="flex items-center justify-center h-full"><i className="fa-solid fa-spinner fa-spin text-3xl text-accent" /></div>;

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-foreground">
          <i className="fa-solid fa-list-check mr-3 text-secondary" />Servicios y Precios
        </h2>
        <button onClick={startNew} className="touch-btn bg-accent text-accent-foreground px-4 py-2 rounded-xl font-semibold flex items-center gap-2">
          <i className="fa-solid fa-plus" />Nuevo servicio
        </button>
      </div>

      {/* Edit form */}
      {editing && (
        <div className="pos-card p-4 space-y-3">
          <h3 className="font-bold text-foreground">{editing === "new" ? "Nuevo servicio" : "Editar servicio"}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input-touch" placeholder="Nombre del servicio" />
            <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="input-touch" placeholder="Descripción" />
          </div>
          <div className="grid grid-cols-5 gap-2">
            {vehicleTypes.map((v) => (
              <div key={v}>
                <label className="text-xs font-semibold text-secondary">{vehicleLabels[v]}</label>
                <input type="number" value={form.prices[v] || "0"} min="0" onChange={(e) => setForm({ ...form, prices: { ...form.prices, [v]: e.target.value } })} className="input-touch" />
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={handleSave} className="btn-cobrar px-6 py-2 text-sm"><i className="fa-solid fa-floppy-disk mr-2" />Guardar</button>
            <button onClick={() => setEditing(null)} className="touch-btn px-4 py-2 border border-border rounded-xl text-sm">Cancelar</button>
          </div>
        </div>
      )}

      {/* Services list */}
      <div className="space-y-4">
        {services?.map((svc: any) => (
          <div key={svc.id} className={`pos-card p-4 ${!svc.is_active ? "opacity-50" : ""}`}>
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-bold text-foreground">{svc.name}</h3>
                <p className="text-sm text-secondary">{svc.description}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => startEdit(svc)} className="touch-btn p-2 text-secondary hover:text-foreground"><i className="fa-solid fa-pen" /></button>
                {isAdmin ? (
                  <button
                    onClick={() => toggleActive(svc)}
                    className="touch-btn p-2 text-secondary hover:text-foreground"
                    title={svc.is_active ? "Desactivar servicio" : "Activar servicio"}
                  >
                    <i className={`fa-solid ${svc.is_active ? "fa-toggle-on text-accent" : "fa-toggle-off"}`} />
                  </button>
                ) : (
                  <div className="p-2 opacity-50" title="Solo administradores pueden activar/desactivar">
                    <i className={`fa-solid ${svc.is_active ? "fa-toggle-on text-accent" : "fa-toggle-off"}`} />
                  </div>
                )}
              </div>
            </div>
            <div className="grid grid-cols-5 gap-2 mt-3">
              {svc.service_prices?.sort((a: any, b: any) => a.vehicle_type_id - b.vehicle_type_id).map((p: any) => {
                const vehicleTypeName = Object.keys(vehicleTypeMap).find(key => vehicleTypeMap[key] === p.vehicle_type_id);
                return (
                  <div key={p.id} className="text-center p-2 rounded-lg bg-muted/50">
                    <p className="text-xs text-secondary">{vehicleTypeName ? vehicleLabels[vehicleTypeName] : 'N/A'}</p>
                    <p className="font-bold text-foreground">C${Number(p.price).toFixed(0)}</p>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      {toast && <div className={toast.includes("negativos") ? "toast-error" : "toast-success"}><i className={`fa-solid ${toast.includes("negativos") ? "fa-circle-exclamation" : "fa-circle-check"} mr-2`} />{toast}</div>}
    </div>
  );
}
