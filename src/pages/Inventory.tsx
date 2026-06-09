import { useState, useMemo, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useInventoryProducts, useProductMovements, type InventoryProduct, type StockMovement } from "@/hooks/useInventory";
import { useAuth } from "@/hooks/useAuth";
import { niFormatShortDate, niFormatTime } from "@/utils/niDate";

type StockFilter = "all" | "low" | "out";
type ToastState = { msg: string; ok: boolean } | null;

const REASON_LABELS: Record<string, string> = {
  sale: "Venta",
  adjustment: "Ajuste manual",
  restock: "Reposición",
};

const REASON_COLORS: Record<string, string> = {
  sale: "text-red-600 bg-red-50 dark:bg-red-900/20",
  adjustment: "text-blue-600 bg-blue-50 dark:bg-blue-900/20",
  restock: "text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20",
};

const REASON_ICONS: Record<string, string> = {
  sale: "fa-shopping-bag",
  adjustment: "fa-sliders",
  restock: "fa-boxes-stacked",
};

function stockStatus(p: InventoryProduct) {
  if (p.stock_quantity === 0) return "out";
  if (p.stock_quantity <= p.min_stock_level) return "low";
  return "ok";
}

function StockBadge({ product }: { product: InventoryProduct }) {
  const status = stockStatus(product);
  if (status === "out")
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
        <i className="fa-solid fa-circle-xmark" /> Agotado
      </span>
    );
  if (status === "low")
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
        <i className="fa-solid fa-triangle-exclamation" /> Stock bajo
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
      <i className="fa-solid fa-circle-check" /> OK
    </span>
  );
}

// ── Product Form Modal ────────────────────────────────────────────────────────
interface ProductFormProps {
  editing: InventoryProduct | "new";
  onClose: () => void;
  onSaved: () => void;
  showToast: (msg: string, ok?: boolean) => void;
}

function ProductFormModal({ editing, onClose, onSaved, showToast }: ProductFormProps) {
  const isNew = editing === "new";
  const initial = isNew
    ? { name: "", description: "", sku: "", price: "0", stock_quantity: "0", min_stock_level: "5", icon: "fa-bottle-droplet" }
    : {
        name: (editing as InventoryProduct).name,
        description: (editing as InventoryProduct).description || "",
        sku: (editing as InventoryProduct).sku || "",
        price: String((editing as InventoryProduct).price),
        stock_quantity: String((editing as InventoryProduct).stock_quantity),
        min_stock_level: String((editing as InventoryProduct).min_stock_level),
        icon: (editing as InventoryProduct).icon || "fa-bottle-droplet",
      };

  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);

  const ICONS = [
    "fa-bottle-droplet", "fa-jar", "fa-pump-soap", "fa-spray-can",
    "fa-scissors", "fa-box", "fa-boxes-stacked", "fa-star",
    "fa-tag", "fa-bag-shopping", "fa-cube", "fa-flask",
  ];

  const handleSave = async () => {
    if (!form.name.trim()) { showToast("El nombre es requerido", false); return; }
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      description: form.description,
      sku: form.sku,
      price: parseFloat(form.price) || 0,
      stock_quantity: parseInt(form.stock_quantity, 10) || 0,
      min_stock_level: parseInt(form.min_stock_level, 10) || 5,
      icon: form.icon,
      is_active: true,
      business_line: "barbershop" as const,
    };

    let err;
    if (isNew) {
      ({ error: err } = await supabase.from("products").insert(payload));
    } else {
      ({ error: err } = await supabase.from("products").update(payload).eq("id", (editing as InventoryProduct).id));
    }
    setSaving(false);
    if (err) { showToast(err.message, false); return; }
    showToast(isNew ? "Producto creado" : "Producto actualizado");
    onSaved();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-card rounded-2xl shadow-2xl border border-border w-full max-w-lg animate-scale-in">
        <div className="p-5 border-b border-border flex items-center justify-between">
          <h3 className="font-bold text-foreground text-lg flex items-center gap-2">
            <i className="fa-solid fa-box text-secondary" />
            {isNew ? "Nuevo producto" : "Editar producto"}
          </h3>
          <button onClick={onClose} className="touch-btn p-2 text-muted-foreground hover:text-foreground">
            <i className="fa-solid fa-xmark text-lg" />
          </button>
        </div>
        <div className="p-5 space-y-4 overflow-y-auto max-h-[70vh]">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-secondary mb-1 block">Nombre *</label>
              <input
                className="input-touch w-full"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="Nombre del producto"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-secondary mb-1 block">SKU</label>
              <input
                className="input-touch w-full"
                value={form.sku}
                onChange={e => setForm({ ...form, sku: e.target.value })}
                placeholder="Código interno"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-secondary mb-1 block">Precio C$</label>
              <input
                type="number"
                className="input-touch w-full"
                value={form.price}
                onChange={e => setForm({ ...form, price: e.target.value })}
                min={0}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-secondary mb-1 block">Stock inicial</label>
              <input
                type="number"
                className="input-touch w-full"
                value={form.stock_quantity}
                onChange={e => setForm({ ...form, stock_quantity: e.target.value })}
                min={0}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-secondary mb-1 block">Stock mínimo (alerta)</label>
              <input
                type="number"
                className="input-touch w-full"
                value={form.min_stock_level}
                onChange={e => setForm({ ...form, min_stock_level: e.target.value })}
                min={0}
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-secondary mb-1 block">Descripción</label>
            <input
              className="input-touch w-full"
              value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })}
              placeholder="Descripción breve"
            />
          </div>

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
        </div>
        <div className="p-5 border-t border-border flex gap-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-cobrar px-6 py-2 text-sm flex items-center gap-2 disabled:opacity-60"
          >
            {saving ? <i className="fa-solid fa-spinner fa-spin" /> : <i className="fa-solid fa-floppy-disk" />}
            Guardar
          </button>
          <button onClick={onClose} className="touch-btn px-4 py-2 border border-border rounded-xl text-sm">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Stock Adjustment Modal ────────────────────────────────────────────────────
interface AdjustModalProps {
  product: InventoryProduct;
  onClose: () => void;
  onAdjusted: () => void;
  showToast: (msg: string, ok?: boolean) => void;
}

function AdjustStockModal({ product, onClose, onAdjusted, showToast }: AdjustModalProps) {
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState<"adjustment" | "restock">("restock");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const numDelta = parseInt(delta, 10) || 0;
  const newStock = product.stock_quantity + numDelta;

  const handleAdjust = async () => {
    if (!delta || numDelta === 0) { showToast("Ingresa una cantidad válida (+/-)", false); return; }
    if (newStock < 0) { showToast("El stock no puede quedar negativo", false); return; }
    setSaving(true);
    const { error } = await supabase.rpc("adjust_product_stock", {
      p_product_id: product.id,
      p_delta: numDelta,
      p_reason: reason,
      p_notes: notes || "Ajuste desde inventario",
    });
    setSaving(false);
    if (error) { showToast(error.message, false); return; }
    showToast(`Stock ajustado: ${product.stock_quantity} → ${newStock}`);
    onAdjusted();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-card rounded-2xl shadow-2xl border border-border w-full max-w-sm animate-scale-in">
        <div className="p-5 border-b border-border flex items-center justify-between">
          <div>
            <h3 className="font-bold text-foreground flex items-center gap-2">
              <i className="fa-solid fa-sliders text-secondary" /> Ajustar stock
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">{product.name}</p>
          </div>
          <button onClick={onClose} className="touch-btn p-2 text-muted-foreground">
            <i className="fa-solid fa-xmark" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          {/* Current stock display */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-muted/30">
            <span className="text-sm text-muted-foreground">Stock actual</span>
            <span className="text-2xl font-black text-foreground">{product.stock_quantity}</span>
          </div>

          {/* Delta input */}
          <div>
            <label className="text-xs font-semibold text-secondary mb-1 block">Cantidad a ajustar</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setDelta(d => String((parseInt(d) || 0) - 1))}
                className="touch-btn w-10 h-10 rounded-xl bg-red-100 text-red-700 font-bold"
              >
                −
              </button>
              <input
                type="number"
                className="input-touch flex-1 text-center font-bold text-lg"
                value={delta}
                onChange={e => setDelta(e.target.value)}
                placeholder="0"
              />
              <button
                type="button"
                onClick={() => setDelta(d => String((parseInt(d) || 0) + 1))}
                className="touch-btn w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 font-bold"
              >
                +
              </button>
            </div>
          </div>

          {/* Preview */}
          {delta && (
            <div className={`flex items-center justify-between p-3 rounded-xl border-2 ${newStock < 0 ? "border-red-300 bg-red-50" : "border-emerald-300 bg-emerald-50 dark:bg-emerald-900/20"}`}>
              <span className="text-sm font-semibold">Nuevo stock:</span>
              <span className={`text-xl font-black ${newStock < 0 ? "text-red-600" : "text-emerald-700"}`}>{newStock}</span>
            </div>
          )}

          {/* Reason */}
          <div>
            <label className="text-xs font-semibold text-secondary mb-2 block">Motivo</label>
            <div className="flex gap-2">
              {(["restock", "adjustment"] as const).map(r => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setReason(r)}
                  className={`flex-1 px-3 py-2 rounded-xl text-sm font-semibold border-2 transition-all ${reason === r ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}
                >
                  <i className={`fa-solid ${r === "restock" ? "fa-boxes-stacked" : "fa-sliders"} mr-2`} />
                  {r === "restock" ? "Reposición" : "Ajuste"}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-secondary mb-1 block">Nota (opcional)</label>
            <input
              className="input-touch w-full"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Ej: Compra de proveedor"
            />
          </div>
        </div>
        <div className="p-5 border-t border-border flex gap-2">
          <button
            onClick={handleAdjust}
            disabled={saving || !delta || numDelta === 0 || newStock < 0}
            className="btn-cobrar px-6 py-2 text-sm flex items-center gap-2 disabled:opacity-50"
          >
            {saving ? <i className="fa-solid fa-spinner fa-spin" /> : <i className="fa-solid fa-check" />}
            Confirmar
          </button>
          <button onClick={onClose} className="touch-btn px-4 py-2 border border-border rounded-xl text-sm">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Movement History Panel ────────────────────────────────────────────────────
interface MovementPanelProps {
  product: InventoryProduct;
  onClose: () => void;
  onEdit: () => void;
  onAdjust: () => void;
}

function MovementPanel({ product, onClose, onEdit, onAdjust }: MovementPanelProps) {
  const { data: movements, isLoading } = useProductMovements(product.id);
  const [userNames, setUserNames] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!movements?.length) return;
    const uids = [...new Set(movements.map(m => m.user_id).filter(Boolean))] as string[];
    if (!uids.length) return;
    supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", uids)
      .then(({ data }) => {
        if (data) {
          const map: Record<string, string> = {};
          data.forEach((p: any) => { map[p.id] = p.full_name || "—"; });
          setUserNames(map);
        }
      });
  }, [movements]);

  const status = stockStatus(product);

  return (
    <div className="flex flex-col h-full border-l border-border bg-card animate-slide-in-right">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <i className={`fa-solid ${product.icon || "fa-bottle-droplet"} text-xl text-primary`} />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-foreground truncate">{product.name}</h3>
              <p className="text-xs text-muted-foreground">{product.sku || "Sin SKU"}</p>
            </div>
          </div>
          <button onClick={onClose} className="touch-btn p-2 text-muted-foreground shrink-0">
            <i className="fa-solid fa-xmark" />
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2 mt-4">
          <div className="text-center p-2 rounded-xl bg-muted/30">
            <p className="text-lg font-black text-foreground">{product.stock_quantity}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Stock</p>
          </div>
          <div className="text-center p-2 rounded-xl bg-muted/30">
            <p className="text-lg font-black text-foreground">{product.min_stock_level}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Mínimo</p>
          </div>
          <div className="text-center p-2 rounded-xl bg-muted/30">
            <p className="text-lg font-black text-primary">C${Number(product.price).toFixed(0)}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Precio</p>
          </div>
        </div>

        {/* Status badge */}
        <div className="mt-3 flex items-center justify-between">
          <StockBadge product={product} />
          {!product.is_active && (
            <span className="text-xs text-muted-foreground italic">Inactivo</span>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 mt-3">
          <button
            onClick={onAdjust}
            className="touch-btn flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
          >
            <i className="fa-solid fa-sliders" /> Ajustar stock
          </button>
          <button
            onClick={onEdit}
            className="touch-btn px-3 py-2 rounded-xl bg-muted text-muted-foreground text-sm font-semibold hover:bg-muted/80 transition-colors"
          >
            <i className="fa-solid fa-pen" />
          </button>
        </div>
      </div>

      {/* Movement History */}
      <div className="flex-1 overflow-auto p-4">
        <h4 className="text-xs font-bold text-secondary uppercase tracking-wider mb-3 flex items-center gap-2">
          <i className="fa-solid fa-clock-rotate-left" /> Historial de movimientos
        </h4>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <i className="fa-solid fa-spinner fa-spin text-2xl text-accent" />
          </div>
        ) : !movements?.length ? (
          <div className="text-center py-8 text-muted-foreground">
            <i className="fa-solid fa-inbox text-3xl mb-2 opacity-30 block" />
            <p className="text-sm">Sin movimientos registrados</p>
          </div>
        ) : (
          <div className="space-y-2">
            {movements.map((mv: StockMovement) => (
              <div key={mv.id} className="flex items-start gap-3 p-3 rounded-xl bg-muted/20 border border-border/50">
                {/* Icon */}
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${REASON_COLORS[mv.reason]}`}>
                  <i className={`fa-solid ${REASON_ICONS[mv.reason]} text-xs`} />
                </div>
                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-foreground">{REASON_LABELS[mv.reason]}</span>
                    <span className={`text-sm font-black shrink-0 ${mv.quantity_delta < 0 ? "text-red-600" : "text-emerald-600"}`}>
                      {mv.quantity_delta > 0 ? "+" : ""}{mv.quantity_delta}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {niFormatShortDate(mv.created_at)} · {niFormatTime(mv.created_at)}
                  </p>
                  {mv.user_id && userNames[mv.user_id] && (
                    <p className="text-[10px] text-muted-foreground">
                      <i className="fa-solid fa-user mr-1" />{userNames[mv.user_id]}
                    </p>
                  )}
                  {mv.notes && (
                    <p className="text-[10px] text-muted-foreground italic truncate">{mv.notes}</p>
                  )}
                  {mv.ticket_id && (
                    <p className="text-[10px] text-accent">
                      <i className="fa-solid fa-receipt mr-1" />Ticket #{mv.ticket_id}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Inventory Page ───────────────────────────────────────────────────────
export default function Inventory() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin" || profile?.role === "owner";

  const { data: products, isLoading } = useInventoryProducts();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<StockFilter>("all");
  const [selected, setSelected] = useState<InventoryProduct | null>(null);
  const [formEditing, setFormEditing] = useState<InventoryProduct | "new" | null>(null);
  const [adjusting, setAdjusting] = useState<InventoryProduct | null>(null);
  const [toast, setToast] = useState<ToastState>(null);

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  };

  const refetchAll = () => {
    qc.invalidateQueries({ queryKey: ["inventory_products"] });
    qc.invalidateQueries({ queryKey: ["all_products"] });
    qc.invalidateQueries({ queryKey: ["products"] });
    if (selected) qc.invalidateQueries({ queryKey: ["stock_movements", selected.id] });
  };

  const filtered = useMemo(() => {
    let list = products || [];
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(p => p.name.toLowerCase().includes(q) || (p.sku || "").toLowerCase().includes(q));
    }
    if (filter === "low") list = list.filter(p => p.stock_quantity > 0 && p.stock_quantity <= p.min_stock_level);
    if (filter === "out") list = list.filter(p => p.stock_quantity === 0);
    return list;
  }, [products, search, filter]);

  const totalLowStock = useMemo(() =>
    (products || []).filter(p => p.stock_quantity > 0 && p.stock_quantity <= p.min_stock_level).length, [products]);
  const totalOutOfStock = useMemo(() =>
    (products || []).filter(p => p.stock_quantity === 0).length, [products]);

  const toggleActive = async (p: InventoryProduct) => {
    await supabase.from("products").update({ is_active: !p.is_active }).eq("id", p.id);
    showToast(p.is_active ? "Producto desactivado" : "Producto activado");
    refetchAll();
    if (selected?.id === p.id) setSelected({ ...selected, is_active: !p.is_active });
  };

  return (
    <div className="flex flex-col h-full animate-fade-in overflow-hidden">
      {/* Header */}
      <div className="p-4 md:p-6 border-b border-border bg-card/30">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-2xl font-bold text-foreground flex items-center gap-3">
              <span className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <i className="fa-solid fa-boxes-stacked text-primary" />
              </span>
              Inventario Barbería
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">Gestión de productos y control de stock</p>
          </div>
          {isAdmin && (
            <button
              onClick={() => setFormEditing("new")}
              className="touch-btn bg-primary text-primary-foreground px-4 py-2.5 rounded-xl font-semibold flex items-center gap-2 hover:bg-primary/90 transition-colors shadow-sm"
            >
              <i className="fa-solid fa-plus" /> Nuevo producto
            </button>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mt-4">
          <button
            onClick={() => setFilter("all")}
            className={`p-3 rounded-xl border-2 text-center transition-all ${filter === "all" ? "border-primary bg-primary/5" : "border-border bg-muted/20 hover:border-primary/40"}`}
          >
            <p className="text-xl font-black text-foreground">{products?.length ?? "—"}</p>
            <p className="text-xs text-muted-foreground">Total productos</p>
          </button>
          <button
            onClick={() => setFilter("low")}
            className={`p-3 rounded-xl border-2 text-center transition-all ${filter === "low" ? "border-amber-500 bg-amber-50 dark:bg-amber-900/20" : "border-border bg-muted/20 hover:border-amber-400/40"}`}
          >
            <p className={`text-xl font-black ${totalLowStock > 0 ? "text-amber-600" : "text-foreground"}`}>{totalLowStock}</p>
            <p className="text-xs text-muted-foreground">Stock bajo</p>
          </button>
          <button
            onClick={() => setFilter("out")}
            className={`p-3 rounded-xl border-2 text-center transition-all ${filter === "out" ? "border-red-500 bg-red-50 dark:bg-red-900/20" : "border-border bg-muted/20 hover:border-red-400/40"}`}
          >
            <p className={`text-xl font-black ${totalOutOfStock > 0 ? "text-red-600" : "text-foreground"}`}>{totalOutOfStock}</p>
            <p className="text-xs text-muted-foreground">Agotados</p>
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="px-4 md:px-6 py-3 border-b border-border flex gap-3 items-center">
        <div className="relative flex-1">
          <i className="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm" />
          <input
            type="text"
            placeholder="Buscar por nombre o SKU..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input-touch w-full pl-9 text-sm"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <i className="fa-solid fa-xmark text-sm" />
            </button>
          )}
        </div>
        {filter !== "all" && (
          <button
            onClick={() => setFilter("all")}
            className="touch-btn text-xs px-3 py-2 rounded-lg bg-muted text-muted-foreground hover:bg-muted/80 flex items-center gap-1"
          >
            <i className="fa-solid fa-xmark" />
            {filter === "low" ? "Stock bajo" : "Agotados"}
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden flex">
        {/* Product List */}
        <div className={`flex-1 overflow-auto ${selected ? "hidden md:block" : ""}`}>
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground">
              <i className="fa-solid fa-spinner fa-spin text-4xl text-accent" />
              <p>Cargando inventario...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-16">
              <i className="fa-solid fa-boxes-stacked text-5xl mb-4 opacity-20" />
              <p className="text-lg font-semibold">
                {search ? "Sin resultados para tu búsqueda" : "No hay productos"}
              </p>
              {search && <p className="text-sm mt-1">Intenta con otro nombre o SKU</p>}
              {isAdmin && !search && (
                <button
                  onClick={() => setFormEditing("new")}
                  className="touch-btn mt-4 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold"
                >
                  <i className="fa-solid fa-plus mr-2" /> Agregar primer producto
                </button>
              )}
            </div>
          ) : (
            <div className="p-4 md:p-6 space-y-2">
              {filtered.map(product => {
                const isSelected = selected?.id === product.id;
                const status = stockStatus(product);
                return (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => setSelected(isSelected ? null : product)}
                    className={`w-full text-left pos-card p-4 transition-all hover:shadow-md ${isSelected ? "ring-2 ring-primary border-primary/40" : ""} ${!product.is_active ? "opacity-50" : ""}`}
                  >
                    <div className="flex items-center gap-3">
                      {/* Icon */}
                      <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${status === "out" ? "bg-red-100 dark:bg-red-900/30" : status === "low" ? "bg-amber-100 dark:bg-amber-900/30" : "bg-primary/10"}`}>
                        <i className={`fa-solid ${product.icon || "fa-bottle-droplet"} text-lg ${status === "out" ? "text-red-600" : status === "low" ? "text-amber-600" : "text-primary"}`} />
                      </div>
                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-bold text-foreground text-sm">{product.name}</p>
                          {product.sku && <span className="text-[10px] text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-full">{product.sku}</span>}
                        </div>
                        <div className="flex items-center gap-3 mt-1 flex-wrap">
                          <span className="text-sm font-bold text-primary">C${Number(product.price).toFixed(0)}</span>
                          <span className="text-xs text-muted-foreground">Stock: <span className={`font-bold ${status === "out" ? "text-red-600" : status === "low" ? "text-amber-600" : "text-foreground"}`}>{product.stock_quantity}</span></span>
                          <span className="text-xs text-muted-foreground hidden sm:inline">Mín: {product.min_stock_level}</span>
                        </div>
                      </div>
                      {/* Right side */}
                      <div className="flex flex-col items-end gap-2 shrink-0">
                        <StockBadge product={product} />
                        {isAdmin && (
                          <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                            <button
                              onClick={() => { setAdjusting(product); }}
                              className="touch-btn w-8 h-8 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                              title="Ajustar stock"
                            >
                              <i className="fa-solid fa-sliders text-xs" />
                            </button>
                            <button
                              onClick={() => { setFormEditing(product); }}
                              className="touch-btn w-8 h-8 rounded-lg bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
                              title="Editar"
                            >
                              <i className="fa-solid fa-pen text-xs" />
                            </button>
                            <button
                              onClick={() => toggleActive(product)}
                              className="touch-btn w-8 h-8 rounded-lg bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
                              title={product.is_active ? "Desactivar" : "Activar"}
                            >
                              <i className={`fa-solid ${product.is_active ? "fa-toggle-on text-accent" : "fa-toggle-off"} text-xs`} />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Detail Panel */}
        {selected && (
          <div className="w-full md:w-80 lg:w-96 shrink-0 overflow-hidden flex flex-col">
            <MovementPanel
              product={selected}
              onClose={() => setSelected(null)}
              onEdit={() => setFormEditing(selected)}
              onAdjust={() => setAdjusting(selected)}
            />
          </div>
        )}
      </div>

      {/* Modals */}
      {formEditing && (
        <ProductFormModal
          editing={formEditing}
          onClose={() => setFormEditing(null)}
          onSaved={refetchAll}
          showToast={showToast}
        />
      )}
      {adjusting && (
        <AdjustStockModal
          product={adjusting}
          onClose={() => setAdjusting(null)}
          onAdjusted={refetchAll}
          showToast={showToast}
        />
      )}

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
