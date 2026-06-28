import { useState, useEffect, useRef, useCallback } from "react";
import { useBusinessSettings, useUpdateBusinessSettings } from "@/hooks/useBusinessSettings";
import { BUSINESS_LINE_LABELS, type BusinessLine } from "@/lib/businessLine";
import { useBusinessLine } from "@/contexts/BusinessLineContext";
import { useAuth } from "@/hooks/useAuth";
import { niFormatDate } from "@/utils/niDate";
import { FULL_DATABASE_SCHEMA } from "@/utils/backupSchema";
import { supabase } from "@/integrations/supabase/client";

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { toast } from "sonner";

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
          <Input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={confirmWord}
            autoFocus
            className="bg-background"
          />
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose} className="flex-1 py-3">
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={typed !== confirmWord || running}
            variant="destructive"
            className="flex-1 py-3"
          >
            {running ? <i className="fa-solid fa-spinner fa-spin" /> : <i className="fa-solid fa-trash-can" />}
            {confirmLabel}
          </Button>
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

// ─── Section nav config ────────────────────────────────────────────────────
const SECTIONS = [
  { id: "modules",       label: "Módulos Activos",     icon: "fa-square-check" },
  { id: "users",         label: "Gestión de Usuarios", icon: "fa-users-gear" },
  { id: "business",      label: "Datos del negocio",   icon: "fa-building" },
  { id: "logo",          label: "Logo",                icon: "fa-image" },
  { id: "ticket",        label: "Ticket",              icon: "fa-receipt" },
  { id: "qr",            label: "Código QR",           icon: "fa-qrcode" },
  { id: "whatsapp",      label: "WhatsApp",            icon: "fa-brands fa-whatsapp" },
  { id: "exchange",      label: "Tasa de cambio",      icon: "fa-coins" },
  { id: "cashpos",       label: "Caja / POS",          icon: "fa-vault" },
  { id: "export",        label: "Exportar datos",      icon: "fa-file-arrow-down" },
  { id: "danger",        label: "Zona de peligro",     icon: "fa-skull-crossbones" },
] as const;

// ─── Main Settings Page ─────────────────────────────────────────────────────
export default function Settings() {
  const { carWashVisible, barbershopVisible, updateVisibilities } = useBusinessLine();
  const { user: currentUser } = useAuth();
  const [editLine, setEditLine] = useState<BusinessLine>("car_wash");
  const { data: settings, isLoading } = useBusinessSettings(editLine);
  const updateSettings = useUpdateBusinessSettings(editLine);
  const [form, setForm] = useState<any>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadingQr, setUploadingQr] = useState(false);

  // User management state
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editRole, setEditRole] = useState("");
  const [editOverrides, setEditOverrides] = useState<Record<string, boolean>>({});
  const [savingRole, setSavingRole] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deactivateDialogOpen, setDeactivateDialogOpen] = useState(false);
  const [deactivateTarget, setDeactivateTarget] = useState<UserProfile | null>(null);

  // Danger zone state
  const [dangerModal, setDangerModal] = useState<null | "tickets" | "tickets_range" | "customers_inactive" | "cash_closures" | "all_data">(null);
  const [rangeFrom, setRangeFrom] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 1); return d.toISOString().split("T")[0];
  });
  const [rangeTo, setRangeTo] = useState(() => new Date().toISOString().split("T")[0]);
  const [stats, setStats] = useState<{ tickets: number; customers: number; closures: number } | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);

  // ── Section nav scroll tracking ──
  const [activeSection, setActiveSection] = useState("");
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  useEffect(() => {
    const observers: IntersectionObserver[] = [];
    const handleIntersect = (entries: IntersectionObserverEntry[]) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          setActiveSection(entry.target.id);
        }
      }
    };
    for (const { id } of SECTIONS) {
      const el = sectionRefs.current[id];
      if (el) {
        const obs = new IntersectionObserver(handleIntersect, { rootMargin: "-80px 0px -60% 0px" });
        obs.observe(el);
        observers.push(obs);
      }
    }
    return () => observers.forEach((o) => o.disconnect());
  }, [isLoading]);

  const scrollToSection = (id: string) => {
    const el = sectionRefs.current[id];
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
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
    setEditDialogOpen(true);
  };

  const cancelEdit = () => { setEditingUserId(null); setEditRole(""); setEditOverrides({}); setEditDialogOpen(false); };

  const toggleOverride = (key: string, defaultAccess: boolean) => {
    setEditOverrides(prev => {
      const next = { ...prev };
      if (next[key] === undefined) {
        next[key] = !defaultAccess;
      } else if (next[key] !== defaultAccess) {
        delete next[key];
      } else {
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
    if (error) { toast.error("Error al actualizar el usuario"); return; }
    toast.success("Usuario actualizado correctamente");
    cancelEdit();
    loadUsers();
  };

  const handleToggleActive = async () => {
    if (!deactivateTarget) return;
    if (deactivateTarget.id === currentUser?.id) { toast.error("No puedes desactivar tu propia cuenta"); return; }
    const { error } = await supabase
      .from("profiles")
      .update({ active: !deactivateTarget.active, updated_at: new Date().toISOString() })
      .eq("id", deactivateTarget.id);
    setDeactivateDialogOpen(false);
    setDeactivateTarget(null);
    if (error) { toast.error("Error al cambiar estado"); return; }
    toast.success(`Usuario ${!deactivateTarget.active ? "activado" : "desactivado"}`);
    loadUsers();
  };

  const openDeactivateDialog = (u: UserProfile) => {
    setDeactivateTarget(u);
    setDeactivateDialogOpen(true);
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
    if (!file.type.startsWith('image/')) { toast.error("Por favor selecciona una imagen válida"); return; }
    if (file.size > 2 * 1024 * 1024) { toast.error("La imagen debe ser menor a 2MB"); return; }

    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `logo-${Date.now()}.${fileExt}`;
      const filePath = `logos/${fileName}`;
      const { error: uploadError } = await supabase.storage.from('business-assets').upload(filePath, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from('business-assets').getPublicUrl(filePath);
      setForm({ ...form, logo_url: publicUrl });
      toast.success("Logo subido exitosamente");
    } catch (error) {
      toast.error("Error al subir el logo");
    } finally {
      setUploading(false);
    }
  };

  const handleQrUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error("Por favor selecciona una imagen válida"); return; }
    if (file.size > 2 * 1024 * 1024) { toast.error("La imagen debe ser menor a 2MB"); return; }

    setUploadingQr(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `qr-${Date.now()}.${fileExt}`;
      const filePath = `qr/${fileName}`;
      const { error: uploadError } = await supabase.storage.from('business-assets').upload(filePath, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from('business-assets').getPublicUrl(filePath);
      setForm({ ...form, qr_image_url: publicUrl });
      toast.success("QR subido exitosamente");
    } catch (error) {
      toast.error("Error al subir el QR");
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

    const otherLine = editLine === "car_wash" ? "barbershop" : "car_wash";
    await supabase
      .from("business_settings")
      .update({ show_expected_cash_to_cashier: form.show_expected_cash_to_cashier } as any)
      .eq("business_line", otherLine);

    toast.success("Configuración guardada");
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

      if (!data?.length) { toast.error("No hay tickets para exportar"); return; }

      const headers = ["#Ticket", "Fecha", "Placa", "Total C$", "Estado"];
      const rows = data.map((t: any) => [
        t.ticket_number,
        new Date(t.created_at).toLocaleString("es-NI"),
        t.vehicle_plate || "",
        Number(t.total).toFixed(2),
        t.status,
      ]);
      downloadCSV("tickets_export.csv", [headers, ...rows]);
      toast.success(`${data.length} tickets exportados`);
    } else {
      const { data } = await supabase
        .from("customers")
        .select("name, phone, plate, email, loyalty_visits, loyalty_free_washes_earned, loyalty_free_washes_used, created_at")
        .eq("is_general", false)
        .order("name");

      if (!data?.length) { toast.error("No hay clientes para exportar"); return; }

      const headers = ["Nombre", "Teléfono", "Placa", "Correo", "Visitas", "Lavados Gratis Ganados", "Lavados Gratis Usados", "Registrado"];
      const rows = data.map((c: any) => [
        c.name, c.phone || "", c.plate || "", c.email || "",
        c.loyalty_visits || 0,
        c.loyalty_free_washes_earned || 0,
        c.loyalty_free_washes_used || 0,
        new Date(c.created_at).toLocaleDateString("es-NI"),
      ]);
      downloadCSV("clientes_export.csv", [headers, ...rows]);
      toast.success(`${data.length} clientes exportados`);
    }
  };

  const exportFullDatabaseSQL = async () => {
    toast.success("Generando respaldo SQL...");
    try {
      const tables = [
        "business_settings", "services", "vehicle_types", "service_prices",
        "products", "stock_movements", "customers", "tickets", "ticket_items",
        "payments", "cash_closures", "cash_expenses", "membership_plans",
        "customer_memberships", "membership_washes"
      ];

      let sqlDump = `-- BACKUP COMPLETO AUTOLAVADO EL RAPIDO\n`;
      sqlDump += `-- Generado: ${new Date().toLocaleString()}\n`;
      sqlDump += `-- Este archivo contiene la ESTRUCTURA y los DATOS\n\n`;      
      sqlDump += FULL_DATABASE_SCHEMA;
      sqlDump += `\n\n-- ── COMIENZO DE DATOS ──\n\n`;
      sqlDump += `SET statement_timeout = 0;\nSET client_encoding = 'UTF8';\n\n`;

      for (const table of tables) {
        const { data, error } = await supabase.from(table as any).select("*");
        if (error) { console.error(`Error exportando ${table}:`, error); continue; }
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
      a.href = url; a.download = `backup_elrapido_${new Date().toISOString().split('T')[0]}.sql`;
      a.click(); URL.revokeObjectURL(url);
      toast.success("Respaldo SQL descargado");
    } catch (err) {
      toast.error("Error al generar el SQL");
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
    if (error) { toast.error("Error: " + error.message); return; }
    toast.success("Todos los tickets eliminados correctamente");
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
    if (error) { toast.error("Error: " + error.message); return; }
    toast.success(`${count || 0} tickets eliminados del rango seleccionado`);
    loadStats();
  };

  const deleteInactiveCustomers = async () => {
    const { data: withTickets } = await supabase
      .from("tickets")
      .select("customer_id")
      .not("customer_id", "is", null);
    const activeIds = [...new Set((withTickets || []).map((t: any) => t.customer_id))];
    let query = supabase.from("customers").delete().eq("is_general", false);
    if (activeIds.length > 0) query = query.not("id", "in", `(${activeIds.join(",")})`);
    const { error, count } = await (query as any);
    if (error) { toast.error("Error: " + error.message); return; }
    toast.success(`${count || 0} clientes sin actividad eliminados`);
    loadStats();
  };

  const deleteAllCashClosures = async () => {
    const { error } = await supabase.from("cash_closures").delete().gte("id", 0);
    if (error) { toast.error("Error: " + error.message); return; }
    toast.success("Todos los cierres de caja eliminados");
    loadStats();
  };

  const deleteAllData = async () => {
    await supabase.from("tickets").delete().eq("status", "paid");
    await supabase.from("customers").delete().eq("is_general", false);
    await supabase.from("cash_closures").delete().gte("id", 0);
    toast.success("Todos los datos han sido eliminados");
    loadStats();
  };

  const setFormField = (field: string, value: any) => setForm({ ...form, [field]: value });

  if (!form) return null;

  return (
    <div className="p-6 animate-fade-in">
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
              <i className="fa-solid fa-gear text-accent" />
            </span>
            Configuración
          </h1>
          <p className="text-sm text-muted-foreground mt-1 ml-[52px]">
            Administra la configuración general del sistema
          </p>
        </div>
      </div>

      {/* ── Business line tabs ── */}
      <div className="mb-6">
        <Tabs value={editLine} onValueChange={(v) => setEditLine(v as BusinessLine)}>
          <TabsList className="h-11">
            {(["car_wash", "barbershop"] as BusinessLine[]).map((line) => (
              <TabsTrigger key={line} value={line} className="text-sm px-5 gap-2">
                <i className={`fa-solid ${line === "car_wash" ? "fa-car" : "fa-scissors"}`} />
                {BUSINESS_LINE_LABELS[line]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      <div className="flex gap-6">
        {/* ── Section navigation sidebar ── */}
        <aside className="hidden lg:block w-56 shrink-0">
          <nav className="sticky top-6 space-y-0.5">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                onClick={() => scrollToSection(s.id)}
                className={`w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center gap-2.5 ${
                  activeSection === s.id
                    ? "bg-accent text-accent-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
              >
                <i className={`fa-solid ${s.icon} w-4 text-center text-xs ${activeSection === s.id ? "opacity-100" : "opacity-60"}`} />
                {s.label}
              </button>
            ))}
          </nav>
        </aside>

        {/* ── Mobile section nav (horizontal scroll) ── */}
        <div className="lg:hidden overflow-x-auto -mx-6 px-6 mb-2 scrollbar-none">
          <div className="flex gap-1 pb-2">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                onClick={() => scrollToSection(s.id)}
                className={`shrink-0 px-3 py-2 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                  activeSection === s.id
                    ? "bg-accent text-accent-foreground"
                    : "bg-muted/50 text-muted-foreground"
                }`}
              >
                <i className={`fa-solid ${s.icon} text-[10px]`} />
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Main content ── */}
        <main className="flex-1 min-w-0 space-y-6">

          {/* ══════ Módulos Activos ══════ */}
          <section id="modules" ref={(el) => { sectionRefs.current["modules"] = el; }} className="scroll-mt-20">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center">
                    <i className="fa-solid fa-square-check text-emerald-600" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Módulos Activos (Visual)</CardTitle>
                    <CardDescription>
                      Activa o desactiva la visibilidad de los módulos. Al menos un módulo debe estar activo.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between p-4 rounded-xl bg-background border border-border hover:border-emerald-200 transition-colors">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-semibold">Módulo de Autolavado</Label>
                    <p className="text-xs text-muted-foreground">Mostrar/ocultar las funciones de autolavado</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-medium ${carWashVisible ? "text-emerald-600" : "text-muted-foreground"}`}>
                      {carWashVisible ? "Activo" : "Inactivo"}
                    </span>
                    <Switch
                      checked={carWashVisible}
                      onCheckedChange={() => {
                        if (carWashVisible && !barbershopVisible) { toast.error("Debe haber al menos un módulo activo"); return; }
                        const newVal = !carWashVisible;
                        updateVisibilities(newVal, barbershopVisible);
                        toast.success(`Módulo de Autolavado ${newVal ? "activado" : "desactivado"}`);
                      }}
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between p-4 rounded-xl bg-background border border-border hover:border-emerald-200 transition-colors">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-semibold">Módulo de Barbería</Label>
                    <p className="text-xs text-muted-foreground">Mostrar/ocultar las funciones de barbería</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-medium ${barbershopVisible ? "text-emerald-600" : "text-muted-foreground"}`}>
                      {barbershopVisible ? "Activo" : "Inactivo"}
                    </span>
                    <Switch
                      checked={barbershopVisible}
                      onCheckedChange={() => {
                        if (barbershopVisible && !carWashVisible) { toast.error("Debe haber al menos un módulo activo"); return; }
                        const newVal = !barbershopVisible;
                        updateVisibilities(carWashVisible, newVal);
                        toast.success(`Módulo de Barbería ${newVal ? "activado" : "desactivado"}`);
                      }}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* ══════ Gestión de Usuarios ══════ */}
          <section id="users" ref={(el) => { sectionRefs.current["users"] = el; }} className="scroll-mt-20">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center">
                      <i className="fa-solid fa-users-gear text-blue-600" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">Gestión de Usuarios</CardTitle>
                      <CardDescription>
                        Visualiza y administra los permisos de todos los usuarios del sistema.
                      </CardDescription>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" onClick={loadUsers} disabled={loadingUsers} className="gap-1.5">
                    <i className={`fa-solid fa-rotate ${loadingUsers ? "fa-spin" : ""}`} />
                    Actualizar
                  </Button>
                </div>
              </CardHeader>

              {/* Stats bar */}
              {users.length > 0 && (
                <div className="mx-6 mb-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: "Total", value: users.length, color: "text-accent", bg: "bg-accent/10" },
                    { label: "Administradores", value: users.filter((u) => u.role === "admin" && u.active).length, color: "text-primary", bg: "bg-primary/10" },
                    { label: "Cajeros/Operadores", value: users.filter((u) => (u.role === "cajero" || u.role === "operator") && u.active).length, color: "text-emerald-600", bg: "bg-emerald-50" },
                    { label: "Inactivos", value: users.filter((u) => !u.active).length, color: "text-destructive", bg: "bg-destructive/10" },
                  ].map(({ label, value, color, bg }) => (
                    <div key={label} className={`${bg} rounded-xl px-4 py-3 text-center`}>
                      <p className={`text-2xl font-bold ${color}`}>{value}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{label}</p>
                    </div>
                  ))}
                </div>
              )}

              <CardContent>
                {/* Search */}
                {users.length > 1 && (
                  <div className="relative mb-4">
                    <i className="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm" />
                    <Input
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Buscar usuarios por nombre..."
                      className="pl-9 h-10"
                    />
                    {searchTerm && (
                      <button
                        onClick={() => setSearchTerm("")}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-sm"
                      >
                        <i className="fa-solid fa-xmark" />
                      </button>
                    )}
                  </div>
                )}

                {loadingUsers ? (
                  <div className="flex justify-center py-12">
                    <div className="flex flex-col items-center gap-3">
                      <i className="fa-solid fa-spinner fa-spin text-3xl text-blue-500" />
                      <p className="text-sm text-muted-foreground">Cargando usuarios...</p>
                    </div>
                  </div>
                ) : users.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="w-16 h-16 rounded-full bg-muted/30 flex items-center justify-center mb-3">
                      <i className="fa-solid fa-users-slash text-2xl text-muted-foreground/40" />
                    </div>
                    <p className="text-sm font-medium text-foreground">No se encontraron usuarios</p>
                    <p className="text-xs text-muted-foreground mt-1">Los usuarios aparecerán aquí cuando se registren en el sistema.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {(() => {
                      const filtered = searchTerm
                        ? users.filter((u) => u.full_name?.toLowerCase().includes(searchTerm.toLowerCase()))
                        : users;
                      return filtered.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-8">No hay resultados para "{searchTerm}"</p>
                      ) : (
                        filtered.map((u) => {
                          const isCurrentUser = u.id === currentUser?.id;
                          const modules = getModuleAccess(u.role);

                          const initials = (u.full_name || "??")
                            .split(" ")
                            .map((n) => n[0])
                            .join("")
                            .toUpperCase()
                            .slice(0, 2);

                          const avatarColor = {
                            admin: "bg-primary/20 text-primary",
                            owner: "bg-amber-100 text-amber-700",
                            manager: "bg-blue-100 text-blue-600",
                            cajero: "bg-emerald-100 text-emerald-600",
                            operator: "bg-slate-200 text-slate-600",
                          }[u.role ?? ""] ?? "bg-muted text-muted-foreground";

                          const roleBadgeStyle = {
                            admin: "bg-primary/10 text-primary border-primary/20",
                            owner: "bg-amber-50 text-amber-700 border-amber-200",
                            manager: "bg-blue-50 text-blue-600 border-blue-200",
                            cajero: "bg-emerald-50 text-emerald-600 border-emerald-200",
                            operator: "bg-slate-100 text-slate-600 border-slate-200",
                          }[u.role ?? ""] ?? "bg-muted text-muted-foreground border-muted";

                          return (
                            <div
                              key={u.id}
                              className={`group relative rounded-xl border transition-all hover:shadow-sm ${
                                !u.active ? "border-destructive/20 bg-destructive/[0.02]" : "border-border bg-card"
                              }`}
                            >
                              {/* Inactive overlay indicator */}
                              {!u.active && (
                                <div className="absolute top-3 right-3">
                                  <span className="text-[10px] font-bold uppercase tracking-wider text-destructive/60 flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-destructive" />
                                    Inactivo
                                  </span>
                                </div>
                              )}

                              <div className="p-4">
                                <div className="flex items-start gap-3.5">
                                  {/* Avatar with initials */}
                                  <Avatar className={`w-11 h-11 rounded-xl ${avatarColor}`}>
                                    <AvatarFallback className={`rounded-xl text-xs font-bold ${avatarColor}`}>
                                      {initials}
                                    </AvatarFallback>
                                  </Avatar>

                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <p className={`font-semibold text-sm ${!u.active ? "text-muted-foreground" : "text-foreground"}`}>
                                        {u.full_name || "Sin nombre"}
                                      </p>
                                      {isCurrentUser && (
                                        <Badge variant="default" className="text-[10px] h-5 px-1.5">TÚ</Badge>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-md border ${roleBadgeStyle}`}>
                                        {ROLE_LABELS[u.role ?? ""] ?? u.role ?? "Sin rol"}
                                      </span>
                                      <span className="text-[11px] text-muted-foreground">
                                        <i className="fa-solid fa-calendar mr-1" />
                                        {niFormatDate(u.created_at)}
                                      </span>
                                    </div>

                                    {/* Module permissions */}
                                    <div className="flex flex-wrap gap-1 mt-2.5">
                                      {modules.map((m) => {
                                        const overrideVal = (u.module_overrides ?? {})[m.key];
                                        const hasOverride = overrideVal !== undefined;
                                        const effectiveAccess = hasOverride ? overrideVal : m.access;

                                        return (
                                          <span
                                            key={m.key}
                                            title={`${m.label}: ${effectiveAccess ? "acceso permitido" : "sin acceso"}${hasOverride ? " (personalizado)" : ""}`}
                                            className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md font-medium transition-all ${
                                              effectiveAccess
                                                ? hasOverride
                                                  ? "bg-emerald-100 text-emerald-700 border border-emerald-300"
                                                  : "bg-green-50 text-green-600 border border-green-200"
                                                : "bg-muted/40 text-muted-foreground/50 border border-transparent line-through"
                                            }`}
                                          >
                                            <i className={`fa-solid ${m.icon} text-[9px]`} />
                                            {m.label}
                                            {hasOverride && <i className="fa-solid fa-star text-[7px] ml-0.5" />}
                                          </span>
                                        );
                                      })}
                                    </div>
                                  </div>
                                </div>

                                {/* Actions */}
                                <div className="flex items-center justify-end gap-2 mt-3 pt-3 border-t border-border/50">
                                  {u.active ? (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => openDeactivateDialog(u)}
                                      disabled={isCurrentUser}
                                      className="text-xs text-destructive/70 hover:text-destructive hover:bg-destructive/5 h-8 px-3 gap-1.5"
                                    >
                                      <i className="fa-solid fa-user-slash" />
                                      Desactivar
                                    </Button>
                                  ) : (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => openDeactivateDialog(u)}
                                      className="text-xs text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 h-8 px-3 gap-1.5"
                                    >
                                      <i className="fa-solid fa-user-check" />
                                      Activar
                                    </Button>
                                  )}
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => startEditUser(u)}
                                    className="text-xs h-8 px-3 gap-1.5"
                                  >
                                    <i className="fa-solid fa-pen" />
                                    Editar permisos
                                  </Button>
                                </div>
                              </div>
                            </div>
                          );
                        })
                      );
                    })()}
                  </div>
                )}
              </CardContent>
            </Card>
          </section>

          {/* ══════ Datos del negocio ══════ */}
          <section id="business" ref={(el) => { sectionRefs.current["business"] = el; }} className="scroll-mt-20">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center">
                    <i className="fa-solid fa-building text-amber-600" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Datos del negocio</CardTitle>
                    <CardDescription>Información principal del negocio para tickets y facturación</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="business_name">Nombre del negocio</Label>
                  <Input id="business_name" value={form.business_name} onChange={(e) => setFormField("business_name", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="address">Dirección</Label>
                  <Input id="address" value={form.address} onChange={(e) => setFormField("address", e.target.value)} placeholder="Ej: Esquina del banco lafise de nindiri 500 metros al norte" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="phone">Teléfono</Label>
                    <Input id="phone" value={form.phone} onChange={(e) => setFormField("phone", e.target.value)} placeholder="57037623" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ruc">RUC/NIT</Label>
                    <Input id="ruc" value={form.ruc} onChange={(e) => setFormField("ruc", e.target.value)} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="social_media">Redes Sociales</Label>
                  <Input id="social_media" value={form.social_media} onChange={(e) => setFormField("social_media", e.target.value)} placeholder="@elrapidonica" />
                </div>
              </CardContent>
            </Card>
          </section>

          {/* ══════ Logo ══════ */}
          <section id="logo" ref={(el) => { sectionRefs.current["logo"] = el; }} className="scroll-mt-20">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-purple-100 flex items-center justify-center">
                    <i className="fa-solid fa-image text-purple-600" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Logo del negocio</CardTitle>
                    <CardDescription>Sube el logo que aparecerá en los tickets impresos</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {form.logo_url ? (
                  <div className="flex flex-col items-center gap-3 p-4 rounded-xl bg-background border border-border">
                    <img src={form.logo_url} alt="Logo" className="max-h-28 object-contain rounded-lg border border-border p-2 bg-white" />
                    <Button variant="destructive" size="sm" onClick={() => setFormField("logo_url", "")} className="gap-1.5">
                      <i className="fa-solid fa-trash-can" /> Quitar logo
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center p-8 rounded-xl bg-background border-2 border-dashed border-border">
                    <i className="fa-solid fa-cloud-arrow-up text-3xl text-muted-foreground/40 mb-2" />
                    <p className="text-sm text-muted-foreground mb-3">Sube el logo de tu negocio (máx 2MB)</p>
                    <Label htmlFor="logo-upload" className="cursor-pointer">
                      <span className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-accent-foreground text-sm font-medium hover:opacity-90 transition-opacity">
                        <i className="fa-solid fa-upload" /> Seleccionar imagen
                      </span>
                      <Input id="logo-upload" type="file" accept="image/*" onChange={handleLogoUpload} disabled={uploading} className="hidden" />
                    </Label>
                  </div>
                )}
                {uploading && (
                  <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                    <i className="fa-solid fa-spinner fa-spin" /> Subiendo...
                  </div>
                )}
              </CardContent>
            </Card>
          </section>

          {/* ══════ Ticket ══════ */}
          <section id="ticket" ref={(el) => { sectionRefs.current["ticket"] = el; }} className="scroll-mt-20">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-rose-100 flex items-center justify-center">
                    <i className="fa-solid fa-receipt text-rose-600" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Configuración de ticket</CardTitle>
                    <CardDescription>Personaliza el contenido y formato del ticket de venta</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="receipt_footer">Mensaje de despedida</Label>
                  <Textarea id="receipt_footer" value={form.receipt_footer} onChange={(e) => setFormField("receipt_footer", e.target.value)} placeholder="Gracias por su visita" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="printer_width">Ancho de impresora (mm)</Label>
                  <Select value={form.printer_width_mm} onValueChange={(v) => setFormField("printer_width_mm", v)}>
                    <SelectTrigger id="printer_width" className="w-full sm:w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="58">58mm (Pequeña)</SelectItem>
                      <SelectItem value="80">80mm (Estándar)</SelectItem>
                      <SelectItem value="110">110mm (Grande)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between p-4 rounded-xl bg-background border border-border hover:border-rose-200 transition-colors">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-semibold">Imprimir doble ticket</Label>
                    <p className="text-xs text-muted-foreground">Genera una copia para el negocio y otra para el cliente.</p>
                  </div>
                  <Switch
                    checked={form.double_print_ticket}
                    onCheckedChange={(v) => setFormField("double_print_ticket", v)}
                  />
                </div>
              </CardContent>
            </Card>
          </section>

          {/* ══════ QR ══════ */}
          <section id="qr" ref={(el) => { sectionRefs.current["qr"] = el; }} className="scroll-mt-20">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-indigo-100 flex items-center justify-center">
                    <i className="fa-solid fa-qrcode text-indigo-600" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Código QR del ticket</CardTitle>
                    <CardDescription>
                      Sube una imagen de código QR que aparecerá al final de cada ticket impreso.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {form.qr_image_url ? (
                  <div className="flex flex-col items-center gap-3 p-4 rounded-xl bg-background border border-border">
                    <img src={form.qr_image_url} alt="QR" className="max-h-28 object-contain rounded-lg border border-border p-2 bg-white" />
                    <Button variant="destructive" size="sm" onClick={() => setFormField("qr_image_url", "")} className="gap-1.5">
                      <i className="fa-solid fa-trash-can" /> Quitar QR
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center p-8 rounded-xl bg-background border-2 border-dashed border-border">
                    <i className="fa-solid fa-qrcode text-3xl text-muted-foreground/40 mb-2" />
                    <p className="text-sm text-muted-foreground mb-3">Sube una imagen QR (máx 2MB)</p>
                    <Label htmlFor="qr-upload" className="cursor-pointer">
                      <span className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-accent-foreground text-sm font-medium hover:opacity-90 transition-opacity">
                        <i className="fa-solid fa-upload" /> Seleccionar imagen
                      </span>
                      <Input id="qr-upload" type="file" accept="image/*" onChange={handleQrUpload} disabled={uploadingQr} className="hidden" />
                    </Label>
                  </div>
                )}
                {uploadingQr && (
                  <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                    <i className="fa-solid fa-spinner fa-spin" /> Subiendo...
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="qr_text">Texto debajo del QR</Label>
                  <Input id="qr_text" value={form.qr_text} onChange={(e) => setFormField("qr_text", e.target.value)} placeholder="Tu opinión es importante para nosotros" />
                </div>
              </CardContent>
            </Card>
          </section>

          {/* ══════ WhatsApp ══════ */}
          <section id="whatsapp" ref={(el) => { sectionRefs.current["whatsapp"] = el; }} className="scroll-mt-20">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-[#25D366]/15 flex items-center justify-center">
                    <i className="fa-brands fa-whatsapp text-[#25D366]" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Mensaje de WhatsApp</CardTitle>
                    <CardDescription>
                      Personaliza el contenido del mensaje que se envía por WhatsApp al cliente después de cada venta.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-4 rounded-xl bg-[#25D366]/5 border border-[#25D366]/15 hover:border-[#25D366]/30 transition-colors">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-semibold">Incluir sección de opinión</Label>
                    <p className="text-xs text-muted-foreground">Agrega un enlace de encuesta/recomendación al final del mensaje.</p>
                  </div>
                  <Switch
                    checked={form.whatsapp_feedback_enabled}
                    onCheckedChange={(v) => setFormField("whatsapp_feedback_enabled", v)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="whatsapp_greeting">Mensaje de despedida (WhatsApp)</Label>
                  <Input id="whatsapp_greeting" value={form.whatsapp_greeting} onChange={(e) => setFormField("whatsapp_greeting", e.target.value)} placeholder="¡Gracias por su visita!" />
                  <p className="text-[10px] text-muted-foreground">Aparece antes de la sección de opinión. Ej: "¡Gracias por su visita!"</p>
                </div>

                {form.whatsapp_feedback_enabled && (
                  <div className="space-y-4 animate-fade-in">
                    <Separator />
                    <div className="space-y-2">
                      <Label htmlFor="whatsapp_feedback_text">Título de la sección</Label>
                      <Input id="whatsapp_feedback_text" value={form.whatsapp_feedback_text} onChange={(e) => setFormField("whatsapp_feedback_text", e.target.value)} placeholder="Tu opinión es importante para nosotros" />
                      <p className="text-[10px] text-muted-foreground">Ej: "Tu opinión es importante para nosotros"</p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="whatsapp_link_label">Texto antes del enlace</Label>
                      <Input id="whatsapp_link_label" value={form.whatsapp_link_label} onChange={(e) => setFormField("whatsapp_link_label", e.target.value)} placeholder="Dejanos tu recomendación aquí:" />
                      <p className="text-[10px] text-muted-foreground">Ej: "Dejanos tu recomendación aquí:"</p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="whatsapp_feedback_link">Enlace (URL)</Label>
                      <Input id="whatsapp_feedback_link" value={form.whatsapp_feedback_link} onChange={(e) => setFormField("whatsapp_feedback_link", e.target.value)} placeholder="https://forms.gle/..." />
                      <p className="text-[10px] text-muted-foreground">Puede ser un formulario de Google, encuesta, etc.</p>
                    </div>
                  </div>
                )}

                {/* Preview */}
                <div className="bg-[#E5DDD5] rounded-xl p-4 border border-[#25D366]/20">
                  <p className="text-[10px] text-muted-foreground mb-2 font-semibold flex items-center gap-1">
                    <i className="fa-solid fa-eye" /> Vista previa del final del mensaje:
                  </p>
                  <div className="bg-white rounded-lg p-3 shadow-sm text-xs space-y-1 font-mono">
                    <p>🙏 <em>{form.whatsapp_greeting || "¡Gracias por su visita!"}</em></p>
                    {form.whatsapp_feedback_enabled && (
                      <>
                        <p className="pt-1" />
                        <p>⭐ <strong>{form.whatsapp_feedback_text || "Tu opinión es importante"}</strong> ⭐</p>
                        <p>📝 {form.whatsapp_link_label || "Dejanos tu recomendación aquí:"}</p>
                        <p className="text-blue-600">👉 {form.whatsapp_feedback_link || "https://..."}</p>
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* ══════ Tasa de cambio ══════ */}
          <section id="exchange" ref={(el) => { sectionRefs.current["exchange"] = el; }} className="scroll-mt-20">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-yellow-100 flex items-center justify-center">
                    <i className="fa-solid fa-coins text-yellow-600" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Tasa de cambio</CardTitle>
                    <CardDescription>Configura el tipo de cambio actual USD / Córdobas</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Label htmlFor="exchange_rate">1 USD = ? C$</Label>
                  <div className="relative max-w-xs">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-lg font-bold text-muted-foreground">C$</span>
                    <Input
                      id="exchange_rate"
                      type="number"
                      value={form.exchange_rate}
                      min="0"
                      step="0.0001"
                      onChange={(e) => setFormField("exchange_rate", e.target.value)}
                      className="text-2xl font-bold text-right pl-12 pr-4 h-14"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-lg font-bold text-muted-foreground">USD</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Tasa de cambio actual para conversiones en el POS</p>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* ══════ Caja / POS ══════ */}
          <section id="cashpos" ref={(el) => { sectionRefs.current["cashpos"] = el; }} className="scroll-mt-20">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center">
                    <i className="fa-solid fa-vault text-emerald-600" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Caja / POS</CardTitle>
                    <CardDescription>
                      Configura el comportamiento del módulo de cierre de caja según el rol del usuario.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-start justify-between p-4 rounded-xl bg-emerald-50 border border-emerald-200">
                  <div className="space-y-1 pr-4 flex-1">
                    <Label className="text-sm font-semibold text-foreground">
                      Mostrar montos esperados al cajero
                    </Label>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Permite decidir si los usuarios con rol <strong>Cajero</strong> pueden visualizar los montos
                      que el sistema espera al momento de realizar el cierre de caja.
                    </p>
                  </div>
                  <Switch
                    checked={form.show_expected_cash_to_cashier}
                    onCheckedChange={(v) => setFormField("show_expected_cash_to_cashier", v)}
                  />
                </div>
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <i className="fa-solid fa-circle-info text-primary" />
                  {form.show_expected_cash_to_cashier ? (
                    <span className="text-emerald-600 font-semibold">Activado — el cajero puede ver los montos esperados</span>
                  ) : (
                    <span className="text-amber-600 font-semibold">Desactivado — el cajero solo ingresa su conteo; el sistema compara al finalizar</span>
                  )}
                </p>
              </CardContent>
            </Card>
          </section>

          {/* ── Save button ── */}
          <Button
            onClick={handleSave}
            disabled={updateSettings.isPending || uploading || uploadingQr}
            size="lg"
            className="w-full sm:w-auto text-base gap-2 h-12 px-8"
          >
            {updateSettings.isPending ? (
              <i className="fa-solid fa-spinner fa-spin" />
            ) : (
              <i className="fa-solid fa-floppy-disk" />
            )}
            Guardar configuración
          </Button>

          {/* ══════ Exportar datos ══════ */}
          <section id="export" ref={(el) => { sectionRefs.current["export"] = el; }} className="scroll-mt-20">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-cyan-100 flex items-center justify-center">
                    <i className="fa-solid fa-file-arrow-down text-cyan-600" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Exportar datos</CardTitle>
                    <CardDescription>Descarga los registros en formato CSV o respaldo SQL completo</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Button variant="outline" onClick={() => exportCSV("tickets")} className="justify-start h-auto py-4 px-4 gap-4">
                    <div className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0">
                      <i className="fa-solid fa-file-csv text-accent" />
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-semibold">Exportar Tickets</p>
                      <p className="text-xs text-muted-foreground">Historial de ventas en CSV</p>
                    </div>
                  </Button>
                  <Button variant="outline" onClick={() => exportCSV("customers")} className="justify-start h-auto py-4 px-4 gap-4">
                    <div className="w-9 h-9 rounded-lg bg-secondary/10 flex items-center justify-center flex-shrink-0">
                      <i className="fa-solid fa-users text-secondary" />
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-semibold">Exportar Clientes</p>
                      <p className="text-xs text-muted-foreground">Base de clientes en CSV</p>
                    </div>
                  </Button>
                  <Button
                    variant="outline"
                    onClick={exportFullDatabaseSQL}
                    className="justify-start h-auto py-4 px-4 gap-4 sm:col-span-2 border-2 border-accent/30 hover:bg-accent/5"
                  >
                    <div className="w-9 h-9 rounded-lg bg-accent/20 flex items-center justify-center flex-shrink-0">
                      <i className="fa-solid fa-database text-accent" />
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-bold">Generar Respaldo Completo (SQL)</p>
                      <p className="text-xs text-muted-foreground">Descarga toda la base de datos lista para restaurar</p>
                    </div>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* ══════ Zona de peligro ══════ */}
          <section id="danger" ref={(el) => { sectionRefs.current["danger"] = el; }} className="scroll-mt-20">
            <Card className="border-2 border-destructive/30 overflow-hidden">
              <CardHeader className="bg-destructive/5">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-destructive/10 flex items-center justify-center">
                      <i className="fa-solid fa-skull-crossbones text-destructive" />
                    </div>
                    <div>
                      <CardTitle className="text-lg text-destructive">Zona de peligro</CardTitle>
                      <CardDescription>Acciones irreversibles. Úsalas con precaución.</CardDescription>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={loadStats}
                    disabled={loadingStats}
                    className="gap-1.5"
                  >
                    {loadingStats ? <i className="fa-solid fa-spinner fa-spin" /> : <i className="fa-solid fa-rotate" />}
                    Ver estadísticas
                  </Button>
                </div>
              </CardHeader>

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

              <CardContent className="space-y-3 pt-4">
                {/* Delete tickets by range */}
                <div className="flex items-center justify-between gap-4 p-4 rounded-xl bg-background border border-border hover:border-orange-300 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-orange-500/10 flex items-center justify-center flex-shrink-0">
                      <i className="fa-solid fa-calendar-xmark text-orange-500" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">Borrar tickets por rango de fechas</p>
                      <p className="text-xs text-muted-foreground">Elimina tickets pagados en un período específico</p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setDangerModal("tickets_range")}
                    className="shrink-0 text-orange-600 border-orange-300 hover:bg-orange-50 gap-1.5"
                  >
                    <i className="fa-solid fa-trash-can" /> Borrar
                  </Button>
                </div>

                {/* Delete all tickets */}
                <div className="flex items-center justify-between gap-4 p-4 rounded-xl bg-background border border-border hover:border-destructive/30 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-destructive/10 flex items-center justify-center flex-shrink-0">
                      <i className="fa-solid fa-file-circle-xmark text-destructive" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">Borrar todos los tickets / reportes</p>
                      <p className="text-xs text-muted-foreground">Elimina permanentemente todo el historial de ventas</p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setDangerModal("tickets")}
                    className="shrink-0 text-destructive border-destructive/30 hover:bg-destructive/10 gap-1.5"
                  >
                    <i className="fa-solid fa-trash-can" /> Borrar
                  </Button>
                </div>

                {/* Delete inactive customers */}
                <div className="flex items-center justify-between gap-4 p-4 rounded-xl bg-background border border-border hover:border-destructive/30 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-destructive/10 flex items-center justify-center flex-shrink-0">
                      <i className="fa-solid fa-user-slash text-destructive" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">Borrar clientes sin actividad</p>
                      <p className="text-xs text-muted-foreground">Elimina clientes que no tienen ningún ticket registrado</p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setDangerModal("customers_inactive")}
                    className="shrink-0 text-destructive border-destructive/30 hover:bg-destructive/10 gap-1.5"
                  >
                    <i className="fa-solid fa-trash-can" /> Borrar
                  </Button>
                </div>

                {/* Delete cash closures */}
                <div className="flex items-center justify-between gap-4 p-4 rounded-xl bg-background border border-border hover:border-destructive/30 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-destructive/10 flex items-center justify-center flex-shrink-0">
                      <i className="fa-solid fa-vault text-destructive" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">Borrar cierres de caja</p>
                      <p className="text-xs text-muted-foreground">Elimina todo el historial de cierres de turno</p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setDangerModal("cash_closures")}
                    className="shrink-0 text-destructive border-destructive/30 hover:bg-destructive/10 gap-1.5"
                  >
                    <i className="fa-solid fa-trash-can" /> Borrar
                  </Button>
                </div>

                {/* Delete ALL data */}
                <div className="flex items-center justify-between gap-4 p-4 rounded-xl bg-destructive/5 border-2 border-destructive/40 hover:border-destructive/60 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-destructive/20 flex items-center justify-center flex-shrink-0">
                      <i className="fa-solid fa-bomb text-destructive" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-destructive">Borrar TODOS los datos</p>
                      <p className="text-xs text-muted-foreground">Tickets, clientes y cierres de caja. Acción nuclear.</p>
                    </div>
                  </div>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setDangerModal("all_data")}
                    className="shrink-0 gap-1.5"
                  >
                    <i className="fa-solid fa-bomb" /> Borrar todo
                  </Button>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Bottom spacer */}
          <div className="h-8" />
        </main>
      </div>

      {/* ── Edit User Dialog ── */}
      <Dialog open={editDialogOpen} onOpenChange={(open) => { if (!open) cancelEdit(); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <i className="fa-solid fa-pen text-blue-500" />
              Editar permisos de usuario
            </DialogTitle>
            <DialogDescription>
              Cambia el rol y personaliza el acceso a módulos del sistema.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* Role selector */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Rol del usuario</Label>
              <Select value={editRole} onValueChange={setEditRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-primary" />
                      Administrador
                    </span>
                  </SelectItem>
                  <SelectItem value="owner">
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-amber-500" />
                      Propietario
                    </span>
                  </SelectItem>
                  <SelectItem value="manager">
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-blue-500" />
                      Gerente
                    </span>
                  </SelectItem>
                  <SelectItem value="cajero">
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      Cajero
                    </span>
                  </SelectItem>
                  <SelectItem value="operator">
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-slate-400" />
                      Operador
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Separator />

            {/* Module access overrides */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">Acceso a módulos</Label>
                {Object.keys(editOverrides).length > 0 && (
                  <button
                    type="button"
                    onClick={() => setEditOverrides({})}
                    className="text-[11px] text-muted-foreground hover:text-destructive flex items-center gap-1"
                  >
                    <i className="fa-solid fa-rotate-left" /> Restablecer
                  </button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Los interruptores en azul indican acceso forzado (sobrescribe el valor por defecto del rol).
              </p>
              <div className="grid grid-cols-2 gap-2">
                {getModuleAccess(editRole).map((m) => {
                  const overrideVal = editOverrides[m.key];
                  const hasOverride = overrideVal !== undefined;
                  const isForced = hasOverride && overrideVal !== m.access;
                  return (
                    <div
                      key={m.key}
                      className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                        isForced ? "bg-blue-50 border-blue-200" : "bg-background border-border"
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                          isForced ? "bg-blue-100" : m.access ? "bg-green-50" : "bg-muted/30"
                        }`}>
                          <i className={`fa-solid ${m.icon} text-xs ${
                            isForced ? "text-blue-600" : m.access ? "text-green-600" : "text-muted-foreground/50"
                          }`} />
                        </div>
                        <div>
                          <p className="text-sm font-medium">{m.label}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {hasOverride
                              ? overrideVal ? "Acceso forzado" : "Acceso bloqueado"
                              : m.access ? "Acceso por defecto" : "Sin acceso"}
                          </p>
                        </div>
                      </div>
                      <Switch
                        checked={hasOverride ? overrideVal : m.access}
                        onCheckedChange={(checked) => {
                          if (!hasOverride && checked === m.access) return;
                          setEditOverrides((prev) => {
                            const next = { ...prev };
                            if (checked === m.access) delete next[m.key];
                            else next[m.key] = checked;
                            return next;
                          });
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={cancelEdit}>
              Cancelar
            </Button>
            <Button
              onClick={() => editingUserId && handleUpdateRole(editingUserId)}
              disabled={savingRole}
              className="gap-2"
            >
              {savingRole ? <i className="fa-solid fa-spinner fa-spin" /> : <i className="fa-solid fa-check" />}
              Guardar cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Deactivate User Confirmation ── */}
      <Dialog open={deactivateDialogOpen} onOpenChange={setDeactivateDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                deactivateTarget?.active ? "bg-destructive/10" : "bg-emerald-100"
              }`}>
                <i className={`fa-solid ${deactivateTarget?.active ? "fa-user-slash text-destructive" : "fa-user-check text-emerald-600"}`} />
              </div>
              {deactivateTarget?.active ? "Desactivar usuario" : "Activar usuario"}
            </DialogTitle>
            <DialogDescription>
              {deactivateTarget?.active
                ? `El usuario ${deactivateTarget?.full_name || "sin nombre"} no podrá acceder al sistema hasta que sea reactivado.`
                : `El usuario ${deactivateTarget?.full_name || "sin nombre"} podrá acceder al sistema nuevamente.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setDeactivateDialogOpen(false); setDeactivateTarget(null); }}>
              Cancelar
            </Button>
            <Button
              variant={deactivateTarget?.active ? "destructive" : "default"}
              onClick={handleToggleActive}
              className="gap-2"
            >
              <i className={`fa-solid ${deactivateTarget?.active ? "fa-user-slash" : "fa-user-check"}`} />
              {deactivateTarget?.active ? "Sí, desactivar" : "Sí, activar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
            <div className="space-y-1.5">
              <Label>Desde</Label>
              <Input type="date" value={rangeFrom} onChange={(e) => setRangeFrom(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Hasta</Label>
              <Input type="date" value={rangeTo} onChange={(e) => setRangeTo(e.target.value)} />
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
