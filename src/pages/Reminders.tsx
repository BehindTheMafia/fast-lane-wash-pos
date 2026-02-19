import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { differenceInDays } from "date-fns";

interface Customer {
    id: number;
    name: string;
    phone: string;
    plate: string;
    is_general: boolean;
    loyalty_last_visit: string | null;
}

export default function Reminders() {
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterActive, setFilterActive] = useState(true);

    const load = async () => {
        setLoading(true);
        const { data } = await supabase
            .from("customers")
            .select("id, name, phone, plate, is_general, loyalty_last_visit")
            .eq("is_general", false)
            .order("loyalty_last_visit", { ascending: true });

        setCustomers((data || []) as Customer[]);
        setLoading(false);
    };

    useEffect(() => { load(); }, []);

    const handleWhatsApp = (customer: Customer, days: number) => {
        if (!customer.phone) return;

        let phone = customer.phone.replace(/\D/g, "");
        if (phone.length === 8) phone = "505" + phone;

        const message = `¡Hola ${customer.name}! Te extrañamos en *El Rápido Autolavado* 🚗✨\n\nYa han pasado ${days} días desde tu última visita. ¡Vuelve pronto por un lavado brillante y mantén tu vehículo como nuevo! 🧼💎\n\n¡Te esperamos!`;

        const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
        const base = isMobile ? "https://api.whatsapp.com/send" : "https://web.whatsapp.com/send";
        const url = `${base}?phone=${phone}&text=${encodeURIComponent(message)}`;
        window.open(url, "_blank", "noopener,noreferrer");
    };

    const filteredCustomers = customers.filter(c => {
        if (!c.loyalty_last_visit) return !filterActive; // If no visit, only show in "All"
        const days = differenceInDays(new Date(), new Date(c.loyalty_last_visit));
        return filterActive ? days >= 15 : true;
    });

    return (
        <div className="p-6 space-y-6 animate-fade-in">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <h2 className="text-2xl font-bold text-foreground">
                    <i className="fa-solid fa-bell mr-3 text-secondary" />Recordatorios
                </h2>
                <div className="flex bg-muted p-1 rounded-xl">
                    <button
                        onClick={() => setFilterActive(true)}
                        className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${filterActive ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                    >
                        Inactivos (15+ días)
                    </button>
                    <button
                        onClick={() => setFilterActive(false)}
                        className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${!filterActive ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                    >
                        Todos
                    </button>
                </div>
            </div>

            <div className="pos-card overflow-hidden">
                {loading ? (
                    <div className="text-center py-12"><i className="fa-solid fa-spinner fa-spin text-3xl text-accent" /></div>
                ) : (
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-border bg-muted/50">
                                <th className="text-left p-4 text-secondary font-semibold">Cliente</th>
                                <th className="text-left p-4 text-secondary font-semibold">Placa</th>
                                <th className="text-left p-4 text-secondary font-semibold">Última Visita</th>
                                <th className="text-left p-4 text-secondary font-semibold">Inactividad</th>
                                <th className="text-center p-4 text-secondary font-semibold">Acción</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredCustomers.map((c) => {
                                const lastVisit = c.loyalty_last_visit ? new Date(c.loyalty_last_visit) : null;
                                const days = lastVisit ? differenceInDays(new Date(), lastVisit) : 0;
                                const needsReminder = days >= 15;

                                return (
                                    <tr key={c.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                                        <td className="p-4 font-medium text-foreground">{c.name}</td>
                                        <td className="p-4 text-muted-foreground font-mono uppercase">{c.plate || "---"}</td>
                                        <td className="p-4 text-muted-foreground">
                                            {lastVisit ? lastVisit.toLocaleDateString("es-NI") : "Nunca"}
                                        </td>
                                        <td className="p-4">
                                            {lastVisit ? (
                                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${needsReminder ? "bg-red-100 text-red-800" : "bg-green-100 text-green-800"}`}>
                                                    Hace {days} días
                                                </span>
                                            ) : (
                                                <span className="text-muted-foreground italic text-xs">Sin registros</span>
                                            )}
                                        </td>
                                        <td className="p-4 text-center">
                                            <button
                                                disabled={!c.phone}
                                                onClick={() => handleWhatsApp(c, days)}
                                                className={`touch-btn inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${c.phone
                                                        ? "bg-[#25D366] text-white hover:scale-105 active:scale-95 shadow-sm"
                                                        : "bg-muted text-muted-foreground cursor-not-allowed"
                                                    }`}
                                            >
                                                <i className="fa-brands fa-whatsapp text-sm" />
                                                Enviar Recordatorio
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
                {!loading && filteredCustomers.length === 0 && (
                    <div className="text-center py-12 text-muted-foreground">
                        <i className="fa-solid fa-check-circle text-4xl mb-3 opacity-20" />
                        <p>No hay clientes que requieran recordatorio en este momento.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
