import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { validatePlate, validateEmail, sanitizePlate } from "@/utils/validation";

interface Customer {
    id: number;
    name: string;
    phone: string;
    plate: string;
    email: string;
    is_general: boolean;
}

interface Props {
    customer: Customer | null;
    onClose: () => void;
    onSave: () => void;
}

export default function CustomerFormModal({ customer, onClose, onSave }: Props) {
    const [form, setForm] = useState({ name: "", phone: "", plate: "", email: "" });
    const [errors, setErrors] = useState<{ plate?: string; email?: string }>({});
    const [toast, setToast] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (customer) {
            setForm({
                name: customer.name,
                phone: customer.phone,
                plate: customer.plate,
                email: customer.email || "",
            });
        } else {
            setForm({ name: "", phone: "", plate: "", email: "" });
        }
        setErrors({});
    }, [customer]);

    const handleSave = async () => {
        if (!form.name.trim()) {
            setToast("El nombre es requerido");
            setTimeout(() => setToast(null), 3000);
            return;
        }

        // Validate plate
        const plateValidation = validatePlate(form.plate);
        if (!plateValidation.isValid) {
            setErrors({ ...errors, plate: plateValidation.error });
            setToast(plateValidation.error || "Error en la placa");
            setTimeout(() => setToast(null), 3000);
            return;
        }

        // Validate email
        const emailValidation = validateEmail(form.email);
        if (!emailValidation.isValid) {
            setErrors({ ...errors, email: emailValidation.error });
            setToast(emailValidation.error || "Error en el correo");
            setTimeout(() => setToast(null), 3000);
            return;
        }

        setErrors({});
        setSaving(true);

        try {
            if (customer) {
                await supabase.from("customers").update(form).eq("id", customer.id);
            } else {
                await supabase.from("customers").insert(form);
            }
            onSave();
            onClose();
        } catch (err: any) {
            setToast(err.message || "Error al guardar");
            setTimeout(() => setToast(null), 3000);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content animate-scale-in" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-bold text-foreground">
                        <i className="fa-solid fa-user mr-2 text-secondary" />
                        {customer ? "Editar cliente" : "Nuevo cliente"}
                    </h2>
                    <button onClick={onClose} className="touch-btn p-2 text-muted-foreground">
                        <i className="fa-solid fa-xmark text-xl" />
                    </button>
                </div>

                <div className="space-y-3">
                    <div>
                        <input
                            value={form.name}
                            onChange={(e) => setForm({ ...form, name: e.target.value })}
                            className="input-touch"
                            placeholder="Nombre *"
                            autoFocus
                        />
                    </div>
                    <div>
                        <input
                            value={form.phone}
                            onChange={(e) => setForm({ ...form, phone: e.target.value })}
                            className="input-touch"
                            placeholder="Teléfono"
                        />
                    </div>
                    <div>
                        <input
                            value={form.plate}
                            onChange={(e) => {
                                const sanitized = sanitizePlate(e.target.value);
                                setForm({ ...form, plate: sanitized });
                                if (sanitized) {
                                    const validation = validatePlate(sanitized);
                                    setErrors({ ...errors, plate: validation.error });
                                } else {
                                    setErrors({ ...errors, plate: undefined });
                                }
                            }}
                            className={`input-touch ${errors.plate ? "border-red-500" : ""}`}
                            placeholder="Placa (solo letras y números)"
                        />
                        {errors.plate && <p className="text-xs text-red-500 mt-1">{errors.plate}</p>}
                    </div>
                    <div>
                        <input
                            value={form.email}
                            onChange={(e) => {
                                setForm({ ...form, email: e.target.value });
                                if (e.target.value.trim()) {
                                    const validation = validateEmail(e.target.value);
                                    setErrors({ ...errors, email: validation.error });
                                } else {
                                    setErrors({ ...errors, email: undefined });
                                }
                            }}
                            className={`input-touch ${errors.email ? "border-red-500" : ""}`}
                            placeholder="Correo electrónico"
                            type="email"
                        />
                        {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email}</p>}
                    </div>

                    <div className="flex gap-2 pt-2">
                        <button
                            onClick={onClose}
                            className="touch-btn flex-1 py-3 rounded-xl border border-border text-foreground font-semibold"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className="btn-cobrar flex-1 flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            <i className="fa-solid fa-floppy-disk" />
                            {saving ? "Guardando..." : "Guardar"}
                        </button>
                    </div>
                </div>

                {toast && (
                    <div className="toast-error fixed bottom-4 right-4 z-50">
                        <i className="fa-solid fa-circle-exclamation mr-2" />
                        {toast}
                    </div>
                )}
            </div>
        </div>
    );
}
