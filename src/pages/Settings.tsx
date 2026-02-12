import { useState } from "react";
import { useBusinessSettings, useUpdateBusinessSettings } from "@/hooks/useBusinessSettings";

export default function Settings() {
  const { data: settings, isLoading } = useBusinessSettings();
  const updateSettings = useUpdateBusinessSettings();
  const [form, setForm] = useState<any>(null);
  const [toast, setToast] = useState<string | null>(null);

  if (isLoading) return <div className="flex items-center justify-center h-full"><i className="fa-solid fa-spinner fa-spin text-3xl text-accent" /></div>;

  if (!form && settings) {
    setTimeout(() => setForm({
      business_name: settings.business_name,
      address: settings.address || "",
      phone: settings.phone || "",
      ruc: settings.ruc || "",
      exchange_rate: String(settings.exchange_rate),
    }), 0);
  }

  const handleSave = async () => {
    if (!form) return;
    await updateSettings.mutateAsync({
      business_name: form.business_name,
      address: form.address,
      phone: form.phone,
      ruc: form.ruc,
      exchange_rate: parseFloat(form.exchange_rate),
    });
    setToast("Configuración guardada");
    setTimeout(() => setToast(null), 3000);
  };

  if (!form) return null;

  return (
    <div className="p-6 space-y-6 animate-fade-in max-w-2xl">
      <h2 className="text-2xl font-bold text-foreground">
        <i className="fa-solid fa-gear mr-3 text-secondary" />Configuración
      </h2>

      <div className="pos-card p-6 space-y-4">
        <h3 className="font-bold text-foreground"><i className="fa-solid fa-building mr-2 text-secondary" />Datos del negocio</h3>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-foreground mb-1 block">Nombre del negocio</label>
            <input value={form.business_name} onChange={(e) => setForm({ ...form, business_name: e.target.value })} className="input-touch" />
          </div>
          <div>
            <label className="text-xs font-semibold text-foreground mb-1 block">Dirección</label>
            <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="input-touch" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-foreground mb-1 block">Teléfono</label>
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="input-touch" />
            </div>
            <div>
              <label className="text-xs font-semibold text-foreground mb-1 block">RUC/NIT</label>
              <input value={form.ruc} onChange={(e) => setForm({ ...form, ruc: e.target.value })} className="input-touch" />
            </div>
          </div>
        </div>
      </div>

      <div className="pos-card p-6 space-y-4">
        <h3 className="font-bold text-foreground"><i className="fa-solid fa-coins mr-2 text-secondary" />Tasa de cambio</h3>
        <div>
          <label className="text-xs font-semibold text-foreground mb-1 block">1 USD = ? C$</label>
          <input type="number" value={form.exchange_rate} min="0" step="0.0001" onChange={(e) => setForm({ ...form, exchange_rate: e.target.value })} className="input-touch text-2xl font-bold text-center max-w-xs" />
        </div>
      </div>

      <button onClick={handleSave} disabled={updateSettings.isPending} className="btn-cobrar flex items-center gap-2">
        {updateSettings.isPending ? <i className="fa-solid fa-spinner fa-spin" /> : <i className="fa-solid fa-floppy-disk" />}
        Guardar configuración
      </button>

      {toast && <div className="toast-success"><i className="fa-solid fa-circle-check mr-2" />{toast}</div>}
    </div>
  );
}
