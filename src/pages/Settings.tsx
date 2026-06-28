import { useState, useEffect } from "react";
import { useBusinessSettings, useUpdateBusinessSettings } from "@/hooks/useBusinessSettings";
import { BUSINESS_LINE_LABELS, type BusinessLine } from "@/lib/businessLine";
import { useBusinessLine } from "@/contexts/BusinessLineContext";
import { useAuth } from "@/hooks/useAuth";
import { niFormatDate } from "@/utils/niDate";
import { FULL_DATABASE_SCHEMA } from "@/utils/backupSchema";
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

// ─── Helpers ────────────────────────────────────────────────────────────────
type UserProfile = {
  id: string;
  full_name: string | null;
  role: string | null;
  active: boolean;
  created_at: string;
  module_overrides?: Record<string, boolean>;
};

const ROLE_LABELS: Record<string, string> = {
  admin:    "Administrador",
  owner:    "Propietario",
  cajero:   "Cajero",
  operator: "Operador",
  manager:  "Gerente",
};

const ROLE_COLORS: Record<string, string> = {
  admin:    "bg-primary/10 text-primary border-primary/20",
  owner:    "bg-accent/10 text-accent border-accent/20",
  cajero:   "bg-secondary/10 text-secondary border-secondary/20",
  operator: "bg-secondary/10 text-secondary border-secondary/20",
  manager:  "bg-secondary/10 text-secondary border-secondary/20",
};

function getModuleAccess(role: string | null) {
  const r = role ?? "";
  const isAdmin = r === "admin";
  const isOwner = r === "owner";
  const isCajero = ["cajero", "operator", "manager"].includes(r);
  return [
    { key: "pos",         label: "POS",           icon: "fa-cash-register",  access: true },
    { key: "dashboard",   label: "Dashboard",     icon: "fa-chart-pie",      access: isAdmin || isOwner || isCajero },
    { key: "reports",     label: "Reportes",      icon: "fa-file-lines",     access: isAdmin || isOwner },
    { key: "cashclose",   label: "Cierre Caja",   icon: "fa-vault",          access: true },
    { key: "customers",   label: "Clientes",      icon: "fa-users",          access: true },
    { key: "memberships", label: "Membresías",    icon: "fa-id-card",        access: true },
    { key: "reminders",   label: "Recordatorios", icon: "fa-bell",           access: true },
    { key: "inventory",   label: "Inventario",    icon: "fa-boxes-stacked",  access: isAdmin || isOwner },
    { key: "services",    label: "Servicios",     icon: "fa-list-check",     access: isAdmin },
    { key: "settings",    label: "Configuración", icon: "fa-gear",           access: isAdmin },
  ];
}

// ─── Main Settings Page ─────────────────────────────────────────────────────
export default function Settings() {
  const { carWashVisible, barbershopVisible, updateVisibilities } = useBusinessLine();
  const { user: currentUser } = useAuth();
  const [editLine, setEditLine] = useState<BusinessLine>("car_wash");
  const { data: settings, isLoading } = useBusinessSettings(editLine);
  const updateSettings = useUpdateBusinessSettings(editLine);
  const [form, setForm] = useState<any>(null);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadingQr, setUploadingQr] = useState(false);

  // User management state
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editRole, setEditRole] = useState("");
  const [editOverrides, setEditOverrides] = useState<Record<string, boolean>>({});
  const [savingRole, setSavingRole] = useState(false);

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

  // ── User management ──────────────────────────────────────────────────────
  const loadUsers = async () => {
    setLoadingUsers(true);
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, role, active, created_at, module_overrides")
      .order("created_at", { ascending: true });
    if (data) setUsers(data as any as UserProfile[]);
    setLoadingUsers(false);
  };

  useEffect(() => { loadUsers(); }, []);

  const startEditUser = (u: UserProfile) => {
    setEditingUserId(u.id);
    setEditRole(u.role ?? "cajero");
    setEditOverrides(u.module_overrides ?? {});
  };

  const cancelEdit = () => { setEditingUserId(null); setEditRole(""); setEditOverrides({}); };

  const toggleOverride = (key: string, defaultAccess: boolean) => {
    setEditOverrides(prev => {
      const next = { ...prev };
      if (next[key] === undefined) {
        // First click: lock to the OPPOSITE of default
        next[key] = !defaultAccess;
      } else if (next[key] !== defaultAccess) {
        // Second click: restore to default (remove key)
        delete next[key];
      } else {
        // edge: same as default, remove
        delete next[key];
      }
      return next;
    });
  };

  const handleUpdateRole = async (userId: string) => {
    setSavingRole(true);
    const { error } = await supabase
      .from("profiles")
      .update({ role: editRole, module_overrides: editOverrides, updated_at: new Date().toISOString() } as any)
      .eq("id", userId);
    setSavingRole(false);
    if (error) { showToast("Error al actualizar el usuario", "error"); return; }
    showToast("Usuario actualizado correctamente");
    cancelEdit();
    loadUsers();
  };

  const handleToggleActive = async (u: UserProfile) => {
    if (u.id === currentUser?.id) { showToast("No puedes desactivar tu propia cuenta", "error"); return; }
    const { error } = await supabase
      .from("profiles")
      .update({ active: !u.active, updated_at: new Date().toISOString() })
      .eq("id", u.id);
    if (error) { showToast("Error al cambiar estado", "error"); return; }
    showToast(`Usuario ${!u.active ? "activado" : "desactivado"}`);
    loadUsers();
  };

  if (isLoading) return <div className="flex items-center justify-center h-full"><i className="fa-solid fa-spinner fa-spin text-3xl text-accent" /></div>;

  useEffect(() => {
    if (!settings) return;
    setForm({
      business_name: settings.business_name,
      address: settings.address || "",
      phone: settings.phone || "",
      ruc: settings.ruc || "",
      social_media: settings.social_media || "",
      receipt_footer: settings.receipt_footer || "",
      logo_url: settings.logo_url || "",
      printer_width_mm: String(settings.printer_width_mm || 80),
      exchange_rate: String(settings.exchange_rate),
      double_print_ticket: settings.double_print_ticket ?? true,
      qr_image_url: settings.qr_image_url || "",
      qr_text: settings.qr_text || "Tu opinión es importante para nosotros",
      whatsapp_feedback_enabled: (settings as Record<string, unknown>).whatsapp_feedback_enabled ?? true,
      whatsapp_feedback_text: (settings as Record<string, unknown>).whatsapp_feedback_text || "Tu opinión es importante para nosotros",
      whatsapp_feedback_link: (settings as Record<string, unknown>).whatsapp_feedback_link || "https://forms.gle/ZLqzSWJPxrK1Wsum7",
      whatsapp_greeting: (settings as Record<string, unknown>).whatsapp_greeting || "¡Gracias por su visita!",
      whatsapp_link_label: (settings as Record<string, unknown>).whatsapp_link_label || "Dejanos tu recomendación aquí:",
      show_expected_cash_to_cashier: (settings as Record<string, unknown>).show_expected_cash_to_cashier ?? true,
    });
  }, [settings, editLine]);

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

  const handleQrUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { showToast("Por favor selecciona una imagen válida", "error"); return; }
    if (file.size > 2 * 1024 * 1024) { showToast("La imagen debe ser menor a 2MB", "error"); return; }

    setUploadingQr(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `qr-${Date.now()}.${fileExt}`;
      const filePath = `qr/${fileName}`;
      const { error: uploadError } = await supabase.storage.from('business-assets').upload(filePath, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from('business-assets').getPublicUrl(filePath);
      setForm({ ...form, qr_image_url: publicUrl });
      showToast("QR subido exitosamente");
    } catch (error) {
      showToast("Error al subir el QR", "error");
    } finally {
      setUploadingQr(false);
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
      double_print_ticket: form.double_print_ticket,
      qr_image_url: form.qr_image_url || null,
      qr_text: form.qr_text || null,
      whatsapp_feedback_enabled: form.whatsapp_feedback_enabled,
      whatsapp_feedback_text: form.whatsapp_feedback_text || "",
      whatsapp_feedback_link: form.whatsapp_feedback_link || "",
      whatsapp_greeting: form.whatsapp_greeting || "",
      whatsapp_link_label: form.whatsapp_link_label || "",
      show_expected_cash_to_cashier: form.show_expected_cash_to_cashier,
    });

    // show_expected_cash_to_cashier is a global role policy — sync to the other business line too
    const otherLine = editLine === "car_wash" ? "barbershop" : "car_wash";
    await supabase
      .from("business_settings")
      .update({ show_expected_cash_to_cashier: form.show_expected_cash_to_cashier } as any)
      .eq("business_line", otherLine);

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

  const exportFullDatabaseSQL = async () => {
    showToast("Generando respaldo SQL...", "success");
    try {
      const tables = [
        "business_settings",
        "services",
        "vehicle_types",
        "service_prices",
        "products",
        "stock_movements",
        "customers",
        "tickets",
        "ticket_items",
        "payments",
        "cash_closures",
        "cash_expenses",
        "membership_plans",
        "customer_memberships",
        "membership_washes"
      ];

      let sqlDump = `-- BACKUP COMPLETO AUTOLAVADO EL RAPIDO\n`;
      sqlDump += `-- Generado: ${new Date().toLocaleString()}\n`;
      sqlDump += `-- Este archivo contiene la ESTRUCTURA y los DATOS\n\n`;
      
      sqlDump += FULL_DATABASE_SCHEMA;
      sqlDump += `\n\n-- ── COMIENZO DE DATOS ──\n\n`;
      sqlDump += `SET statement_timeout = 0;\nSET client_encoding = 'UTF8';\n\n`;

      for (const table of tables) {
        const { data, error } = await supabase.from(table as any).select("*");
        if (error) {
          console.error(`Error exportando ${table}:`, error);
          continue;
        }

        if (data && data.length > 0) {
          sqlDump += `-- Datos para la tabla: ${table}\n`;
          const columns = Object.keys(data[0]);
          
          for (const row of data) {
            const values = columns.map(col => {
              const val = row[col];
              if (val === null) return "NULL";
              if (typeof val === "string") return `'${val.replace(/'/g, "''")}'`;
              if (typeof val === "object") return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
              return val;
            });
            sqlDump += `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${values.join(", ")});\n`;
          }
          sqlDump += `\n`;
        }
      }

      const blob = new Blob([sqlDump], { type: "text/plain;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `backup_elrapido_${new Date().toISOString().split('T')[0]}.sql`;
      a.click();
      URL.revokeObjectURL(url);
      showToast("Respaldo SQL descargado");
    } catch (err) {
      showToast("Error al generar el SQL", "error");
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

      <div className="flex gap-2 p-1 bg-muted/30 rounded-xl w-fit">
        {(["car_wash", "barbershop"] as BusinessLine[]).map((line) => (
          <button
            key={line}
            type="button"
            onClick={() => setEditLine(line)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold ${
              editLine === line ? "bg-background shadow-sm" : "text-muted-foreground"
            }`}
          >
            {BUSINESS_LINE_LABELS[line]}
          </button>
        ))}
      </div>

      {/* ── Módulos Activos (Visual) ── */}
      <div className="pos-card p-6 space-y-4">
        <h3 className="font-bold text-foreground">
          <i className="fa-solid fa-square-check mr-2 text-secondary" />
          Módulos Activos (Visual)
        </h3>
        <p className="text-xs text-muted-foreground">
          Activa o desactiva la visibilidad de los módulos. Los cambios se sincronizarán con los demás usuarios del sistema. Al menos un módulo debe estar activo.
        </p>
        <div className="space-y-4">
          <div className="flex items-center justify-between p-3 rounded-xl bg-muted/20 border border-border">
            <div>
              <p className="text-sm font-semibold text-foreground">Módulo de Autolavado</p>
              <p className="text-xs text-muted-foreground">Mostrar/ocultar las funciones de autolavado</p>
            </div>
            <button
              type="button"
              onClick={() => {
                if (carWashVisible && !barbershopVisible) {
                  showToast("Debe haber al menos un módulo activo", "error");
                  return;
                }
                const newVal = !carWashVisible;
                updateVisibilities(newVal, barbershopVisible);
                showToast(`Módulo de Autolavado ${newVal ? 'activado' : 'desactivado'}`);
              }}
              className={`w-12 h-6 rounded-full transition-colors relative ${carWashVisible ? 'bg-accent' : 'bg-muted'}`}
            >
              <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${carWashVisible ? 'translate-x-6' : ''}`} />
            </button>
          </div>

          <div className="flex items-center justify-between p-3 rounded-xl bg-muted/20 border border-border">
            <div>
              <p className="text-sm font-semibold text-foreground">Módulo de Barbería</p>
              <p className="text-xs text-muted-foreground">Mostrar/ocultar las funciones de barbería</p>
            </div>
            <button
              type="button"
              onClick={() => {
                if (barbershopVisible && !carWashVisible) {
                  showToast("Debe haber al menos un módulo activo", "error");
                  return;
                }
                const newVal = !barbershopVisible;
                updateVisibilities(carWashVisible, newVal);
                showToast(`Módulo de Barbería ${newVal ? 'activado' : 'desactivado'}`);
              }}
              className={`w-12 h-6 rounded-full transition-colors relative ${barbershopVisible ? 'bg-accent' : 'bg-muted'}`}
            >
              <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${barbershopVisible ? 'translate-x-6' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Gestión de Usuarios ── */}
      <div className="pos-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-foreground">
            <i className="fa-solid fa-users-gear mr-2 text-secondary" />Gestión de Usuarios
          </h3>
          <button
            type="button"
            onClick={loadUsers}
            disabled={loadingUsers}
            className="touch-btn text-xs px-3 py-1.5 rounded-lg bg-muted/40 text-foreground hover:bg-muted/70 flex items-center gap-1.5"
          >
            <i className={`fa-solid fa-rotate ${loadingUsers ? "fa-spin" : ""}`} />
            Actualizar
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          Visualiza y administra los permisos de todos los usuarios del sistema. Cambia el rol para controlar a qué módulos tiene acceso cada usuario.
        </p>

        {loadingUsers ? (
          <div className="flex justify-center py-8">
            <i className="fa-solid fa-spinner fa-spin text-2xl text-secondary" />
          </div>
        ) : users.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No se encontraron usuarios.</p>
        ) : (
          <div className="space-y-3">
            {users.map((u) => {
              const isEditing = editingUserId === u.id;
              const isCurrentUser = u.id === currentUser?.id;
              const modules = getModuleAccess(isEditing ? editRole : u.role);
              const roleBadge = ROLE_LABELS[u.role ?? ""] ?? u.role ?? "Sin rol";
              const roleColor = ROLE_COLORS[u.role ?? ""] ?? "bg-muted text-muted-foreground border-muted";

              return (
                <div
                  key={u.id}
                  className={`rounded-xl border p-4 space-y-3 transition-colors ${
                    isEditing ? "border-primary/30 bg-primary/5" : "border-border bg-background"
                  } ${!u.active ? "opacity-60" : ""}`}
                >
                  {/* Header row */}
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-full bg-accent/10 flex items-center justify-center flex-shrink-0">
                      <i className="fa-solid fa-user text-accent text-sm" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-sm text-foreground truncate">
                          {u.full_name || "Sin nombre"}
                        </p>
                        {isCurrentUser && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-accent text-accent-foreground">TÚ</span>
                        )}
                        {!u.active && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-destructive/20 text-destructive">INACTIVO</span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Creado {niFormatDate(u.created_at)}
                      </p>
                    </div>

                    {/* Role badge / selector */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {isEditing ? (
                        <select
                          value={editRole}
                          onChange={(e) => setEditRole(e.target.value)}
                          className="text-xs px-2 py-1.5 rounded-lg border border-border bg-background text-foreground"
                          autoFocus
                        >
                          <option value="admin">Administrador</option>
                          <option value="owner">Propietario</option>
                          <option value="cajero">Cajero</option>
                          <option value="operator">Operador</option>
                          <option value="manager">Gerente</option>
                        </select>
                      ) : (
                        <span className={`text-xs font-semibold px-2 py-1 rounded-lg border ${roleColor}`}>
                          {roleBadge}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Module access — interactive toggles in edit mode */}
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5">
                      {isEditing ? "Editar acceso a módulos" : "Acceso a módulos"}
                    </p>
                    {isEditing && (
                      <p className="text-[10px] text-muted-foreground mb-2 leading-relaxed">
                        Haz clic para forzar acceso (✅) o bloquearlo (❌). Sin marcar = comportamiento por defecto del rol.
                      </p>
                    )}
                    <div className="flex flex-wrap gap-1.5">
                      {modules.map((m) => {
                        const overrideVal = isEditing ? editOverrides[m.key] : (u.module_overrides ?? {})[m.key];
                        const hasOverride = overrideVal !== undefined;
                        const effectiveAccess = hasOverride ? overrideVal : m.access;

                        if (isEditing) {
                          // Three-state cycle: default → force-deny → force-grant → default
                          const label = hasOverride
                            ? overrideVal ? "✅ Forzado" : "❌ Bloqueado"
                            : m.access ? "Acceso" : "Sin acceso";
                          const cls = hasOverride
                            ? overrideVal
                              ? "bg-emerald-100 text-emerald-700 border-emerald-400 ring-1 ring-emerald-300"
                              : "bg-red-100 text-red-700 border-red-400 ring-1 ring-red-300"
                            : m.access
                              ? "bg-green-50 text-green-700 border-green-200"
                              : "bg-muted/50 text-muted-foreground/50 border-transparent line-through";
                          return (
                            <button
                              key={m.key}
                              type="button"
                              onClick={() => toggleOverride(m.key, m.access)}
                              title={`Clic para cambiar acceso a ${m.label}`}
                              className={`inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg font-medium border transition-all hover:scale-105 active:scale-95 ${cls}`}
                            >
                              <i className={`fa-solid ${m.icon} text-[10px]`} />
                              {m.label}
                              {hasOverride && <span className="text-[9px] ml-0.5">{overrideVal ? "★" : "✕"}</span>}
                            </button>
                          );
                        }

                        // View mode
                        return (
                          <span
                            key={m.key}
                            title={`${m.label}: ${effectiveAccess ? "acceso permitido" : "sin acceso"}${hasOverride ? " (personalizado)" : ""}`}
                            className={`inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg font-medium transition-all ${
                              effectiveAccess
                                ? hasOverride
                                  ? "bg-emerald-100 text-emerald-700 border border-emerald-300"
                                  : "bg-green-100 text-green-700 border border-green-200"
                                : "bg-muted/50 text-muted-foreground/50 border border-transparent line-through"
                            }`}
                          >
                            <i className={`fa-solid ${m.icon} text-[10px]`} />
                            {m.label}
                            {hasOverride && <i className="fa-solid fa-star text-[8px] ml-0.5" />}
                          </span>
                        );
                      })}
                    </div>
                    {isEditing && Object.keys(editOverrides).length > 0 && (
                      <button
                        type="button"
                        onClick={() => setEditOverrides({})}
                        className="mt-2 text-[10px] text-muted-foreground hover:text-destructive flex items-center gap-1"
                      >
                        <i className="fa-solid fa-rotate-left" /> Restablecer todo a valores del rol
                      </button>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center justify-between pt-1">
                    <button
                      type="button"
                      onClick={() => handleToggleActive(u)}
                      disabled={isCurrentUser}
                      className={`text-xs px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                        u.active
                          ? "border-destructive/30 text-destructive hover:bg-destructive/10"
                          : "border-green-300 text-green-700 hover:bg-green-50"
                      }`}
                    >
                      <i className={`fa-solid ${u.active ? "fa-user-slash" : "fa-user-check"} mr-1.5`} />
                      {u.active ? "Desactivar" : "Activar"}
                    </button>

                    <div className="flex gap-2">
                      {isEditing ? (
                        <>
                          <button
                            type="button"
                            onClick={cancelEdit}
                            className="text-xs px-3 py-1.5 rounded-lg border border-border text-foreground hover:bg-muted/50"
                          >
                            Cancelar
                          </button>
                          <button
                            type="button"
                            onClick={() => handleUpdateRole(u.id)}
                            disabled={savingRole}
                            className="text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground font-semibold hover:opacity-90 disabled:opacity-40 flex items-center gap-1.5"
                          >
                            {savingRole ? <i className="fa-solid fa-spinner fa-spin" /> : <i className="fa-solid fa-check" />}
                            Guardar
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => startEditUser(u)}
                          className="text-xs px-3 py-1.5 rounded-lg border border-border text-foreground hover:bg-muted/50 flex items-center gap-1.5"
                        >
                          <i className="fa-solid fa-pen text-[10px]" />
                          Cambiar rol
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

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
          <div className="flex items-center justify-between p-3 rounded-xl bg-accent/5 border border-accent/10">
            <div className="space-y-0.5">
              <label className="text-sm font-semibold text-foreground block">Imprimir doble ticket</label>
              <p className="text-xs text-muted-foreground">Genera una copia para el negocio y otra para el cliente.</p>
            </div>
            <button
              onClick={() => setForm({ ...form, double_print_ticket: !form.double_print_ticket })}
              className={`w-12 h-6 rounded-full transition-colors relative ${form.double_print_ticket ? 'bg-secondary' : 'bg-muted'}`}
            >
              <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${form.double_print_ticket ? 'translate-x-6' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Código QR del ticket ── */}
      <div className="pos-card p-6 space-y-4">
        <h3 className="font-bold text-foreground"><i className="fa-solid fa-qrcode mr-2 text-secondary" />Código QR del ticket</h3>
        <p className="text-xs text-muted-foreground">Sube una imagen de código QR que aparecerá al final de cada ticket impreso. Ideal para encuestas de satisfacción o redes sociales.</p>
        <div className="space-y-3">
          {form.qr_image_url && (
            <div className="flex flex-col items-center gap-2">
              <img src={form.qr_image_url} alt="QR" className="max-h-32 object-contain rounded-lg border border-border p-2 bg-white" />
              <button
                onClick={() => setForm({ ...form, qr_image_url: "" })}
                className="text-xs text-destructive hover:underline flex items-center gap-1"
              >
                <i className="fa-solid fa-trash-can" />Quitar QR
              </button>
            </div>
          )}
          <div>
            <label className="text-xs font-semibold text-foreground mb-1 block">Subir imagen QR (máx 2MB)</label>
            <input
              type="file" accept="image/*" onChange={handleQrUpload} disabled={uploadingQr}
              className="input-touch file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-accent file:text-accent-foreground hover:file:opacity-90"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-foreground mb-1 block">Texto debajo del QR</label>
            <input value={form.qr_text} onChange={(e) => setForm({ ...form, qr_text: e.target.value })} className="input-touch" placeholder="Tu opinión es importante para nosotros" />
          </div>
        </div>
      </div>

      {/* ── Mensaje de WhatsApp ── */}
      <div className="pos-card p-6 space-y-4">
        <h3 className="font-bold text-foreground"><i className="fa-brands fa-whatsapp mr-2 text-[#25D366]" />Mensaje de WhatsApp</h3>
        <p className="text-xs text-muted-foreground">Personaliza el contenido del mensaje que se envía por WhatsApp al cliente después de cada venta.</p>
        <div className="space-y-3">
          {/* Toggle activar/desactivar sección feedback */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-[#25D366]/5 border border-[#25D366]/10">
            <div className="space-y-0.5">
              <label className="text-sm font-semibold text-foreground block">Incluir sección de opinión</label>
              <p className="text-xs text-muted-foreground">Agrega un enlace de encuesta/recomendación al final del mensaje.</p>
            </div>
            <button
              onClick={() => setForm({ ...form, whatsapp_feedback_enabled: !form.whatsapp_feedback_enabled })}
              className={`w-12 h-6 rounded-full transition-colors relative ${form.whatsapp_feedback_enabled ? 'bg-[#25D366]' : 'bg-muted'}`}
            >
              <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${form.whatsapp_feedback_enabled ? 'translate-x-6' : ''}`} />
            </button>
          </div>

          <div>
            <label className="text-xs font-semibold text-foreground mb-1 block">Mensaje de despedida (WhatsApp)</label>
            <input value={form.whatsapp_greeting} onChange={(e) => setForm({ ...form, whatsapp_greeting: e.target.value })} className="input-touch" placeholder="¡Gracias por su visita!" />
            <p className="text-[10px] text-muted-foreground mt-1">Aparece antes de la sección de opinión. Ej: "¡Gracias por su visita!"</p>
          </div>

          {form.whatsapp_feedback_enabled && (
            <>
              <div>
                <label className="text-xs font-semibold text-foreground mb-1 block">Título de la sección ⭐</label>
                <input value={form.whatsapp_feedback_text} onChange={(e) => setForm({ ...form, whatsapp_feedback_text: e.target.value })} className="input-touch" placeholder="Tu opinión es importante para nosotros" />
                <p className="text-[10px] text-muted-foreground mt-1">Ej: "Tu opinión es importante para nosotros"</p>
              </div>
              <div>
                <label className="text-xs font-semibold text-foreground mb-1 block">Texto antes del enlace 📝</label>
                <input value={form.whatsapp_link_label} onChange={(e) => setForm({ ...form, whatsapp_link_label: e.target.value })} className="input-touch" placeholder="Dejanos tu recomendación aquí:" />
                <p className="text-[10px] text-muted-foreground mt-1">Ej: "Dejanos tu recomendación aquí:"</p>
              </div>
              <div>
                <label className="text-xs font-semibold text-foreground mb-1 block">Enlace (URL) 👉</label>
                <input value={form.whatsapp_feedback_link} onChange={(e) => setForm({ ...form, whatsapp_feedback_link: e.target.value })} className="input-touch" placeholder="https://forms.gle/..." />
                <p className="text-[10px] text-muted-foreground mt-1">Puede ser un formulario de Google, encuesta, etc.</p>
              </div>
            </>
          )}

          {/* Preview */}
          <div className="bg-[#E5DDD5] rounded-xl p-4 border border-[#25D366]/20">
            <p className="text-[10px] text-muted-foreground mb-2 font-semibold"><i className="fa-solid fa-eye mr-1" />Vista previa del final del mensaje:</p>
            <div className="bg-white rounded-lg p-3 shadow-sm text-xs space-y-1 font-mono">
              <p>🙏 <em>{form.whatsapp_greeting || "¡Gracias por su visita!"}</em></p>
              {form.whatsapp_feedback_enabled && (
                <>
                  <p></p>
                  <p>⭐ <strong>{form.whatsapp_feedback_text || "Tu opinión es importante"}</strong> ⭐</p>
                  <p>📝 {form.whatsapp_link_label || "Dejanos tu recomendación aquí:"}</p>
                  <p className="text-blue-600">👉 {form.whatsapp_feedback_link || "https://..."}</p>
                </>
              )}
            </div>
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

      {/* ── Caja / POS ── */}
      <div className="pos-card p-6 space-y-4">
        <h3 className="font-bold text-foreground">
          <i className="fa-solid fa-vault mr-2 text-secondary" />Caja / POS
        </h3>
        <p className="text-xs text-muted-foreground">
          Configura el comportamiento del módulo de cierre de caja según el rol del usuario.
        </p>
        <div className="flex items-center justify-between p-4 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700/40">
          <div className="space-y-1 pr-4">
            <label className="text-sm font-semibold text-foreground block">
              Mostrar montos esperados durante el cierre de caja al cajero
            </label>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Permite decidir si los usuarios con rol <strong>Cajero</strong> pueden visualizar los montos
              que el sistema espera al momento de realizar el cierre de caja.
              Esta opción no afecta a Supervisores ni Administradores, quienes siempre podrán ver toda la información.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setForm({ ...form, show_expected_cash_to_cashier: !form.show_expected_cash_to_cashier })}
            className={`shrink-0 w-12 h-6 rounded-full transition-colors relative ${
              form.show_expected_cash_to_cashier ? 'bg-emerald-500' : 'bg-muted'
            }`}
          >
            <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${
              form.show_expected_cash_to_cashier ? 'translate-x-6' : ''
            }`} />
          </button>
        </div>
        <p className="text-[10px] text-muted-foreground flex items-center gap-1">
          <i className="fa-solid fa-circle-info text-primary" />
          Estado actual: {form.show_expected_cash_to_cashier
            ? <span className="text-emerald-600 font-semibold">Activado — el cajero puede ver los montos esperados</span>
            : <span className="text-amber-600 font-semibold">Desactivado — el cajero solo ingresa su conteo; el sistema compara al finalizar</span>
          }
        </p>
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
          <button
            onClick={exportFullDatabaseSQL}
            className="touch-btn flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-accent/30 text-foreground hover:bg-accent/5 transition-all font-medium sm:col-span-2"
          >
            <div className="w-9 h-9 rounded-lg bg-accent/20 flex items-center justify-center flex-shrink-0">
              <i className="fa-solid fa-database text-accent" />
            </div>
            <div className="text-left">
              <p className="text-sm font-bold">Generar Respaldo Completo (SQL)</p>
              <p className="text-xs text-muted-foreground">Descarga toda la base de datos lista para restaurar</p>
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
