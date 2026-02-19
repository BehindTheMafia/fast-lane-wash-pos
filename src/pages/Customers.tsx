import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import CustomerFormModal from "@/components/customers/CustomerFormModal";

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

export default function Customers() {
  const { isAdmin, isOwner, isOperator } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [deletingCustomer, setDeletingCustomer] = useState<Customer | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const canDelete = isAdmin || isOwner || isOperator;

  const load = async () => {
    setLoading(true);
    let q = supabase.from("customers").select("*").order("name");
    if (search.trim()) q = q.or(`name.ilike.%${search}%,plate.ilike.%${search}%,phone.ilike.%${search}%`);
    const { data } = await q.limit(100);
    setCustomers((data || []) as Customer[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, [search]);

  const handleNew = () => {
    setEditingCustomer(null);
    setShowModal(true);
  };

  const handleEdit = (customer: Customer) => {
    setEditingCustomer(customer);
    setShowModal(true);
  };

  const handleSave = () => {
    setToast(editingCustomer ? "Cliente actualizado" : "Cliente creado");
    setTimeout(() => setToast(null), 3000);
    load();
  };

  const handleDeleteConfirm = async () => {
    if (!deletingCustomer) return;

    const { error } = await supabase
      .from("customers")
      .delete()
      .eq("id", deletingCustomer.id);

    if (error) {
      setToast("Error al eliminar cliente");
    } else {
      setToast("Cliente eliminado");
      load();
    }

    setTimeout(() => setToast(null), 3000);
    setDeletingCustomer(null);
  };

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <h2 className="text-2xl font-bold text-foreground">
        <i className="fa-solid fa-users mr-3 text-secondary" />Clientes
      </h2>

      <div className="flex flex-wrap gap-4">
        <div className="flex gap-2 max-w-sm flex-1">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && load()}
            className="input-touch flex-1"
            placeholder="Buscar por nombre o teléfono..."
          />
          <button
            onClick={load}
            className="touch-btn bg-secondary/10 text-secondary px-4 py-2 rounded-xl font-semibold flex items-center gap-2 hover:bg-secondary/20"
          >
            <i className="fa-solid fa-magnifying-glass" />Buscar
          </button>
        </div>
        <button
          onClick={handleNew}
          className="touch-btn bg-accent text-accent-foreground px-4 py-2 rounded-xl font-semibold flex items-center gap-2"
        >
          <i className="fa-solid fa-user-plus" />Nuevo
        </button>
      </div>

      {/* List */}
      {loading ? (
        <div className="text-center py-12"><i className="fa-solid fa-spinner fa-spin text-3xl text-accent" /></div>
      ) : (
        <div className="pos-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left p-3 text-secondary font-semibold">Nombre</th>
                <th className="text-left p-3 text-secondary font-semibold">Placa</th>
                <th className="text-left p-3 text-secondary font-semibold">Teléfono</th>
                <th className="text-left p-3 text-secondary font-semibold">Correo</th>
                <th className="text-center p-3 text-secondary font-semibold">Programa de Lealtad</th>
                <th className="p-3 text-secondary font-semibold">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => {
                const visits = c.loyalty_visits || 0;
                const freeWashesAvailable = (c.loyalty_free_washes_earned || 0) - (c.loyalty_free_washes_used || 0);
                const progressToNextFree = visits % 9;
                const progressPercent = (progressToNextFree / 9) * 100;

                return (
                  <tr key={c.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="p-3 text-foreground font-medium">
                      {c.name} {c.is_general && <span className="text-xs text-secondary">(General)</span>}
                    </td>
                    <td className="p-3 text-muted-foreground">{c.plate}</td>
                    <td className="p-3 text-muted-foreground">{c.phone}</td>
                    <td className="p-3 text-muted-foreground">{c.email}</td>
                    <td className="p-3">
                      {!c.is_general && (
                        <div className="flex flex-col items-center gap-1">
                          <div className="flex items-center gap-2 text-xs">
                            <span className="font-semibold text-primary">{visits} visitas</span>
                            {freeWashesAvailable > 0 && (
                              <span className="px-2 py-0.5 rounded-full bg-accent/20 text-accent font-bold">
                                <i className="fa-solid fa-gift mr-1" />
                                {freeWashesAvailable} gratis
                              </span>
                            )}
                          </div>
                          <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-primary to-accent transition-all duration-300"
                              style={{ width: `${progressPercent}%` }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {9 - progressToNextFree} lavados para pasteado gratis
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="p-3">
                      {!c.is_general && (
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleEdit(c)}
                            className="touch-btn p-2 text-secondary hover:text-foreground"
                            title="Editar"
                          >
                            <i className="fa-solid fa-pen" />
                          </button>
                          {canDelete && (
                            <button
                              onClick={() => setDeletingCustomer(c)}
                              className="touch-btn p-2 text-destructive hover:text-red-600"
                              title="Eliminar"
                            >
                              <i className="fa-solid fa-trash-can" />
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {customers.length === 0 && <p className="text-center py-8 text-muted-foreground">Sin clientes</p>}
        </div>
      )}

      {/* Customer Form Modal */}
      {showModal && (
        <CustomerFormModal
          customer={editingCustomer}
          onClose={() => setShowModal(false)}
          onSave={handleSave}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deletingCustomer && (
        <div className="modal-overlay" onClick={() => setDeletingCustomer(null)}>
          <div className="modal-content animate-scale-in max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-foreground">
                <i className="fa-solid fa-triangle-exclamation mr-2 text-destructive" />
                Confirmar eliminación
              </h2>
              <button onClick={() => setDeletingCustomer(null)} className="touch-btn p-2 text-muted-foreground">
                <i className="fa-solid fa-xmark text-xl" />
              </button>
            </div>
            <p className="text-foreground mb-6">
              ¿Estás seguro de que deseas eliminar al cliente <strong>{deletingCustomer.name}</strong>?
              Esta acción no se puede deshacer.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setDeletingCustomer(null)}
                className="touch-btn flex-1 py-3 rounded-xl border border-border text-foreground font-semibold"
              >
                Cancelar
              </button>
              <button
                onClick={handleDeleteConfirm}
                className="flex-1 py-3 rounded-xl bg-destructive text-white font-semibold hover:bg-red-600 transition-colors"
              >
                <i className="fa-solid fa-trash-can mr-2" />
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && <div className="toast-success"><i className="fa-solid fa-circle-check mr-2" />{toast}</div>}
    </div>
  );
}
