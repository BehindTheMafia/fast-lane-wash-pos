import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

interface Customer {
  id: string;
  name: string;
  plate: string;
  phone: string;
  is_general: boolean;
}

interface Props {
  current: Customer | null;
  onSelect: (c: Customer) => void;
  onClose: () => void;
}

export default function CustomerModal({ current, onSelect, onClose }: Props) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Customer[]>([]);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPlate, setNewPlate] = useState("");
  const [newPhone, setNewPhone] = useState("");

  useEffect(() => {
    const q = search.trim();
    if (q.length < 1) {
      supabase.from("customers").select("*").order("name").limit(20).then(({ data }) => {
        if (data) setResults(data as Customer[]);
      });
      return;
    }
    supabase
      .from("customers")
      .select("*")
      .or(`name.ilike.%${q}%,plate.ilike.%${q}%,phone.ilike.%${q}%`)
      .limit(20)
      .then(({ data }) => {
        if (data) setResults(data as Customer[]);
      });
  }, [search]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    const { data, error } = await supabase
      .from("customers")
      .insert({ name: newName.trim(), plate: newPlate.trim(), phone: newPhone.trim() })
      .select()
      .single();
    if (!error && data) {
      onSelect(data as Customer);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content animate-scale-in" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-foreground">
            <i className="fa-solid fa-users mr-2 text-secondary" />Seleccionar Cliente
          </h2>
          <button onClick={onClose} className="touch-btn p-2 text-muted-foreground"><i className="fa-solid fa-xmark text-xl" /></button>
        </div>

        {!creating ? (
          <>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-touch mb-4"
              placeholder="Buscar por nombre, placa o teléfono..."
            />
            <div className="space-y-2 max-h-60 overflow-auto mb-4">
              {results.map((c) => (
                <button
                  key={c.id}
                  onClick={() => onSelect(c)}
                  className={`pos-card p-3 w-full text-left touch-btn flex items-center gap-3 ${current?.id === c.id ? "service-card-active" : ""}`}
                >
                  <i className={`fa-solid ${c.is_general ? "fa-user" : "fa-user-tag"} text-secondary`} />
                  <div className="flex-1">
                    <p className="font-semibold text-sm text-foreground">{c.name}</p>
                    <p className="text-xs text-muted-foreground">{c.plate && `Placa: ${c.plate}`} {c.phone && `Tel: ${c.phone}`}</p>
                  </div>
                  {current?.id === c.id && <i className="fa-solid fa-circle-check text-brick-red" />}
                </button>
              ))}
            </div>
            <button onClick={() => setCreating(true)} className="touch-btn w-full bg-accent/10 text-accent py-3 rounded-xl font-semibold flex items-center justify-center gap-2">
              <i className="fa-solid fa-user-plus" />Crear nuevo cliente
            </button>
          </>
        ) : (
          <div className="space-y-3">
            <input value={newName} onChange={(e) => setNewName(e.target.value)} className="input-touch" placeholder="Nombre completo" />
            <input value={newPlate} onChange={(e) => setNewPlate(e.target.value)} className="input-touch" placeholder="Placa del vehículo" />
            <input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} className="input-touch" placeholder="Teléfono" />
            <div className="flex gap-2">
              <button onClick={() => setCreating(false)} className="touch-btn flex-1 py-3 rounded-xl border border-border text-foreground font-semibold">
                Cancelar
              </button>
              <button onClick={handleCreate} className="btn-cobrar flex-1 flex items-center justify-center gap-2">
                <i className="fa-solid fa-user-plus" />Guardar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
