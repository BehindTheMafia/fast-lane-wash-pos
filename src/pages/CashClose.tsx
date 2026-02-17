import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useBusinessSettings } from "@/hooks/useBusinessSettings";

export default function CashClose() {
  const { user, profile } = useAuth();
  const { data: settings } = useBusinessSettings();
  const [initialBalance, setInitialBalance] = useState("0");
  const [shift, setShift] = useState("Matutino");
  const [observations, setObservations] = useState("");
  const [countedTotal, setCountedTotal] = useState("0");
  const [bills, setBills] = useState<Record<string, number>>({});
  const [coins, setCoins] = useState<Record<string, number>>({});
  const [expenses, setExpenses] = useState<{ description: string; amount: string; category: string }[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [dayStats, setDayStats] = useState({ cashNIO: 0, cashUSD: 0, card: 0, transfer: 0 });
  const [showConfirmation, setShowConfirmation] = useState(false);

  const calculateTotal = (billsObj: Record<string, number>, coinsObj: Record<string, number>) => {
    let total = 0;
    // Bills
    [1000, 500, 200, 100, 50, 20, 10].forEach(denom => {
      total += (billsObj[`bill_${denom}`] || 0) * denom;
    });
    // Coins
    [5, 1, 0.5, 0.25, 0.10, 0.05].forEach(denom => {
      total += (coinsObj[`coin_${denom}`] || 0) * denom;
    });
    setCountedTotal(total.toFixed(2));
  };

  useEffect(() => {
    loadHistory();
    loadDayStats();
  }, []);

  const loadHistory = async () => {
    const { data } = await supabase
      .from("cash_closures")
      .select("*")
      .order("closed_at", { ascending: false })
      .limit(10);
    if (data) setHistory(data);
  };

  const loadDayStats = async () => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const { data: payments } = await supabase
      .from("payments")
      .select("*")
      .gte("created_at", today.toISOString());

    if (!payments) return;
    let cashNIO = 0, cashUSD = 0, card = 0, transfer = 0;
    payments.forEach((p: any) => {
      if (p.payment_method === "cash") {
        if (p.currency === "USD") cashUSD += Number(p.amount);
        else cashNIO += Number(p.amount);
      } else if (p.payment_method === "card") card += Number(p.amount);
      else transfer += Number(p.amount);
    });
    setDayStats({ cashNIO, cashUSD, card, transfer });
  };

  const totalExpenses = expenses.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
  const expected = parseFloat(initialBalance) + dayStats.cashNIO - totalExpenses;
  const counted = parseFloat(countedTotal) || 0;
  const difference = counted - expected;

  const addExpense = () => setExpenses([...expenses, { description: "", amount: "0", category: "caja_chica" }]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    const { data: closure, error } = await supabase.from("cash_closures").insert({
      cashier_id: user.id,
      shift,
      initial_balance: parseFloat(initialBalance),
      total_cash_nio: dayStats.cashNIO,
      total_cash_usd: dayStats.cashUSD,
      total_card: dayStats.card,
      total_transfer: dayStats.transfer,
      total_expenses: totalExpenses,
      expected_total: expected,
      counted_total: counted,
      difference,
      bills_count: bills,
      coins_count: coins,
      observations,
    }).select().single();

    if (!error && closure) {
      for (const exp of expenses) {
        if (exp.description.trim()) {
          await supabase.from("cash_expenses").insert({
            closure_id: closure.id,
            category: exp.category,
            description: exp.description,
            amount: parseFloat(exp.amount) || 0,
          });
        }
      }
      setToast("Cierre guardado correctamente");
      setTimeout(() => setToast(null), 3000);
      loadHistory();
      setExpenses([]);
      setObservations("");
      setBills({});
      setCoins({});
      setCountedTotal("0");
    }
    setSaving(false);
  };

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <h2 className="text-2xl font-bold text-foreground">
        <i className="fa-solid fa-vault mr-3 text-secondary" />Cierre de Caja
      </h2>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Form */}
        <div className="space-y-4">
          <div className="pos-card p-4 space-y-3">
            <h3 className="font-bold text-foreground"><i className="fa-solid fa-info-circle mr-2 text-secondary" />Información</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-foreground">Negocio</label>
                <p className="text-sm text-secondary">{settings?.business_name}</p>
              </div>
              <div>
                <label className="text-xs font-semibold text-foreground">Responsable</label>
                <p className="text-sm text-secondary">{profile?.full_name}</p>
              </div>
              <div>
                <label className="text-xs font-semibold text-foreground">Turno</label>
                <select value={shift} onChange={(e) => setShift(e.target.value)} className="input-touch">
                  <option>Matutino</option><option>Vespertino</option><option>Nocturno</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-foreground">Saldo inicial (C$)</label>
                <input type="number" value={initialBalance} onChange={(e) => setInitialBalance(e.target.value)} className="input-touch" />
              </div>
            </div>
          </div>

          {/* Day income */}
          <div className="pos-card p-4">
            <h3 className="font-bold text-foreground mb-3"><i className="fa-solid fa-arrow-trend-up mr-2 text-secondary" />Ingresos del día</h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="flex justify-between"><span className="text-secondary">Efectivo C$:</span><span className="font-semibold">C${dayStats.cashNIO.toFixed(2)}</span></div>
              <div className="flex justify-between"><span className="text-secondary">Efectivo USD:</span><span className="font-semibold">${dayStats.cashUSD.toFixed(2)}</span></div>
              <div className="flex justify-between"><span className="text-secondary">Tarjeta:</span><span className="font-semibold">C${dayStats.card.toFixed(2)}</span></div>
              <div className="flex justify-between"><span className="text-secondary">Transferencia:</span><span className="font-semibold">C${dayStats.transfer.toFixed(2)}</span></div>
            </div>
          </div>

          {/* Expenses */}
          <div className="pos-card p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-foreground"><i className="fa-solid fa-arrow-trend-down mr-2 text-secondary" />Egresos</h3>
              <button onClick={addExpense} className="touch-btn text-sm bg-accent/10 text-accent px-3 py-1 rounded-lg">
                <i className="fa-solid fa-plus mr-1" />Agregar
              </button>
            </div>
            {expenses.map((exp, i) => (
              <div key={i} className="flex gap-2 mb-2">
                <select value={exp.category} onChange={(e) => { const n = [...expenses]; n[i].category = e.target.value; setExpenses(n); }} className="input-touch w-32">
                  <option value="caja_chica">Caja chica</option>
                  <option value="compras">Compras</option>
                  <option value="proveedores">Proveedores</option>
                  <option value="retiros">Retiros</option>
                </select>
                <input value={exp.description} onChange={(e) => { const n = [...expenses]; n[i].description = e.target.value; setExpenses(n); }} className="input-touch flex-1" placeholder="Descripción" />
                <input type="number" value={exp.amount} onChange={(e) => { const n = [...expenses]; n[i].amount = e.target.value; setExpenses(n); }} className="input-touch w-24" />
                <button onClick={() => setExpenses(expenses.filter((_, j) => j !== i))} className="touch-btn text-destructive p-2"><i className="fa-solid fa-trash-can" /></button>
              </div>
            ))}
            {expenses.length === 0 && <p className="text-sm text-muted-foreground">Sin egresos registrados</p>}
          </div>

          {/* Counted - Bill/Coin Counter */}
          <div className="pos-card p-4 space-y-3">
            <h3 className="font-bold text-foreground"><i className="fa-solid fa-calculator mr-2 text-secondary" />Conteo físico</h3>

            {/* Bills */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2">Billetes (C$)</p>
              <div className="grid grid-cols-3 gap-2">
                {[1000, 500, 200, 100, 50, 20, 10].map(denom => {
                  const key = `bill_${denom}`;
                  const count = (bills as any)[key] || 0;
                  return (
                    <div key={denom} className="flex items-center gap-1 bg-background border border-border rounded p-1">
                      <span className="text-xs text-secondary w-12">{denom}</span>
                      <input
                        type="number"
                        value={count}
                        onChange={(e) => {
                          const newBills = { ...bills, [key]: parseInt(e.target.value) || 0 };
                          setBills(newBills);
                          calculateTotal(newBills, coins);
                        }}
                        className="w-full px-1 py-0.5 bg-background border-0 text-xs text-right focus:outline-none focus:ring-1 focus:ring-brick-red/50 rounded"
                        min={0}
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Coins */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2">Monedas (C$)</p>
              <div className="grid grid-cols-3 gap-2">
                {[5, 1, 0.5, 0.25, 0.10, 0.05].map(denom => {
                  const key = `coin_${denom}`;
                  const count = (coins as any)[key] || 0;
                  return (
                    <div key={denom} className="flex items-center gap-1 bg-background border border-border rounded p-1">
                      <span className="text-xs text-secondary w-12">{denom}</span>
                      <input
                        type="number"
                        value={count}
                        onChange={(e) => {
                          const newCoins = { ...coins, [key]: parseInt(e.target.value) || 0 };
                          setCoins(newCoins);
                          calculateTotal(bills, newCoins);
                        }}
                        className="w-full px-1 py-0.5 bg-background border-0 text-xs text-right focus:outline-none focus:ring-1 focus:ring-brick-red/50 rounded"
                        min={0}
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Total calculated */}
            <div className="pt-3 border-t border-border">
              <div className="flex justify-between items-center">
                <span className="text-sm font-semibold text-foreground">Total contado:</span>
                <span className="text-2xl font-bold text-primary">C${counted.toFixed(2)}</span>
              </div>
            </div>

            <textarea value={observations} onChange={(e) => setObservations(e.target.value)} className="input-touch" rows={2} placeholder="Observaciones..." />
          </div>
        </div>

        {/* Summary */}
        <div className="space-y-4">
          <div className="pos-card p-6">
            <h3 className="font-bold text-foreground mb-4"><i className="fa-solid fa-chart-column mr-2 text-secondary" />Resultado</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-secondary">Esperado:</span><span className="font-bold text-foreground">C${expected.toFixed(2)}</span></div>
              <div className="flex justify-between"><span className="text-secondary">Contado:</span><span className="font-bold text-foreground">C${counted.toFixed(2)}</span></div>
              <div className={`flex justify-between pt-2 border-t border-border ${difference >= 0 ? "" : "text-destructive"}`}>
                <span className="font-bold">Diferencia:</span>
                <span className="font-bold text-lg">{difference >= 0 ? "+" : ""}C${difference.toFixed(2)}</span>
              </div>
            </div>
            <button onClick={() => setShowConfirmation(true)} disabled={saving} className="btn-cobrar w-full mt-4 flex items-center justify-center gap-2">
              {saving ? <i className="fa-solid fa-spinner fa-spin" /> : <><i className="fa-solid fa-floppy-disk" />Guardar cierre</>}
            </button>
          </div>

          {/* History */}
          <div className="pos-card p-4">
            <h3 className="font-bold text-foreground mb-3"><i className="fa-solid fa-history mr-2 text-secondary" />Histórico</h3>
            <div className="space-y-2 max-h-60 overflow-auto">
              {history.map((h: any) => (
                <div key={h.id} className="p-3 border border-border rounded-lg text-xs">
                  <div className="flex justify-between">
                    <span className="text-secondary">{new Date(h.closed_at).toLocaleDateString("es-NI")}</span>
                    <span className="font-bold">{h.shift}</span>
                  </div>
                  <div className="flex justify-between mt-1">
                    <span>Esperado: C${Number(h.expected_total).toFixed(0)}</span>
                    <span>Contado: C${Number(h.counted_total).toFixed(0)}</span>
                    <span className={Number(h.difference) >= 0 ? "text-accent" : "text-destructive"}>
                      Dif: {Number(h.difference) >= 0 ? "+" : ""}C${Number(h.difference).toFixed(0)}
                    </span>
                  </div>
                </div>
              ))}
              {history.length === 0 && <p className="text-sm text-muted-foreground">Sin cierres previos</p>}
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirmation && (
        <div className="modal-overlay" onClick={() => setShowConfirmation(false)}>
          <div className="modal-content animate-scale-in max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-foreground">
                <i className="fa-solid fa-triangle-exclamation mr-2 text-amber-500" />
                Confirmar Cierre de Caja
              </h2>
              <button onClick={() => setShowConfirmation(false)} className="touch-btn p-2 text-muted-foreground">
                <i className="fa-solid fa-xmark text-xl" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
                <p className="text-sm text-foreground font-semibold mb-2">
                  <i className="fa-solid fa-info-circle mr-2 text-amber-500" />
                  Importante:
                </p>
                <p className="text-sm text-muted-foreground">
                  Una vez guardado, el cierre de caja <strong>NO puede ser editado ni eliminado</strong>.
                  Por favor verifica que toda la información sea correcta.
                </p>
              </div>

              <div className="pos-card p-4 space-y-2 text-sm">
                <h3 className="font-bold text-foreground mb-3">Resumen del cierre:</h3>
                <div className="flex justify-between">
                  <span className="text-secondary">Turno:</span>
                  <span className="font-semibold">{shift}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-secondary">Saldo inicial:</span>
                  <span className="font-semibold">C${parseFloat(initialBalance).toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-secondary">Total esperado:</span>
                  <span className="font-semibold">C${expected.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-secondary">Total contado:</span>
                  <span className="font-semibold">C${counted.toFixed(2)}</span>
                </div>
                <div className="flex justify-between pt-2 border-t border-border">
                  <span className="font-bold">Diferencia:</span>
                  <span className={`font-bold ${difference >= 0 ? "text-accent" : "text-destructive"}`}>
                    {difference >= 0 ? "+" : ""}C${difference.toFixed(2)}
                  </span>
                </div>
                {totalExpenses > 0 && (
                  <div className="flex justify-between">
                    <span className="text-secondary">Egresos totales:</span>
                    <span className="font-semibold">C${totalExpenses.toFixed(2)}</span>
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setShowConfirmation(false)}
                  className="touch-btn flex-1 py-3 rounded-xl border border-border text-foreground font-semibold"
                >
                  <i className="fa-solid fa-arrow-left mr-2" />
                  Revisar
                </button>
                <button
                  onClick={() => {
                    setShowConfirmation(false);
                    handleSave();
                  }}
                  className="flex-1 py-3 rounded-xl bg-accent text-accent-foreground font-semibold hover:bg-accent/90 transition-colors"
                >
                  <i className="fa-solid fa-check mr-2" />
                  Confirmar y Guardar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast-success"><i className="fa-solid fa-circle-check mr-2" />{toast}</div>}
    </div>
  );
}
