import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

interface Customer {
  id: string;
  name: string;
  phone: string;
  plate: string;
  email: string;
  is_general: boolean;
  created_at: string;
}

export default function Customers() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", plate: "", email: "" });
  const [toast, setToast] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    let q = supabase.from("customers").select("*").order("name");
    if (search.trim()) q = q.or(`name.ilike.%${search}%,plate.ilike.%${search}%,phone.ilike.%${search}%`);
    const { data } = await q.limit(100);
    setCustomers((data || []) as Customer[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, [search]);

  const handleSave = async () => {
    if (!form.name.trim()) return;
    if (editing) {
      await supabase.from("customers").update(form).eq("id", editing.id);
    } else {
      await supabase.from("customers").insert(form);
    }
    setEditing(null);
    setForm({ name: "", phone: "", plate: "", email: "" });
    setToast(editing ? "Cliente actualizado" : "Cliente creado");
    setTimeout(() => setToast(null), 3000);
    load();
  };

  const startEdit = (c: Customer) => {
    setEditing(c);
    setForm({ name: c.name, phone: c.phone, plate: c.plate, email: c.email });
  };

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <h2 className="text-2xl font-bold text-foreground">
        <i className="fa-solid fa-users mr-3 text-secondary" />Clientes
      </h2>

      <div className="flex flex-wrap gap-4">
        <input value={search} onChange={(e) => setSearch(e.target.value)} className="input-touch max-w-sm" placeholder="Buscar por nombre, placa, teléfono..." />
        <button onClick={() => { setEditing(null); setForm({ name: "", phone: "", plate: "", email: "" }); }} className="touch-btn bg-accent text-accent-foreground px-4 py-2 rounded-xl font-semibold flex items-center gap-2">
          <i className="fa-solid fa-user-plus" />Nuevo
        </button>
      </div>

      {/* Form */}
      {(editing !== null || form.name !== "") && (
        <div className="pos-card p-4 space-y-3">
          <h3 className="font-bold text-foreground">{editing ? "Editar cliente" : "Nuevo cliente"}</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input-touch" placeholder="Nombre" />
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="input-touch" placeholder="Teléfono" />
            <input value={form.plate} onChange={(e) => setForm({ ...form, plate: e.target.value })} className="input-touch" placeholder="Placa" />
            <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="input-touch" placeholder="Correo" />
          </div>
          <div className="flex gap-2">
            <button onClick={handleSave} className="btn-cobrar px-6 py-2 text-sm"><i className="fa-solid fa-floppy-disk mr-2" />Guardar</button>
            <button onClick={() => { setEditing(null); setForm({ name: "", phone: "", plate: "", email: "" }); }} className="touch-btn px-4 py-2 border border-border rounded-xl text-foreground text-sm">Cancelar</button>
          </div>
        </div>
      )}

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
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="p-3 text-foreground font-medium">{c.name} {c.is_general && <span className="text-xs text-secondary">(General)</span>}</td>
                  <td className="p-3 text-muted-foreground">{c.plate}</td>
                  <td className="p-3 text-muted-foreground">{c.phone}</td>
                  <td className="p-3 text-muted-foreground">{c.email}</td>
                  <td className="p-3">
                    {!c.is_general && (
                      <button onClick={() => startEdit(c)} className="touch-btn p-2 text-secondary hover:text-foreground">
                        <i className="fa-solid fa-pen" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {customers.length === 0 && <p className="text-center py-8 text-muted-foreground">Sin clientes</p>}
        </div>
      )}
      {toast && <div className="toast-success"><i className="fa-solid fa-circle-check mr-2" />{toast}</div>}
    </div>
  );
}
