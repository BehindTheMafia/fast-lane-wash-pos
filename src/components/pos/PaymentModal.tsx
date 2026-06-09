import { useState, useRef, useMemo } from "react";

export interface MixedPaymentPart {
  method: "cash" | "card" | "transfer";
  amount: number;    // monto aplicado de esta parte al ticket
  received: number;  // monto físico recibido (relevante para efectivo)
  change: number;    // vuelto entregado (solo efectivo)
}

interface PaymentModalProps {
  total: number;
  exchangeRate: number;
  onClose: () => void;
  onConfirm: (data: {
    currency: string;
    method: string;
    amount: number;
    received: number;
    change: number;
    mixedPayments?: MixedPaymentPart[];
  }) => void;
}

type PaymentMethod = "cash" | "card" | "transfer" | "mixed";
type MixedMethod = "cash" | "card" | "transfer";

const MIXED_METHODS: { id: MixedMethod; label: string; icon: string; color: string; bgActive: string; borderActive: string; bgCard: string; borderCard: string; textColor: string }[] = [
  { id: "cash",     label: "Efectivo",      icon: "fa-money-bills",       color: "text-emerald-600", bgActive: "bg-emerald-100 dark:bg-emerald-900/40", borderActive: "border-emerald-500", bgCard: "bg-emerald-50 dark:bg-emerald-900/20", borderCard: "border-emerald-300 dark:border-emerald-700", textColor: "text-emerald-700 dark:text-emerald-300" },
  { id: "card",     label: "Tarjeta",        icon: "fa-credit-card",       color: "text-blue-600",    bgActive: "bg-blue-100 dark:bg-blue-900/40",       borderActive: "border-blue-500",    bgCard: "bg-blue-50 dark:bg-blue-900/20",      borderCard: "border-blue-300 dark:border-blue-700",      textColor: "text-blue-700 dark:text-blue-300" },
  { id: "transfer", label: "Transferencia",  icon: "fa-building-columns",  color: "text-violet-600",  bgActive: "bg-violet-100 dark:bg-violet-900/40",   borderActive: "border-violet-500",  bgCard: "bg-violet-50 dark:bg-violet-900/20",  borderCard: "border-violet-300 dark:border-violet-700",  textColor: "text-violet-700 dark:text-violet-300" },
];

export default function PaymentModal({ total, exchangeRate, onClose, onConfirm }: PaymentModalProps) {
  const [currency, setCurrency] = useState<"NIO" | "USD">("NIO");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [received, setReceived] = useState("");

  // ── Mixed payment state ────────────────────────────────
  const [mixedActive, setMixedActive] = useState<Record<MixedMethod, boolean>>({ cash: true, card: true, transfer: false });
  const [mixedAmounts, setMixedAmounts] = useState<Record<MixedMethod, string>>({ cash: "", card: "", transfer: "" });
  const [mixedCashReceived, setMixedCashReceived] = useState("");

  const isSubmittingRef = useRef(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const totalInCurrency = currency === "NIO" ? total : +(total / exchangeRate).toFixed(2);
  const symbol = currency === "NIO" ? "C$" : "$";

  // ── Single payment logic ──────────────────────────────
  const receivedNum = parseFloat(received) || 0;
  const change = Math.max(0, receivedNum - totalInCurrency);

  const canConfirmSingle =
    method === "cash"
      ? receivedNum >= totalInCurrency
      : true;

  // ── Mixed payment logic ───────────────────────────────
  const activeMethods = useMemo(() =>
    MIXED_METHODS.filter(m => mixedActive[m.id]),
    [mixedActive]
  );

  // Determine which method auto-fills the remainder (the LAST active method without a manual amount)
  const mixedParsed = useMemo(() => {
    const result: Record<MixedMethod, number> = { cash: 0, card: 0, transfer: 0 };
    activeMethods.forEach(m => {
      result[m.id] = parseFloat(mixedAmounts[m.id]) || 0;
    });
    return result;
  }, [activeMethods, mixedAmounts]);

  // The last active method is the "auto-fill" one: it gets the remaining amount
  const autoFillMethod = useMemo(() => {
    if (activeMethods.length < 2) return null;
    return activeMethods[activeMethods.length - 1].id;
  }, [activeMethods]);

  // Calculate filled total (from methods that are NOT auto-fill)
  const filledTotal = useMemo(() => {
    let sum = 0;
    activeMethods.forEach(m => {
      if (m.id !== autoFillMethod) {
        sum += mixedParsed[m.id];
      }
    });
    return +sum.toFixed(2);
  }, [activeMethods, mixedParsed, autoFillMethod]);

  // The auto-fill amount = total - filledTotal
  const autoFillAmount = useMemo(() => {
    if (!autoFillMethod) return 0;
    return +Math.max(0, totalInCurrency - filledTotal).toFixed(2);
  }, [autoFillMethod, totalInCurrency, filledTotal]);

  // Build final amounts including auto-fill
  const finalAmounts = useMemo(() => {
    const result: Record<MixedMethod, number> = { cash: 0, card: 0, transfer: 0 };
    activeMethods.forEach(m => {
      if (m.id === autoFillMethod) {
        result[m.id] = autoFillAmount;
      } else {
        result[m.id] = mixedParsed[m.id];
      }
    });
    return result;
  }, [activeMethods, autoFillMethod, autoFillAmount, mixedParsed]);

  // Mixed cash received and change
  const mixedCashReceivedNum = parseFloat(mixedCashReceived) || 0;
  const mixedCashApplied = finalAmounts.cash;
  const mixedCashChange = mixedActive.cash
    ? Math.max(0, +(mixedCashReceivedNum - mixedCashApplied).toFixed(2))
    : 0;

  // Total covered by all active methods
  const mixedTotalCovered = useMemo(() => {
    let sum = 0;
    activeMethods.forEach(m => { sum += finalAmounts[m.id]; });
    return +sum.toFixed(2);
  }, [activeMethods, finalAmounts]);

  const mixedValid = useMemo(() => {
    if (activeMethods.length < 2) return false;
    // All non-autofill methods must have amount > 0
    const allFilled = activeMethods.every(m =>
      m.id === autoFillMethod ? autoFillAmount > 0 : mixedParsed[m.id] > 0
    );
    if (!allFilled) return false;
    // Total must match
    if (Math.abs(mixedTotalCovered - totalInCurrency) > 0.01) return false;
    // If cash is active, received must cover the cash amount
    if (mixedActive.cash && mixedCashReceivedNum < mixedCashApplied) return false;
    // No over-allocation: filledTotal must not exceed total
    if (filledTotal > totalInCurrency + 0.01) return false;
    return true;
  }, [activeMethods, autoFillMethod, autoFillAmount, mixedParsed, mixedTotalCovered, totalInCurrency, mixedActive.cash, mixedCashReceivedNum, mixedCashApplied, filledTotal]);

  const canConfirm = method === "mixed" ? mixedValid : canConfirmSingle;

  // ── Toggle a mixed method ──────────────────────────────
  const toggleMixedMethod = (id: MixedMethod) => {
    const newActive = { ...mixedActive, [id]: !mixedActive[id] };
    // Ensure at least 2 methods stay active
    const count = Object.values(newActive).filter(Boolean).length;
    if (count < 2 && !newActive[id]) return; // Can't deactivate if already at 2
    setMixedActive(newActive);
    if (!newActive[id]) {
      setMixedAmounts(prev => ({ ...prev, [id]: "" }));
      if (id === "cash") setMixedCashReceived("");
    }
  };

  // ── Confirm handler ───────────────────────────────────
  const handleConfirm = () => {
    if (isSubmittingRef.current || !canConfirm) return;
    isSubmittingRef.current = true;
    setIsSubmitting(true);

    if (method === "mixed") {
      const parts: MixedPaymentPart[] = [];

      activeMethods.forEach(m => {
        const amt = finalAmounts[m.id];
        if (amt > 0) {
          if (m.id === "cash") {
            parts.push({
              method: "cash",
              amount: +amt.toFixed(2),
              received: mixedCashReceivedNum,
              change: +mixedCashChange.toFixed(2),
            });
          } else {
            parts.push({
              method: m.id,
              amount: +amt.toFixed(2),
              received: +amt.toFixed(2),
              change: 0,
            });
          }
        }
      });

      const totalReceived = parts.reduce((s, p) => s + p.received, 0);
      const totalChange = parts.reduce((s, p) => s + p.change, 0);

      onConfirm({
        currency,
        method: "mixed",
        amount: totalInCurrency,
        received: +totalReceived.toFixed(2),
        change: +totalChange.toFixed(2),
        mixedPayments: parts,
      });
    } else if (method === "cash") {
      onConfirm({ currency, method, amount: totalInCurrency, received: receivedNum, change });
    } else {
      onConfirm({ currency, method, amount: totalInCurrency, received: totalInCurrency, change: 0 });
    }
  };

  // ── Reset mixed state when switching methods ──────────
  const handleMethodChange = (newMethod: PaymentMethod) => {
    setMethod(newMethod);
    setReceived("");
    if (newMethod === "mixed") {
      setMixedActive({ cash: true, card: true, transfer: false });
      setMixedAmounts({ cash: "", card: "", transfer: "" });
      setMixedCashReceived("");
    }
  };

  const paymentMethods: { id: PaymentMethod; label: string; icon: string; description: string; color: string }[] = [
    { id: "cash",     label: "Efectivo",      icon: "fa-money-bills",       description: "Pago en físico",     color: "text-emerald-500" },
    { id: "card",     label: "Tarjeta",        icon: "fa-credit-card",       description: "Débito / Crédito",   color: "text-blue-500" },
    { id: "transfer", label: "Transferencia",  icon: "fa-building-columns",  description: "Bancaria / Móvil",   color: "text-violet-500" },
    { id: "mixed",    label: "Mixto",          icon: "fa-shuffle",           description: "Varios métodos", color: "text-orange-500" },
  ];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content animate-scale-in max-w-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-foreground">
            <i className="fa-solid fa-money-bill-wave mr-2 text-secondary" />Registrar Pago
          </h2>
          <button onClick={onClose} className="touch-btn p-2 text-muted-foreground hover:text-foreground">
            <i className="fa-solid fa-xmark text-xl" />
          </button>
        </div>

        {/* Total display */}
        <div className="pos-card p-4 mb-4 text-center">
          <p className="text-sm text-secondary">Total a cobrar</p>
          <p className="text-3xl font-bold text-primary">
            {symbol}{totalInCurrency.toFixed(2)}
          </p>
          <p className="text-xs text-muted-foreground">
            {currency === "NIO" ? `~$${(total / exchangeRate).toFixed(2)} USD` : `~C$${total.toFixed(2)}`}
          </p>
        </div>

        {/* Currency */}
        <div className="mb-4">
          <p className="text-sm font-semibold text-foreground mb-2">
            <i className="fa-solid fa-coins mr-2 text-secondary" />Moneda
          </p>
          <div className="grid grid-cols-2 gap-2">
            {(["NIO", "USD"] as const).map((c) => (
              <button
                key={c}
                onClick={() => {
                  setCurrency(c);
                  setReceived("");
                  setMixedAmounts({ cash: "", card: "", transfer: "" });
                  setMixedCashReceived("");
                }}
                className={`vehicle-card ${currency === c ? "vehicle-card-active" : ""}`}
              >
                <span className="font-bold">{c === "NIO" ? "C$ Córdobas" : "$ Dólares"}</span>
                {currency === c && <i className="fa-solid fa-circle-check text-brick-red ml-2" />}
              </button>
            ))}
          </div>
        </div>

        {/* Payment Method */}
        <div className="mb-4">
          <p className="text-sm font-semibold text-foreground mb-2">
            <i className="fa-solid fa-credit-card mr-2 text-secondary" />Método de pago
          </p>
          <div className="grid grid-cols-4 gap-2">
            {paymentMethods.map((pm) => {
              const isSelected = method === pm.id;
              return (
                <button
                  key={pm.id}
                  onClick={() => handleMethodChange(pm.id)}
                  className={`vehicle-card flex-col py-3 transition-all duration-200 ${isSelected
                    ? "vehicle-card-active ring-2 ring-primary"
                    : "hover:border-primary/40"
                    }`}
                >
                  <i className={`fa-solid ${pm.icon} text-xl mb-1 ${isSelected ? pm.color : "text-secondary"}`} />
                  <p className="text-xs font-bold leading-tight">{pm.label}</p>
                  <p className="text-[10px] text-muted-foreground leading-tight">{pm.description}</p>
                  {isSelected && <i className={`fa-solid fa-circle-check ${pm.color} text-xs mt-1`} />}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── CASH: received amount input ─────────────────────── */}
        {method === "cash" && (
          <div className="mb-4">
            <label className="text-sm font-semibold text-foreground mb-2 block">
              <i className="fa-solid fa-hand-holding-dollar mr-2 text-secondary" />
              Monto recibido ({symbol})
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={received}
              onChange={(e) => {
                // Allow only numbers and one decimal point
                let val = e.target.value.replace(/[^0-9.]/g, '');
                const parts = val.split('.');
                if (parts.length > 2) val = parts[0] + '.' + parts.slice(1).join('');
                setReceived(val);
              }}
              className="input-touch text-2xl font-bold text-center"
              placeholder="0.00"
              autoFocus
            />
            {receivedNum > 0 && receivedNum < totalInCurrency && (
              <div className="mt-2 p-3 bg-destructive/10 rounded-lg text-center">
                <p className="text-sm text-destructive font-semibold">
                  <i className="fa-solid fa-triangle-exclamation mr-2" />
                  Monto insuficiente. Falta {symbol}{(totalInCurrency - receivedNum).toFixed(2)}
                </p>
              </div>
            )}
            {receivedNum > 0 && receivedNum >= totalInCurrency && (
              <div className="mt-2 pos-card p-3 text-center">
                <p className="text-sm text-secondary">Vuelto</p>
                <p className={`text-2xl font-bold ${change > 0 ? "text-accent" : "text-foreground"}`}>
                  {symbol}{change.toFixed(2)}
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── CARD: info panel ────────────────────────────────── */}
        {method === "card" && (
          <div className="mb-4 p-4 bg-blue-500/10 border border-blue-500/30 rounded-xl flex items-center gap-3">
            <i className="fa-solid fa-credit-card text-2xl text-blue-500" />
            <div>
              <p className="font-semibold text-foreground text-sm">Pago con Tarjeta</p>
              <p className="text-xs text-muted-foreground">
                Monto a cobrar en terminal: <span className="font-bold text-foreground">{symbol}{totalInCurrency.toFixed(2)}</span>
              </p>
            </div>
          </div>
        )}

        {/* ── TRANSFER: info panel ─────────────────────────────── */}
        {method === "transfer" && (
          <div className="mb-4 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center gap-3">
            <i className="fa-solid fa-building-columns text-2xl text-emerald-500" />
            <div>
              <p className="font-semibold text-foreground text-sm">Pago por Transferencia</p>
              <p className="text-xs text-muted-foreground">
                Monto total a transferir: <span className="font-bold text-foreground">{symbol}{totalInCurrency.toFixed(2)}</span>
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Confirma que la transferencia fue recibida antes de continuar.
              </p>
            </div>
          </div>
        )}

        {/* ── MIXED: multi-method UI ──────────────────────────── */}
        {method === "mixed" && (
          <div className="mb-4 space-y-3" style={{ maxHeight: "50vh", overflowY: "auto" }}>
            {/* Header */}
            <div className="p-3 bg-orange-500/10 border border-orange-500/30 rounded-xl flex items-center gap-3">
              <i className="fa-solid fa-shuffle text-xl text-orange-500" />
              <div>
                <p className="font-semibold text-foreground text-sm">Pago Mixto — Varios Métodos</p>
                <p className="text-xs text-muted-foreground">
                  Activa los métodos que participan. El último auto-calcula el resto.
                </p>
              </div>
            </div>

            {/* Method toggles */}
            <div className="grid grid-cols-3 gap-2">
              {MIXED_METHODS.map((m) => {
                const isActive = mixedActive[m.id];
                const activeCount = Object.values(mixedActive).filter(Boolean).length;
                const canDeactivate = activeCount > 2 || !isActive;
                return (
                  <button
                    key={m.id}
                    onClick={() => canDeactivate && toggleMixedMethod(m.id)}
                    className={`rounded-xl p-3 border-2 transition-all duration-200 flex flex-col items-center gap-1 ${
                      isActive
                        ? `${m.bgActive} ${m.borderActive} ring-1 ring-offset-1 ring-${m.id === "cash" ? "emerald" : m.id === "card" ? "blue" : "violet"}-300`
                        : "border-border bg-muted/30 opacity-50 hover:opacity-70"
                    } ${!canDeactivate && isActive ? "cursor-not-allowed" : "cursor-pointer"}`}
                  >
                    <i className={`fa-solid ${m.icon} text-lg ${isActive ? m.color : "text-muted-foreground"}`} />
                    <span className={`text-xs font-bold ${isActive ? m.color : "text-muted-foreground"}`}>{m.label}</span>
                    {isActive ? (
                      <i className={`fa-solid fa-toggle-on ${m.color} text-sm`} />
                    ) : (
                      <i className="fa-solid fa-toggle-off text-muted-foreground text-sm" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Active method cards */}
            {activeMethods.map((m, idx) => {
              const isAutoFill = m.id === autoFillMethod;
              const displayAmount = isAutoFill ? autoFillAmount : (mixedParsed[m.id] || 0);
              const isCash = m.id === "cash";

              return (
                <div key={m.id} className={`rounded-xl border-2 ${m.borderCard} ${m.bgCard} p-4 space-y-2 animate-scale-in`}>
                  <div className="flex items-center justify-between">
                    <label className={`flex items-center gap-2 text-sm font-bold ${m.textColor}`}>
                      <i className={`fa-solid ${m.icon} ${m.color}`} />
                      {m.label}
                      {isAutoFill && (
                        <span className="text-[10px] font-normal bg-white/60 dark:bg-black/20 px-2 py-0.5 rounded-full">
                          auto-calculado
                        </span>
                      )}
                    </label>
                    <span className={`text-xs font-semibold ${m.color}`}>
                      #{idx + 1} de {activeMethods.length}
                    </span>
                  </div>

                  {isAutoFill ? (
                    /* Auto-fill: show read-only amount */
                    <div className="flex items-center justify-between p-3 rounded-lg bg-white/50 dark:bg-black/20">
                      <p className={`text-xs ${m.color}`}>
                        Resto del total a cobrar:
                      </p>
                      <p className={`text-2xl font-black ${displayAmount > 0 ? m.textColor : "text-muted-foreground"}`}>
                        {symbol}{displayAmount.toFixed(2)}
                      </p>
                    </div>
                  ) : (
                    /* Manual input */
                    <div>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={mixedAmounts[m.id]}
                        onChange={(e) => {
                          let val = e.target.value.replace(/[^0-9.]/g, '');
                          const parts = val.split('.');
                          if (parts.length > 2) val = parts[0] + '.' + parts.slice(1).join('');
                          
                          setMixedAmounts(prev => ({ ...prev, [m.id]: val }));
                        }}
                        className="input-touch text-xl font-bold text-center"
                        placeholder="0.00"
                        autoFocus={idx === 0}
                      />
                    </div>
                  )}

                  {/* Cash-specific: received amount and change */}
                  {isCash && mixedActive.cash && displayAmount > 0 && (
                    <div className="space-y-2 pt-2 border-t border-emerald-200 dark:border-emerald-700">
                      <label className="flex items-center gap-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                        <i className="fa-solid fa-hand-holding-dollar" />
                        Efectivo recibido ({symbol})
                      </label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={mixedCashReceived}
                        onChange={(e) => {
                          let val = e.target.value.replace(/[^0-9.]/g, '');
                          const parts = val.split('.');
                          if (parts.length > 2) val = parts[0] + '.' + parts.slice(1).join('');
                          setMixedCashReceived(val);
                        }}
                        className="input-touch text-lg font-bold text-center border-emerald-400 focus:ring-emerald-200"
                        placeholder={displayAmount.toFixed(2)}
                      />
                      {mixedCashReceivedNum > 0 && mixedCashReceivedNum < mixedCashApplied && (
                        <div className="p-2 bg-destructive/10 rounded-lg text-center">
                          <p className="text-xs text-destructive font-semibold">
                            <i className="fa-solid fa-triangle-exclamation mr-1" />
                            Falta {symbol}{(mixedCashApplied - mixedCashReceivedNum).toFixed(2)}
                          </p>
                        </div>
                      )}
                      {mixedCashChange > 0 && (
                        <div className="flex justify-between text-sm bg-amber-50 dark:bg-amber-900/20 border border-amber-300 rounded-lg px-3 py-2">
                          <span className="text-amber-700 font-semibold">
                            <i className="fa-solid fa-coins mr-1" />Vuelto:
                          </span>
                          <span className="font-black text-amber-700">{symbol}{mixedCashChange.toFixed(2)}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Validation summary */}
            {activeMethods.length >= 2 && (
              <div className={`p-3 rounded-xl border text-center text-sm font-semibold ${
                mixedValid
                  ? "bg-accent/10 border-accent/30 text-accent"
                  : filledTotal > totalInCurrency
                    ? "bg-destructive/10 border-destructive/30 text-destructive"
                    : "bg-muted/30 border-border text-muted-foreground"
              }`}>
                {mixedValid ? (
                  <>
                    <i className="fa-solid fa-circle-check mr-2" />
                    Total cubierto: {symbol}{totalInCurrency.toFixed(2)}
                    <span className="text-xs font-normal ml-1">
                      ({activeMethods.map(m => {
                        const amt = finalAmounts[m.id];
                        const shortLabel = m.id === "cash" ? "Ef." : m.id === "card" ? "Tj." : "Tr.";
                        return `${shortLabel} ${symbol}${amt.toFixed(2)}`;
                      }).join(" + ")})
                    </span>
                  </>
                ) : filledTotal > totalInCurrency ? (
                  <>
                    <i className="fa-solid fa-triangle-exclamation mr-2" />
                    Excede el total por {symbol}{(filledTotal - totalInCurrency).toFixed(2)}
                  </>
                ) : (
                  <>
                    <i className="fa-solid fa-hourglass-half mr-2" />
                    {filledTotal > 0
                      ? `Asignado: ${symbol}${filledTotal.toFixed(2)} de ${symbol}${totalInCurrency.toFixed(2)}`
                      : "Ingresa los montos para cada método"}
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* Confirm button */}
        <button
          onClick={handleConfirm}
          disabled={!canConfirm || isSubmitting}
          className="btn-cobrar w-full flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <i className="fa-solid fa-check-circle" />
          {method === "transfer"
            ? "Confirmar Transferencia"
            : method === "card"
              ? "Confirmar Pago con Tarjeta"
              : method === "mixed"
                ? "Confirmar Pago Mixto"
                : "Confirmar Pago"}
        </button>
      </div>
    </div>
  );
}
