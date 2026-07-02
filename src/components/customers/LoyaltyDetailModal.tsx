import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

interface Customer {
  id: number;
  name: string;
  phone: string;
  plate: string;
  email: string;
  is_general: boolean;
  created_at: string;
  loyalty_visits?: number;
  loyalty_last_visit?: string;
  loyalty_free_washes_earned?: number;
  loyalty_free_washes_used?: number;
}

interface LoyaltyVisit {
  id: string;
  customer_id: number;
  ticket_id: number | null;
  service_id: number;
  visit_number: number;
  earned_free_wash: boolean;
  created_at: string;
  services?: { name: string } | null;
}

interface Props {
  customer: Customer;
  onClose: () => void;
  onUpdate: () => void;
}

export default function LoyaltyDetailModal({ customer, onClose, onUpdate }: Props) {
  const [history, setHistory] = useState<LoyaltyVisit[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    loyalty_visits: 0,
    loyalty_free_washes_earned: 0,
    loyalty_free_washes_used: 0,
  });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const visits = customer.loyalty_visits || 0;
  const freeEarned = customer.loyalty_free_washes_earned || 0;
  const freeUsed = customer.loyalty_free_washes_used || 0;
  const freeAvailable = freeEarned - freeUsed;
  const progressToNextFree = visits % 8;
  const progressPercent = (progressToNextFree / 8) * 100;

  useEffect(() => {
    setForm({
      loyalty_visits: visits,
      loyalty_free_washes_earned: freeEarned,
      loyalty_free_washes_used: freeUsed,
    });
  }, [customer]);

  useEffect(() => {
    const loadHistory = async () => {
      setLoading(true);
      const { data } = await (supabase as any)
        .from("loyalty_visits")
        .select("*, services(name)")
        .eq("customer_id", customer.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (data) {
        setHistory(data as LoyaltyVisit[]);
      }
      setLoading(false);
    };
    loadHistory();
  }, [customer.id]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("customers")
        .update({
          loyalty_visits: form.loyalty_visits,
          loyalty_free_washes_earned: form.loyalty_free_washes_earned,
          loyalty_free_washes_used: form.loyalty_free_washes_used,
        })
        .eq("id", customer.id);

      if (error) {
        showToast("Error al guardar: " + error.message);
      } else {
        showToast("Programa de lealtad actualizado");
        setEditing(false);
        onUpdate();
      }
    } catch (err: any) {
      showToast(err.message || "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content animate-scale-in max-w-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-foreground">
            <i className="fa-solid fa-star mr-2 text-secondary" />
            Programa de Lealtad
          </h2>
          <button onClick={onClose} className="touch-btn p-2 text-muted-foreground">
            <i className="fa-solid fa-xmark text-xl" />
          </button>
        </div>

        {/* Customer Info */}
        <div className="bg-muted/30 rounded-xl p-4 mb-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-foreground">{customer.name}</h3>
              <p className="text-sm text-muted-foreground">
                {customer.plate && <span className="mr-4"><i className="fa-solid fa-car mr-1" />{customer.plate}</span>}
                {customer.phone && <span><i className="fa-solid fa-phone mr-1" />{customer.phone}</span>}
              </p>
            </div>
            {customer.loyalty_last_visit && (
              <span className="text-xs text-muted-foreground">
                <i className="fa-solid fa-clock mr-1" />
                Última visita: {new Date(customer.loyalty_last_visit).toLocaleDateString("es-NI")}
              </span>
            )}
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-4 gap-3 mb-4">
          <div className="bg-primary/10 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-primary">{visits}</p>
            <p className="text-xs text-muted-foreground">Servicios</p>
          </div>
          <div className="bg-accent/10 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-accent">{freeEarned}</p>
            <p className="text-xs text-muted-foreground">Ganados</p>
          </div>
          <div className="bg-destructive/10 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-destructive">{freeUsed}</p>
            <p className="text-xs text-muted-foreground">Usados</p>
          </div>
          <div className="bg-green-500/10 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-green-600">{freeAvailable}</p>
            <p className="text-xs text-muted-foreground">Disponibles</p>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mb-4">
          <div className="flex items-center justify-between text-sm mb-1">
            <span className="text-muted-foreground">Progreso al próximo gratis</span>
            <span className="font-semibold text-foreground">{progressToNextFree}/8</span>
          </div>
          <div className="w-full bg-muted rounded-full h-3 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-primary to-accent transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {freeAvailable > 0 ? (
              <span className="text-green-600 font-semibold">
                <i className="fa-solid fa-gift mr-1" />{freeAvailable} pasteado{freeAvailable > 1 ? "s" : ""} gratis disponible{freeAvailable > 1 ? "s" : ""}
              </span>
            ) : (
              `${8 - progressToNextFree} servicios para pasteado gratis`
            )}
          </p>
        </div>

        {/* Edit / Save Buttons */}
        <div className="flex gap-2 mb-4">
          {!editing ? (
            <button
              onClick={() => setEditing(true)}
              className="touch-btn px-4 py-2 rounded-xl bg-secondary/10 text-secondary font-semibold flex items-center gap-2 hover:bg-secondary/20"
            >
              <i className="fa-solid fa-pen" />Editar contadores
            </button>
          ) : (
            <div className="w-full space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Servicios</label>
                  <input
                    type="number"
                    min="0"
                    value={form.loyalty_visits}
                    onChange={(e) => setForm({ ...form, loyalty_visits: parseInt(e.target.value) || 0 })}
                    className="input-touch text-center"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Ganados</label>
                  <input
                    type="number"
                    min="0"
                    value={form.loyalty_free_washes_earned}
                    onChange={(e) => setForm({ ...form, loyalty_free_washes_earned: parseInt(e.target.value) || 0 })}
                    className="input-touch text-center"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Usados</label>
                  <input
                    type="number"
                    min="0"
                    value={form.loyalty_free_washes_used}
                    onChange={(e) => setForm({ ...form, loyalty_free_washes_used: parseInt(e.target.value) || 0 })}
                    className="input-touch text-center"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setEditing(false);
                    setForm({ loyalty_visits: visits, loyalty_free_washes_earned: freeEarned, loyalty_free_washes_used: freeUsed });
                  }}
                  className="touch-btn flex-1 py-2 rounded-xl border border-border text-foreground font-semibold"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="touch-btn flex-1 py-2 rounded-xl bg-primary text-primary-foreground font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <i className="fa-solid fa-floppy-disk" />
                  {saving ? "Guardando..." : "Guardar"}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* History */}
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
            <i className="fa-solid fa-clock-rotate-left text-secondary" />
            Historial de servicios
            {history.length > 0 && <span className="text-xs text-muted-foreground font-normal">({history.length})</span>}
          </h3>
          {loading ? (
            <div className="text-center py-6"><i className="fa-solid fa-spinner fa-spin text-xl text-accent" /></div>
          ) : history.length === 0 ? (
            <p className="text-center py-6 text-muted-foreground text-sm">
              <i className="fa-solid fa-circle-info mr-2" />
              Sin historial de servicios
            </p>
          ) : (
            <div className="max-h-64 overflow-y-auto border border-border rounded-xl">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 sticky top-0">
                  <tr>
                    <th className="text-left p-2 text-secondary font-semibold">#</th>
                    <th className="text-left p-2 text-secondary font-semibold">Servicio</th>
                    <th className="text-center p-2 text-secondary font-semibold">Gratis</th>
                    <th className="text-right p-2 text-secondary font-semibold">Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h) => (
                    <tr key={h.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                      <td className="p-2 text-foreground font-medium">{h.visit_number}</td>
                      <td className="p-2 text-muted-foreground">{h.services?.name || `ID: ${h.service_id}`}</td>
                      <td className="p-2 text-center">
                        {h.earned_free_wash ? (
                          <span className="px-2 py-0.5 rounded-full bg-accent/20 text-accent font-bold text-[10px]">
                            <i className="fa-solid fa-gift mr-1" />Sí
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="p-2 text-right text-muted-foreground">
                        {new Date(h.created_at).toLocaleDateString("es-NI", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {toast && (
          <div className="toast-success fixed bottom-4 right-4 z-50">
            <i className="fa-solid fa-circle-check mr-2" />
            {toast}
          </div>
        )}
      </div>
    </div>
  );
}
