import { useState } from "react";
import { useBusinessSettings, useUpdateBusinessSettings } from "@/hooks/useBusinessSettings";
import { supabase } from "@/integrations/supabase/client";

export default function Settings() {
  const { data: settings, isLoading } = useBusinessSettings();
  const updateSettings = useUpdateBusinessSettings();
  const [form, setForm] = useState<any>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  if (isLoading) return <div className="flex items-center justify-center h-full"><i className="fa-solid fa-spinner fa-spin text-3xl text-accent" /></div>;

  if (!form && settings) {
    setTimeout(() => setForm({
      business_name: settings.business_name,
      address: settings.address || "",
      phone: settings.phone || "",
      ruc: settings.ruc || "",
      social_media: settings.social_media || "",
      receipt_footer: settings.receipt_footer || "",
      logo_url: settings.logo_url || "",
      printer_width_mm: String(settings.printer_width_mm || 80),
      exchange_rate: String(settings.exchange_rate),
    }), 0);
  }

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setToast("Por favor selecciona una imagen válida");
      setTimeout(() => setToast(null), 3000);
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      setToast("La imagen debe ser menor a 2MB");
      setTimeout(() => setToast(null), 3000);
      return;
    }

    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `logo-${Date.now()}.${fileExt}`;
      const filePath = `logos/${fileName}`;

      const { error: uploadError, data } = await supabase.storage
        .from('business-assets')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('business-assets')
        .getPublicUrl(filePath);

      setForm({ ...form, logo_url: publicUrl });
      setToast("Logo subido exitosamente");
      setTimeout(() => setToast(null), 3000);
    } catch (error) {
      console.error('Error uploading logo:', error);
      setToast("Error al subir el logo");
      setTimeout(() => setToast(null), 3000);
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!form) return;
    await updateSettings.mutateAsync({
      business_name: form.business_name,
      address: form.address,
      phone: form.phone,
      ruc: form.ruc,
      social_media: form.social_media,
      receipt_footer: form.receipt_footer,
      logo_url: form.logo_url,
      printer_width_mm: parseInt(form.printer_width_mm),
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
            <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="input-touch" placeholder="Ej: Esquina del banco lafise de nindiri 500 metros al norte" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-foreground mb-1 block">Teléfono</label>
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="input-touch" placeholder="57037623" />
            </div>
            <div>
              <label className="text-xs font-semibold text-foreground mb-1 block">RUC/NIT</label>
              <input value={form.ruc} onChange={(e) => setForm({ ...form, ruc: e.target.value })} className="input-touch" />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-foreground mb-1 block">Redes Sociales</label>
            <input value={form.social_media} onChange={(e) => setForm({ ...form, social_media: e.target.value })} className="input-touch" placeholder="@elrapidonica" />
          </div>
        </div>
      </div>

      <div className="pos-card p-6 space-y-4">
        <h3 className="font-bold text-foreground"><i className="fa-solid fa-image mr-2 text-secondary" />Logo del negocio</h3>
        <div className="space-y-3">
          {form.logo_url && (
            <div className="flex justify-center">
              <img src={form.logo_url} alt="Logo" className="max-h-32 object-contain rounded-lg border border-border p-2 bg-white" />
            </div>
          )}
          <div>
            <label className="text-xs font-semibold text-foreground mb-1 block">Subir logo (máx 2MB)</label>
            <input
              type="file"
              accept="image/*"
              onChange={handleLogoUpload}
              disabled={uploading}
              className="input-touch file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-accent file:text-accent-foreground hover:file:opacity-90"
            />
          </div>
        </div>
      </div>

      <div className="pos-card p-6 space-y-4">
        <h3 className="font-bold text-foreground"><i className="fa-solid fa-receipt mr-2 text-secondary" />Configuración de ticket</h3>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-foreground mb-1 block">Mensaje de despedida</label>
            <textarea
              value={form.receipt_footer}
              onChange={(e) => setForm({ ...form, receipt_footer: e.target.value })}
              className="input-touch min-h-[80px]"
              placeholder="Gracias por su visita"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-foreground mb-1 block">Ancho de impresora (mm)</label>
            <select
              value={form.printer_width_mm}
              onChange={(e) => setForm({ ...form, printer_width_mm: e.target.value })}
              className="input-touch"
            >
              <option value="58">58mm (Pequeña)</option>
              <option value="80">80mm (Estándar)</option>
              <option value="110">110mm (Grande)</option>
            </select>
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

      <button onClick={handleSave} disabled={updateSettings.isPending || uploading} className="btn-cobrar flex items-center gap-2">
        {updateSettings.isPending ? <i className="fa-solid fa-spinner fa-spin" /> : <i className="fa-solid fa-floppy-disk" />}
        Guardar configuración
      </button>

      {toast && <div className="toast-success"><i className="fa-solid fa-circle-check mr-2" />{toast}</div>}
    </div>
  );
}
