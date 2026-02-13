import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { validatePlate, validateEmail, sanitizePlate } from "@/utils/validation";

interface Customer {
  id: string;
  name: string;
  plate: string;
  phone: string;
  email?: string;
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
  const [newEmail, setNewEmail] = useState("");
  const [errors, setErrors] = useState<{ plate?: string; email?: string }>({});
  const [toast, setToast] = useState<string | null>(null);

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
    if (!newName.trim()) {
      setToast("El nombre es requerido");
      setTimeout(() => setToast(null), 3000);
      return;
    }

    // Validate plate
    const plateValidation = validatePlate(newPlate);
    if (!plateValidation.isValid) {
      setErrors({ ...errors, plate: plateValidation.error });
      setToast(plateValidation.error || "Error en la placa");
      setTimeout(() => setToast(null), 3000);
      return;
    }

    // Validate email
    const emailValidation = validateEmail(newEmail);
    if (!emailValidation.isValid) {
      setErrors({ ...errors, email: emailValidation.error });
      setToast(emailValidation.error || "Error en el correo");
      setTimeout(() => setToast(null), 3000);
      return;
    }

    setErrors({});

    const { data, error } = await supabase
      .from("customers")
      .insert({
        name: newName.trim(),
        plate: newPlate.trim(),
        phone: newPhone.trim(),
        email: newEmail.trim()
      })
      .select()
      .single();
    if (!error && data) {
      onSelect(data as Customer);
    } else if (error) {
      setToast("Error al crear cliente");
      setTimeout(() => setToast(null), 3000);
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
            <div className="flex gap-2 mb-4">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    // Search is already reactive via useEffect
                  }
                }}
                className="input-touch flex-1"
                placeholder="Buscar por nombre, placa o teléfono..."
              />
              <button
                onClick={() => setSearch(search)}
                className="touch-btn bg-secondary/10 text-secondary px-4 py-2 rounded-xl font-semibold flex items-center gap-2 hover:bg-secondary/20"
              >
                <i className="fa-solid fa-magnifying-glass" />
              </button>
            </div>
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
            <div>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="input-touch"
                placeholder="Nombre completo *"
              />
            </div>
            <div>
              <input
                value={newPlate}
                onChange={(e) => {
                  const sanitized = sanitizePlate(e.target.value);
                  setNewPlate(sanitized);
                  if (sanitized) {
                    const validation = validatePlate(sanitized);
                    setErrors({ ...errors, plate: validation.error });
                  } else {
                    setErrors({ ...errors, plate: undefined });
                  }
                }}
                className={`input-touch ${errors.plate ? 'border-red-500' : ''}`}
                placeholder="Placa (solo letras y números)"
              />
              {errors.plate && <p className="text-xs text-red-500 mt-1">{errors.plate}</p>}
            </div>
            <div>
              <input
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                className="input-touch"
                placeholder="Teléfono"
              />
            </div>
            <div>
              <input
                value={newEmail}
                onChange={(e) => {
                  setNewEmail(e.target.value);
                  if (e.target.value.trim()) {
                    const validation = validateEmail(e.target.value);
                    setErrors({ ...errors, email: validation.error });
                  } else {
                    setErrors({ ...errors, email: undefined });
                  }
                }}
                className={`input-touch ${errors.email ? 'border-red-500' : ''}`}
                placeholder="Correo electrónico"
                type="email"
              />
              {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email}</p>}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setCreating(false);
                  setErrors({});
                  setNewName("");
                  setNewPlate("");
                  setNewPhone("");
                  setNewEmail("");
                }}
                className="touch-btn flex-1 py-3 rounded-xl border border-border text-foreground font-semibold"
              >
                Cancelar
              </button>
              <button onClick={handleCreate} className="btn-cobrar flex-1 flex items-center justify-center gap-2">
                <i className="fa-solid fa-user-plus" />Guardar
              </button>
            </div>
          </div>
        )}
      </div>
      {toast && <div className="toast-error fixed bottom-4 right-4 z-50"><i className="fa-solid fa-circle-exclamation mr-2" />{toast}</div>}
    </div>
  );
}
