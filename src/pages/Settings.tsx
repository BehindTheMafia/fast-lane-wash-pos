import { useState } from "react";
import { useBusinessSettings, useUpdateBusinessSettings } from "@/hooks/useBusinessSettings";
import { supabase } from "@/integrations/supabase/client";

// ─── Danger Zone Modal ──────────────────────────────────────────────────────
interface DangerModalProps {
  title: string;
  description: string;
  confirmLabel: string;
  confirmWord?: string;
  onConfirm: () => Promise<void>;
  onClose: () => void;
  children?: React.ReactNode;
}

function DangerModal({ title, description, confirmLabel, confirmWord = "ELIMINAR", onConfirm, onClose, children }: DangerModalProps) {
  const [typed, setTyped] = useState("");
  const [running, setRunning] = useState(false);

  const handleConfirm = async () => {
    setRunning(true);
    await onConfirm();
    setRunning(false);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content animate-scale-in max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center flex-shrink-0">
            <i className="fa-solid fa-triangle-exclamation text-destructive" />
          </div>
          <h2 className="text-xl font-bold text-foreground">{title}</h2>
        </div>

        <p className="text-sm text-muted-foreground mb-4">{description}</p>

        {children && <div className="mb-4">{children}</div>}

        <div className="bg-destructive/5 border border-destructive/20 rounded-xl p-3 mb-4">
          <p className="text-xs text-destructive font-semibold mb-2">
            Escribe <strong>{confirmWord}</strong> para confirmar:
          </p>
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            className="input-touch w-full text-sm"
            placeholder={confirmWord}
            autoFocus
          />
        </div>

        <div className="flex gap-2">
          <button onClick={onClose} className="touch-btn flex-1 py-3 rounded-xl border border-border text-foreground font-semibold">
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={typed !== confirmWord || running}
            className="flex-1 py-3 rounded-xl bg-destructive text-white font-semibold hover:bg-red-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {running ? <i className="fa-solid fa-spinner fa-spin" /> : <i className="fa-solid fa-trash-can" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Settings Page ─────────────────────────────────────────────────────
export default function Settings() {
  const { data: settings, isLoading } = useBusinessSettings();
  const updateSettings = useUpdateBusinessSettings();
  const [form, setForm] = useState<any>(null);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [uploading, setUploading] = useState(false);

  // Danger zone state
  const [dangerModal, setDangerModal] = useState<null | "tickets" | "tickets_range" | "customers_inactive" | "cash_closures" | "all_data">(null);
  const [rangeFrom, setRangeFrom] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 1); return d.toISOString().split("T")[0];
  });
  const [rangeTo, setRangeTo] = useState(() => new Date().toISOString().split("T")[0]);
  const [stats, setStats] = useState<{ tickets: number; customers: number; closures: number } | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

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
    if (!file.type.startsWith('image/')) { showToast("Por favor selecciona una imagen válida", "error"); return; }
    if (file.size > 2 * 1024 * 1024) { showToast("La imagen debe ser menor a 2MB", "error"); return; }

    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `logo-${Date.now()}.${fileExt}`;
      const filePath = `logos/${fileName}`;
      const { error: uploadError } = await supabase.storage.from('business-assets').upload(filePath, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from('business-assets').getPublicUrl(filePath);
      setForm({ ...form, logo_url: publicUrl });
      showToast("Logo subido exitosamente");
    } catch (error) {
      showToast("Error al subir el logo", "error");
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
    showToast("Configuración guardada");
  };

  // ── Load stats for danger zone ──
  const loadStats = async () => {
    setLoadingStats(true);
    const [{ count: tc }, { count: cc }, { count: cl }] = await Promise.all([
      supabase.from("tickets").select("*", { count: "exact", head: true }).eq("status", "paid"),
      supabase.from("cash_closures").select("*", { count: "exact", head: true }),
      supabase.from("customers").select("*", { count: "exact", head: true }).eq("is_general", false),
    ]);
    setStats({ tickets: tc || 0, customers: cl || 0, closures: cc || 0 });
    setLoadingStats(false);
  };

  // ── Export to CSV ──
  const exportCSV = async (type: "tickets" | "customers") => {
    if (type === "tickets") {
      const { data } = await supabase
        .from("tickets")
        .select("ticket_number, created_at, total, status, vehicle_plate")
        .eq("status", "paid")
        .order("created_at", { ascending: false });

      if (!data?.length) { showToast("No hay tickets para exportar", "error"); return; }

      const headers = ["#Ticket", "Fecha", "Placa", "Total C$", "Estado"];
      const rows = data.map((t: any) => [
        t.ticket_number,
        new Date(t.created_at).toLocaleString("es-NI"),
        t.vehicle_plate || "",
        Number(t.total).toFixed(2),
        t.status,
      ]);
      downloadCSV("tickets_export.csv", [headers, ...rows]);
      showToast(`${data.length} tickets exportados`);
    } else {
      const { data } = await supabase
        .from("customers")
        .select("name, phone, plate, email, loyalty_visits, loyalty_free_washes_earned, loyalty_free_washes_used, created_at")
        .eq("is_general", false)
        .order("name");

      if (!data?.length) { showToast("No hay clientes para exportar", "error"); return; }

      const headers = ["Nombre", "Teléfono", "Placa", "Correo", "Visitas", "Lavados Gratis Ganados", "Lavados Gratis Usados", "Registrado"];
      const rows = data.map((c: any) => [
        c.name, c.phone || "", c.plate || "", c.email || "",
        c.loyalty_visits || 0,
        c.loyalty_free_washes_earned || 0,
        c.loyalty_free_washes_used || 0,
        new Date(c.created_at).toLocaleDateString("es-NI"),
      ]);
      downloadCSV("clientes_export.csv", [headers, ...rows]);
      showToast(`${data.length} clientes exportados`);
    }
  };

  const downloadCSV = (filename: string, rows: any[][]) => {
    const csv = rows.map(r => r.map((v: any) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  // ── Delete handlers ──
  const deleteAllTickets = async () => {
    const { error } = await supabase.from("tickets").delete().eq("status", "paid");
    if (error) { showToast("Error: " + error.message, "error"); return; }
    showToast("Todos los tickets eliminados correctamente");
    loadStats();
  };

  const deleteTicketsByRange = async () => {
    const from = new Date(rangeFrom); from.setHours(0, 0, 0, 0);
    const to = new Date(rangeTo); to.setHours(23, 59, 59, 999);
    const { error, count } = await supabase
      .from("tickets")
      .delete({ count: "exact" })
      .eq("status", "paid")
      .gte("created_at", from.toISOString())
      .lte("created_at", to.toISOString());
    if (error) { showToast("Error: " + error.message, "error"); return; }
    showToast(`${count || 0} tickets eliminados del rango seleccionado`);
    loadStats();
  };

  const deleteInactiveCustomers = async () => {
    // Get customers that have no tickets
    const { data: withTickets } = await supabase
      .from("tickets")
      .select("customer_id")
      .not("customer_id", "is", null);

    const activeIds = [...new Set((withTickets || []).map((t: any) => t.customer_id))];

    let query = supabase.from("customers").delete().eq("is_general", false);
    if (activeIds.length > 0) {
      query = query.not("id", "in", `(${activeIds.join(",")})`);
    }

    const { error, count } = await (query as any);
    if (error) { showToast("Error: " + error.message, "error"); return; }
    showToast(`${count || 0} clientes sin actividad eliminados`);
    loadStats();
  };

  const deleteAllCashClosures = async () => {
    const { error } = await supabase.from("cash_closures").delete().gte("id", 0);
    if (error) { showToast("Error: " + error.message, "error"); return; }
    showToast("Todos los cierres de caja eliminados");
    loadStats();
  };

  const deleteAllData = async () => {
    // Order matters: tickets first (cascade), then customers, then closures
    await supabase.from("tickets").delete().eq("status", "paid");
    await supabase.from("customers").delete().eq("is_general", false);
    await supabase.from("cash_closures").delete().gte("id", 0);
    showToast("Todos los datos han sido eliminados");
    loadStats();
  };

  if (!form) return null;

  return (
    <div className="p-6 space-y-6 animate-fade-in max-w-2xl">
      <h2 className="text-2xl font-bold text-foreground">
        <i className="fa-solid fa-gear mr-3 text-secondary" />Configuración
      </h2>

      {/* ── Datos del negocio ── */}
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

      {/* ── Logo ── */}
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
              type="file" accept="image/*" onChange={handleLogoUpload} disabled={uploading}
              className="input-touch file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-accent file:text-accent-foreground hover:file:opacity-90"
            />
          </div>
        </div>
      </div>

      {/* ── Ticket ── */}
      <div className="pos-card p-6 space-y-4">
        <h3 className="font-bold text-foreground"><i className="fa-solid fa-receipt mr-2 text-secondary" />Configuración de ticket</h3>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-foreground mb-1 block">Mensaje de despedida</label>
            <textarea value={form.receipt_footer} onChange={(e) => setForm({ ...form, receipt_footer: e.target.value })} className="input-touch min-h-[80px]" placeholder="Gracias por su visita" />
          </div>
          <div>
            <label className="text-xs font-semibold text-foreground mb-1 block">Ancho de impresora (mm)</label>
            <select value={form.printer_width_mm} onChange={(e) => setForm({ ...form, printer_width_mm: e.target.value })} className="input-touch">
              <option value="58">58mm (Pequeña)</option>
              <option value="80">80mm (Estándar)</option>
              <option value="110">110mm (Grande)</option>
            </select>
          </div>
        </div>
      </div>

      {/* ── Tasa de cambio ── */}
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

      {/* ── Exportar datos ── */}
      <div className="pos-card p-6 space-y-4">
        <h3 className="font-bold text-foreground"><i className="fa-solid fa-file-arrow-down mr-2 text-secondary" />Exportar datos</h3>
        <p className="text-xs text-muted-foreground">Descarga los registros en formato CSV para análisis externo o respaldo.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            onClick={() => exportCSV("tickets")}
            className="touch-btn flex items-center gap-3 px-4 py-3 rounded-xl border border-border text-foreground hover:bg-muted/50 transition-colors font-medium"
          >
            <div className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0">
              <i className="fa-solid fa-file-csv text-accent" />
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold">Exportar Tickets</p>
              <p className="text-xs text-muted-foreground">Historial de ventas en CSV</p>
            </div>
          </button>
          <button
            onClick={() => exportCSV("customers")}
            className="touch-btn flex items-center gap-3 px-4 py-3 rounded-xl border border-border text-foreground hover:bg-muted/50 transition-colors font-medium"
          >
            <div className="w-9 h-9 rounded-lg bg-secondary/10 flex items-center justify-center flex-shrink-0">
              <i className="fa-solid fa-users text-secondary" />
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold">Exportar Clientes</p>
              <p className="text-xs text-muted-foreground">Base de clientes en CSV</p>
            </div>
          </button>
        </div>
      </div>

      {/* ── Zona de peligro ── */}
      <div className="rounded-2xl border-2 border-destructive/30 overflow-hidden">
        <div className="bg-destructive/5 px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-destructive/10 flex items-center justify-center">
              <i className="fa-solid fa-skull-crossbones text-destructive" />
            </div>
            <div>
              <h3 className="font-bold text-destructive">Zona de peligro</h3>
              <p className="text-xs text-muted-foreground">Acciones irreversibles. Úsalas con precaución.</p>
            </div>
          </div>
          <button
            onClick={loadStats}
            disabled={loadingStats}
            className="touch-btn text-xs px-3 py-2 rounded-lg border border-border text-muted-foreground hover:bg-muted/50 flex items-center gap-2"
          >
            {loadingStats ? <i className="fa-solid fa-spinner fa-spin" /> : <i className="fa-solid fa-rotate" />}
            Ver estadísticas
          </button>
        </div>

        {/* Stats bar */}
        {stats && (
          <div className="grid grid-cols-3 divide-x divide-border border-b border-destructive/20 bg-destructive/5">
            {[
              { label: "Tickets", value: stats.tickets, icon: "fa-receipt" },
              { label: "Clientes", value: stats.customers, icon: "fa-users" },
              { label: "Cierres de caja", value: stats.closures, icon: "fa-vault" },
            ].map(({ label, value, icon }) => (
              <div key={label} className="px-4 py-3 text-center">
                <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                  <i className={`fa-solid ${icon}`} />{label}
                </p>
                <p className="text-xl font-bold text-foreground">{value.toLocaleString()}</p>
              </div>
            ))}
          </div>
        )}

        <div className="p-6 space-y-3">
          {/* Delete tickets by range */}
          <div className="flex items-center justify-between gap-4 p-4 rounded-xl bg-background border border-border hover:border-destructive/30 transition-colors">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-orange-500/10 flex items-center justify-center flex-shrink-0">
                <i className="fa-solid fa-calendar-xmark text-orange-500" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Borrar tickets por rango de fechas</p>
                <p className="text-xs text-muted-foreground">Elimina tickets pagados en un período específico</p>
              </div>
            </div>
            <button
              onClick={() => setDangerModal("tickets_range")}
              className="touch-btn flex-shrink-0 px-4 py-2 rounded-xl bg-orange-500/10 text-orange-600 font-semibold text-sm hover:bg-orange-500/20 transition-colors"
            >
              <i className="fa-solid fa-trash-can mr-2" />Borrar
            </button>
          </div>

          {/* Delete all tickets */}
          <div className="flex items-center justify-between gap-4 p-4 rounded-xl bg-background border border-border hover:border-destructive/30 transition-colors">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-destructive/10 flex items-center justify-center flex-shrink-0">
                <i className="fa-solid fa-file-circle-xmark text-destructive" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Borrar todos los tickets / reportes</p>
                <p className="text-xs text-muted-foreground">Elimina permanentemente todo el historial de ventas</p>
              </div>
            </div>
            <button
              onClick={() => setDangerModal("tickets")}
              className="touch-btn flex-shrink-0 px-4 py-2 rounded-xl bg-destructive/10 text-destructive font-semibold text-sm hover:bg-destructive/20 transition-colors"
            >
              <i className="fa-solid fa-trash-can mr-2" />Borrar
            </button>
          </div>

          {/* Delete inactive customers */}
          <div className="flex items-center justify-between gap-4 p-4 rounded-xl bg-background border border-border hover:border-destructive/30 transition-colors">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-destructive/10 flex items-center justify-center flex-shrink-0">
                <i className="fa-solid fa-user-slash text-destructive" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Borrar clientes sin actividad</p>
                <p className="text-xs text-muted-foreground">Elimina clientes que no tienen ningún ticket registrado</p>
              </div>
            </div>
            <button
              onClick={() => setDangerModal("customers_inactive")}
              className="touch-btn flex-shrink-0 px-4 py-2 rounded-xl bg-destructive/10 text-destructive font-semibold text-sm hover:bg-destructive/20 transition-colors"
            >
              <i className="fa-solid fa-trash-can mr-2" />Borrar
            </button>
          </div>

          {/* Delete cash closures */}
          <div className="flex items-center justify-between gap-4 p-4 rounded-xl bg-background border border-border hover:border-destructive/30 transition-colors">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-destructive/10 flex items-center justify-center flex-shrink-0">
                <i className="fa-solid fa-vault text-destructive" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Borrar cierres de caja</p>
                <p className="text-xs text-muted-foreground">Elimina todo el historial de cierres de turno</p>
              </div>
            </div>
            <button
              onClick={() => setDangerModal("cash_closures")}
              className="touch-btn flex-shrink-0 px-4 py-2 rounded-xl bg-destructive/10 text-destructive font-semibold text-sm hover:bg-destructive/20 transition-colors"
            >
              <i className="fa-solid fa-trash-can mr-2" />Borrar
            </button>
          </div>

          {/* Delete ALL data */}
          <div className="flex items-center justify-between gap-4 p-4 rounded-xl bg-destructive/5 border-2 border-destructive/40 hover:border-destructive/60 transition-colors">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-destructive/20 flex items-center justify-center flex-shrink-0">
                <i className="fa-solid fa-bomb text-destructive" />
              </div>
              <div>
                <p className="text-sm font-bold text-destructive">Borrar TODOS los datos</p>
                <p className="text-xs text-muted-foreground">Tickets, clientes y cierres de caja. Acción nuclear.</p>
              </div>
            </div>
            <button
              onClick={() => setDangerModal("all_data")}
              className="touch-btn flex-shrink-0 px-4 py-2 rounded-xl bg-destructive text-white font-bold text-sm hover:bg-red-600 transition-colors"
            >
              <i className="fa-solid fa-bomb mr-2" />Borrar todo
            </button>
          </div>
        </div>
      </div>

      {/* ── Toast ── */}
      {toast && (
        <div className={toast.type === "error" ? "toast-error" : "toast-success"}>
          <i className={`fa-solid ${toast.type === "error" ? "fa-circle-exclamation" : "fa-circle-check"} mr-2`} />
          {toast.msg}
        </div>
      )}

      {/* ── Danger Modals ── */}
      {dangerModal === "tickets" && (
        <DangerModal
          title="Borrar todos los tickets"
          description="Esta acción eliminará permanentemente TODOS los tickets pagados y su historial de ventas. Los datos no se pueden recuperar."
          confirmLabel="Borrar todos los tickets"
          confirmWord="ELIMINAR"
          onConfirm={deleteAllTickets}
          onClose={() => setDangerModal(null)}
        />
      )}

      {dangerModal === "tickets_range" && (
        <DangerModal
          title="Borrar tickets por rango"
          description="Elimina todos los tickets pagados dentro del rango de fechas seleccionado. Esta acción no se puede deshacer."
          confirmLabel="Borrar tickets del rango"
          confirmWord="BORRAR"
          onConfirm={deleteTicketsByRange}
          onClose={() => setDangerModal(null)}
        >
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-foreground mb-1 block">Desde</label>
              <input type="date" value={rangeFrom} onChange={(e) => setRangeFrom(e.target.value)} className="input-touch" />
            </div>
            <div>
              <label className="text-xs font-semibold text-foreground mb-1 block">Hasta</label>
              <input type="date" value={rangeTo} onChange={(e) => setRangeTo(e.target.value)} className="input-touch" />
            </div>
          </div>
        </DangerModal>
      )}

      {dangerModal === "customers_inactive" && (
        <DangerModal
          title="Borrar clientes sin actividad"
          description="Elimina todos los clientes que no tienen ningún ticket registrado en el sistema. Los clientes con historial de compras no serán afectados."
          confirmLabel="Borrar clientes inactivos"
          confirmWord="ELIMINAR"
          onConfirm={deleteInactiveCustomers}
          onClose={() => setDangerModal(null)}
        />
      )}

      {dangerModal === "cash_closures" && (
        <DangerModal
          title="Borrar cierres de caja"
          description="Elimina permanentemente todo el historial de cierres de turno. Los tickets y clientes no serán afectados."
          confirmLabel="Borrar cierres de caja"
          confirmWord="ELIMINAR"
          onConfirm={deleteAllCashClosures}
          onClose={() => setDangerModal(null)}
        />
      )}

      {dangerModal === "all_data" && (
        <DangerModal
          title="⚠️ Borrar TODOS los datos"
          description="Esta acción eliminará PERMANENTEMENTE todos los tickets, clientes (excepto el general) y cierres de caja. El sistema quedará como nuevo. Esta acción es IRREVERSIBLE."
          confirmLabel="Borrar absolutamente todo"
          confirmWord="BORRAR TODO"
          onConfirm={deleteAllData}
          onClose={() => setDangerModal(null)}
        />
      )}
    </div>
  );
}
