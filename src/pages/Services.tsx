import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAllServices, useAllExtras } from "@/hooks/useServices";
import { useAllVehicleTypes } from "@/hooks/useVehicleTypes";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

type Tab = "services" | "extras" | "vehicles";

const ICONS = [
  "fa-soap", "fa-car-wash", "fa-spray-can-sparkles", "fa-gem", "fa-star",
  "fa-droplet", "fa-droplet-slash", "fa-couch", "fa-chair", "fa-circle-dot",
  "fa-recycle", "fa-car-burst", "fa-wrench", "fa-shield-halved",
];

function EmptyForm(isExtra: boolean) {
  return { name: "", description: "", icon: "fa-soap", is_extra: isExtra, prices: {} as Record<string, string> };
}

export default function Services() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin" || profile?.role === "owner";

  const { data: services, isLoading: svcsLoading } = useAllServices();
  const { data: extras, isLoading: extrasLoading } = useAllExtras();
  const { data: vehicleTypes, isLoading: vtLoading } = useAllVehicleTypes();

  const [tab, setTab] = useState<Tab>("services");
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>(EmptyForm(false));
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  // Vehicle type form
  const [vtEditing, setVtEditing] = useState<any>(null);
  const [vtForm, setVtForm] = useState({ name: "", key: "", icon: "fa-car", sort_order: "99" });

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  };

  const refetchAll = () => {
    qc.invalidateQueries({ queryKey: ["all_services"] });
    qc.invalidateQueries({ queryKey: ["all_extras"] });
    qc.invalidateQueries({ queryKey: ["services"] });
    qc.invalidateQueries({ queryKey: ["extras"] });
    qc.invalidateQueries({ queryKey: ["all_vehicle_types"] });
    qc.invalidateQueries({ queryKey: ["vehicle_types"] });
  };

  const startEdit = (svc: any) => {
    const prices: Record<string, string> = {};
    svc.service_prices?.forEach((p: any) => {
      prices[String(p.vehicle_type_id)] = String(p.price);
    });
    setEditing(svc);
    setForm({ name: svc.name, description: svc.description || "", icon: svc.icon || "fa-soap", is_extra: svc.is_extra || false, prices });
  };

  const startNew = (isExtra: boolean) => {
    const prices: Record<string, string> = {};
    vehicleTypes?.forEach(vt => { prices[String(vt.id)] = "0"; });
    setEditing("new");
    setForm({ ...EmptyForm(isExtra), prices });
  };

  const handleSave = async () => {
    if (!form.name.trim()) { showToast("El nombre es requerido", false); return; }

    const payload: any = {
      name: form.name.trim(),
      description: form.description,
      icon: form.icon,
      is_extra: form.is_extra,
      is_active: true,
    };

    let svcId: string;

    if (editing === "new") {
      const { data: svc, error } = await supabase.from("services").insert(payload).select().single();
      if (error) { showToast("Error: " + error.message, false); return; }
      svcId = (svc as any).id;
    } else {
      const { error } = await supabase.from("services").update(payload).eq("id", editing.id);
      if (error) { showToast("Error: " + error.message, false); return; }
      svcId = editing.id;
    }

    // Upsert prices for each vehicle type
    for (const [vtId, rawPrice] of Object.entries(form.prices)) {
      const price = parseFloat(rawPrice as string) || 0;
      await supabase.from("service_prices").upsert(
        { service_id: svcId, vehicle_type_id: parseInt(vtId), price } as any,
        { onConflict: "service_id,vehicle_type_id" }
      );
    }

    setEditing(null);
    showToast("Servicio guardado correctamente");
    refetchAll();
  };

  const toggleActive = async (svc: any) => {
    await supabase.from("services").update({ is_active: !svc.is_active }).eq("id", svc.id);
    showToast(svc.is_active ? "Servicio desactivado" : "Servicio activado");
    refetchAll();
  };

  const handleDelete = async (svc: any) => {
    if (!window.confirm(`¿Eliminar "${svc.name}"? Esta acción no se puede deshacer.`)) return;
    const { error } = await supabase.from("services").delete().eq("id", svc.id);
    if (error) { showToast("Error al eliminar: " + error.message, false); return; }
    showToast("Servicio eliminado");
    refetchAll();
  };

  // ── Vehicle type CRUD ─────────────────────────────────────────────────────
  const startEditVt = (vt: any) => {
    setVtEditing(vt);
    setVtForm({ name: vt.name, key: vt.key || "", icon: vt.icon || "fa-car", sort_order: String(vt.sort_order ?? 99) });
  };

  const startNewVt = () => {
    setVtEditing("new");
    setVtForm({ name: "", key: "", icon: "fa-car", sort_order: "99" });
  };

  const handleSaveVt = async () => {
    if (!vtForm.name.trim()) { showToast("El nombre es requerido", false); return; }
    if (!vtForm.key.trim()) { showToast("La clave (key) es requerida", false); return; }

    const payload: any = {
      name: vtForm.name.trim(),
      key: vtForm.key.trim().toLowerCase(),
      icon: vtForm.icon,
      sort_order: parseInt(vtForm.sort_order) || 99,
      is_active: true,
    };

    if (vtEditing === "new") {
      const { error } = await supabase.from("vehicle_types").insert(payload);
      if (error) { showToast("Error: " + error.message, false); return; }
    } else {
      const { error } = await supabase.from("vehicle_types").update(payload).eq("id", vtEditing.id);
      if (error) { showToast("Error: " + error.message, false); return; }
    }

    setVtEditing(null);
    showToast("Tipo de vehículo guardado");
    refetchAll();
  };

  const toggleActiveVt = async (vt: any) => {
    await supabase.from("vehicle_types").update({ is_active: !vt.is_active }).eq("id", vt.id);
    showToast(vt.is_active ? "Tipo de vehículo desactivado" : "Tipo de vehículo activado");
    refetchAll();
  };

  // ── Shared service form renderer ─────────────────────────────────────────
  const renderServiceForm = (isExtra: boolean) => (
    <div className="pos-card p-5 space-y-4 animate-scale-in">
      <h3 className="font-bold text-foreground">
        {editing === "new" ? (isExtra ? "Nuevo extra" : "Nuevo servicio") : "Editar"}
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-semibold text-secondary mb-1 block">Nombre *</label>
          <input
            value={form.name}
            onChange={e => setForm({ ...form, name: e.target.value })}
            className="input-touch w-full"
            placeholder="Nombre del servicio"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-secondary mb-1 block">Descripción</label>
          <input
            value={form.description}
            onChange={e => setForm({ ...form, description: e.target.value })}
            className="input-touch w-full"
            placeholder="Descripción breve"
          />
        </div>
      </div>

      {/* Icon selector */}
      <div>
        <label className="text-xs font-semibold text-secondary mb-2 block">Ícono</label>
        <div className="flex flex-wrap gap-2">
          {ICONS.map(ic => (
            <button
              key={ic}
              type="button"
              onClick={() => setForm({ ...form, icon: ic })}
              className={`w-10 h-10 rounded-lg border-2 flex items-center justify-center transition-all ${form.icon === ic ? "border-primary bg-primary/10" : "border-border hover:border-primary/40"}`}
            >
              <i className={`fa-solid ${ic} text-sm ${form.icon === ic ? "text-primary" : "text-muted-foreground"}`} />
            </button>
          ))}
        </div>
      </div>

      {/* Prices by vehicle type */}
      <div>
        <label className="text-xs font-semibold text-secondary mb-2 block">Precios por tipo de vehículo (C$)</label>
        {vtLoading ? (
          <p className="text-xs text-muted-foreground">Cargando tipos de vehículo...</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {vehicleTypes?.map(vt => (
              <div key={vt.id}>
                <label className="text-xs font-semibold text-secondary mb-1 block">
                  <i className={`fa-solid ${vt.icon} mr-1`} />{vt.name}
                </label>
                <input
                  type="number"
                  value={form.prices[String(vt.id)] ?? "0"}
                  min="0"
                  onChange={e => setForm({ ...form, prices: { ...form.prices, [String(vt.id)]: e.target.value } })}
                  className="input-touch w-full"
                />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <button onClick={handleSave} className="btn-cobrar px-6 py-2 text-sm flex items-center gap-2">
          <i className="fa-solid fa-floppy-disk" />Guardar
        </button>
        <button onClick={() => setEditing(null)} className="touch-btn px-4 py-2 border border-border rounded-xl text-sm">
          Cancelar
        </button>
      </div>
    </div>
  );

  // ── Service list renderer ─────────────────────────────────────────────────
  const renderServiceList = (list: any[], isExtra: boolean, loading: boolean) => {
    if (loading) return <div className="flex justify-center py-12"><i className="fa-solid fa-spinner fa-spin text-3xl text-accent" /></div>;
    return (
      <div className="space-y-3">
        {(!list || list.length === 0) && (
          <div className="pos-card p-8 text-center text-muted-foreground">
            <i className="fa-solid fa-inbox text-3xl mb-2 opacity-30 block" />
            <p>No hay {isExtra ? "extras" : "servicios"} registrados</p>
          </div>
        )}
        {list?.map((svc: any) => (
          <div key={svc.id} className={`pos-card p-4 transition-opacity ${!svc.is_active ? "opacity-50" : ""}`}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <i className={`fa-solid ${svc.icon || "fa-soap"} text-primary`} />
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-foreground truncate">{svc.name}</h3>
                  <p className="text-xs text-secondary truncate">{svc.description}</p>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {isAdmin && (
                  <>
                    <button onClick={() => startEdit(svc)} className="touch-btn p-2 text-secondary hover:text-foreground hover:bg-muted/50 rounded-lg" title="Editar">
                      <i className="fa-solid fa-pen text-sm" />
                    </button>
                    <button onClick={() => toggleActive(svc)} className="touch-btn p-2 rounded-lg" title={svc.is_active ? "Desactivar" : "Activar"}>
                      <i className={`fa-solid ${svc.is_active ? "fa-toggle-on text-accent" : "fa-toggle-off text-muted-foreground"}`} />
                    </button>
                    <button onClick={() => handleDelete(svc)} className="touch-btn p-2 text-destructive hover:bg-destructive/10 rounded-lg" title="Eliminar">
                      <i className="fa-solid fa-trash-can text-sm" />
                    </button>
                  </>
                )}
              </div>
            </div>
            {/* Prices grid */}
            <div className="flex flex-wrap gap-2 mt-3">
              {svc.service_prices?.sort((a: any, b: any) => a.vehicle_type_id - b.vehicle_type_id).map((p: any) => {
                const vt = vehicleTypes?.find(v => v.id === p.vehicle_type_id);
                if (!vt) return null;
                return (
                  <div key={p.id} className="text-center px-3 py-1.5 rounded-lg bg-muted/50 min-w-[72px]">
                    <p className="text-[10px] text-secondary"><i className={`fa-solid ${vt.icon} mr-1`} />{vt.name}</p>
                    <p className="font-bold text-sm text-foreground">C${Number(p.price).toFixed(0)}</p>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    );
  };

  // ── Vehicle types tab renderer ────────────────────────────────────────────
  const renderVehiclesTab = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Administra los tipos de vehículo que aparecen en el POS</p>
        {isAdmin && (
          <button onClick={startNewVt} className="touch-btn bg-accent text-accent-foreground px-4 py-2 rounded-xl font-semibold flex items-center gap-2">
            <i className="fa-solid fa-plus" />Nuevo tipo
          </button>
        )}
      </div>

      {/* Vehicle type form */}
      {vtEditing && (
        <div className="pos-card p-5 space-y-4 animate-scale-in">
          <h3 className="font-bold text-foreground">{vtEditing === "new" ? "Nuevo tipo de vehículo" : "Editar tipo"}</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-semibold text-secondary mb-1 block">Nombre *</label>
              <input value={vtForm.name} onChange={e => setVtForm({ ...vtForm, name: e.target.value })} className="input-touch w-full" placeholder="Ej: Camión 3T" />
            </div>
            <div>
              <label className="text-xs font-semibold text-secondary mb-1 block">Clave (key) *</label>
              <input value={vtForm.key} onChange={e => setVtForm({ ...vtForm, key: e.target.value })} className="input-touch w-full" placeholder="Ej: camion3t" />
            </div>
            <div>
              <label className="text-xs font-semibold text-secondary mb-1 block">Orden</label>
              <input type="number" value={vtForm.sort_order} onChange={e => setVtForm({ ...vtForm, sort_order: e.target.value })} className="input-touch w-full" />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-secondary mb-2 block">Ícono</label>
            <div className="flex flex-wrap gap-2">
              {["fa-motorcycle", "fa-car", "fa-car-side", "fa-truck-pickup", "fa-van-shuttle", "fa-taxi", "fa-truck", "fa-bus"].map(ic => (
                <button key={ic} type="button" onClick={() => setVtForm({ ...vtForm, icon: ic })}
                  className={`w-10 h-10 rounded-lg border-2 flex items-center justify-center transition-all ${vtForm.icon === ic ? "border-primary bg-primary/10" : "border-border hover:border-primary/40"}`}>
                  <i className={`fa-solid ${ic} text-sm ${vtForm.icon === ic ? "text-primary" : "text-muted-foreground"}`} />
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleSaveVt} className="btn-cobrar px-6 py-2 text-sm flex items-center gap-2">
              <i className="fa-solid fa-floppy-disk" />Guardar
            </button>
            <button onClick={() => setVtEditing(null)} className="touch-btn px-4 py-2 border border-border rounded-xl text-sm">Cancelar</button>
          </div>
        </div>
      )}

      {/* Vehicle type list */}
      {vtLoading ? (
        <div className="flex justify-center py-12"><i className="fa-solid fa-spinner fa-spin text-3xl text-accent" /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {vehicleTypes?.map(vt => (
            <div key={vt.id} className={`pos-card p-4 flex items-center justify-between gap-3 ${!vt.is_active ? "opacity-50" : ""}`}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-secondary/10 flex items-center justify-center">
                  <i className={`fa-solid ${vt.icon} text-secondary text-lg`} />
                </div>
                <div>
                  <p className="font-bold text-foreground">{vt.name}</p>
                  <p className="text-xs text-muted-foreground">key: {vt.key} · orden: {vt.sort_order}</p>
                </div>
              </div>
              {isAdmin && (
                <div className="flex items-center gap-1">
                  <button onClick={() => startEditVt(vt)} className="touch-btn p-2 text-secondary hover:text-foreground hover:bg-muted/50 rounded-lg">
                    <i className="fa-solid fa-pen text-sm" />
                  </button>
                  <button onClick={() => toggleActiveVt(vt)} className="touch-btn p-2 rounded-lg">
                    <i className={`fa-solid ${vt.is_active ? "fa-toggle-on text-accent" : "fa-toggle-off text-muted-foreground"}`} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-2xl font-bold text-foreground">
          <i className="fa-solid fa-list-check mr-3 text-secondary" />Servicios y Configuración
        </h2>
        {isAdmin && tab !== "vehicles" && (
          <button
            onClick={() => startNew(tab === "extras")}
            className="touch-btn bg-accent text-accent-foreground px-4 py-2 rounded-xl font-semibold flex items-center gap-2"
          >
            <i className="fa-solid fa-plus" />{tab === "extras" ? "Nuevo extra" : "Nuevo servicio"}
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-muted/30 p-1 rounded-xl w-fit">
        {([
          { id: "services", label: "Servicios", icon: "fa-soap" },
          { id: "extras", label: "Extras", icon: "fa-star" },
          { id: "vehicles", label: "Tipos de Vehículo", icon: "fa-car" },
        ] as const).map(t => (
          <button
            key={t.id}
            onClick={() => { setTab(t.id); setEditing(null); setVtEditing(null); }}
            className={`px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition-all ${tab === t.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            <i className={`fa-solid ${t.icon}`} />{t.label}
          </button>
        ))}
      </div>

      {/* Edit form */}
      {editing && tab !== "vehicles" && renderServiceForm(tab === "extras")}

      {/* Tab content */}
      {tab === "services" && renderServiceList(services || [], false, svcsLoading)}
      {tab === "extras" && renderServiceList(extras || [], true, extrasLoading)}
      {tab === "vehicles" && renderVehiclesTab()}

      {/* Toast */}
      {toast && (
        <div className={toast.ok ? "toast-success" : "toast-error"}>
          <i className={`fa-solid ${toast.ok ? "fa-circle-check" : "fa-circle-exclamation"} mr-2`} />
          {toast.msg}
        </div>
      )}
    </div>
  );
}
