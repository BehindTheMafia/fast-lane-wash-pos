import { useState } from "react";

interface PaymentModalProps {
  total: number;
  exchangeRate: number;
  onClose: () => void;
  onConfirm: (data: {
    currency: string;
    method: string;
    received: number;
    change: number;
    mixedPayment?: {
      cashAmount: number;
      cardAmount: number;
    }
  }) => void;
}

export default function PaymentModal({ total, exchangeRate, onClose, onConfirm }: PaymentModalProps) {
  const [currency, setCurrency] = useState<"NIO" | "USD">("NIO");
  const [method, setMethod] = useState("cash");
  const [received, setReceived] = useState("");
  const [mixedMode, setMixedMode] = useState(false);
  const [cashAmount, setCashAmount] = useState("");
  const [cardAmount, setCardAmount] = useState("");

  const totalInCurrency = currency === "NIO" ? total : +(total / exchangeRate).toFixed(2);

  // Mixed payment logic
  const cashNum = parseFloat(cashAmount) || 0;
  const cardNum = parseFloat(cardAmount) || 0;
  const mixedTotal = cashNum + cardNum;
  const mixedRemaining = Math.max(0, totalInCurrency - mixedTotal);

  // Single payment logic
  const receivedNum = parseFloat(received) || 0;
  const change = Math.max(0, receivedNum - totalInCurrency);

  const canConfirm = mixedMode
    ? mixedTotal >= totalInCurrency
    : (method !== "cash" || receivedNum >= totalInCurrency);

  const handleConfirm = () => {
    if (!canConfirm) return;

    if (mixedMode) {
      onConfirm({
        currency,
        method: "mixed",
        received: mixedTotal,
        change: 0,
        mixedPayment: {
          cashAmount: cashNum,
          cardAmount: cardNum
        }
      });
    } else {
      onConfirm({ currency, method, received: receivedNum, change });
    }
  };

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
            {currency === "NIO" ? "C$" : "$"}{totalInCurrency.toFixed(2)}
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
                onClick={() => setCurrency(c)}
                className={`vehicle-card ${currency === c ? "vehicle-card-active" : ""}`}
              >
                <span className="font-bold">{c === "NIO" ? "C$ Córdobas" : "$ Dólares"}</span>
                {currency === c && <i className="fa-solid fa-circle-check text-brick-red ml-2" />}
              </button>
            ))}
          </div>
        </div>

        {/* Mixed Payment Toggle - DISABLED */}
        {/* <div className="mb-4 flex items-center justify-between p-3 bg-accent/5 rounded-xl border border-accent/20">
          <div className="flex items-center gap-2">
            <i className="fa-solid fa-shuffle text-accent" />
            <span className="text-sm font-semibold text-foreground">Pago Mixto (Efectivo + Tarjeta)</span>
          </div>
          <button
            onClick={() => setMixedMode(!mixedMode)}
            className={`w-12 h-6 rounded-full transition-colors ${mixedMode ? 'bg-accent' : 'bg-border'}`}
          >
            <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${mixedMode ? 'translate-x-6' : 'translate-x-0.5'}`} />
          </button>
        </div> */}

        {mixedMode ? (
          /* Mixed Payment Mode */
          <div className="space-y-3 mb-4">
            <div className="pos-card p-3">
              <label className="text-sm font-semibold text-foreground mb-2 block">
                <i className="fa-solid fa-money-bills mr-2 text-secondary" />Efectivo ({currency === "NIO" ? "C$" : "$"})
              </label>
              <input
                type="number"
                value={cashAmount}
                onChange={(e) => setCashAmount(e.target.value)}
                className="input-touch text-xl font-bold text-center"
                placeholder="0.00"
                min={0}
                step={0.01}
              />
            </div>

            <div className="pos-card p-3">
              <label className="text-sm font-semibold text-foreground mb-2 block">
                <i className="fa-solid fa-credit-card mr-2 text-secondary" />Tarjeta ({currency === "NIO" ? "C$" : "$"})
              </label>
              <input
                type="number"
                value={cardAmount}
                onChange={(e) => setCardAmount(e.target.value)}
                className="input-touch text-xl font-bold text-center"
                placeholder="0.00"
                min={0}
                step={0.01}
              />
            </div>

            {/* Mixed payment summary */}
            <div className="bg-background border border-border rounded-xl p-3 space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total pagado:</span>
                <span className="font-bold text-foreground">{currency === "NIO" ? "C$" : "$"}{mixedTotal.toFixed(2)}</span>
              </div>
              {mixedRemaining > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-destructive">Falta:</span>
                  <span className="font-bold text-destructive">{currency === "NIO" ? "C$" : "$"}{mixedRemaining.toFixed(2)}</span>
                </div>
              )}
              {mixedTotal >= totalInCurrency && (
                <div className="flex items-center gap-2 text-green-500 text-sm">
                  <i className="fa-solid fa-circle-check" />
                  <span className="font-semibold">Pago completo</span>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Single Payment Mode */
          <>
            {/* Method - Only Cash */}
            <div className="mb-4">
              <p className="text-sm font-semibold text-foreground mb-2">
                <i className="fa-solid fa-credit-card mr-2 text-secondary" />Método de pago
              </p>
              <div className="grid grid-cols-1 gap-2">
                <button
                  onClick={() => setMethod("cash")}
                  className="vehicle-card vehicle-card-active"
                >
                  <i className="fa-solid fa-money-bills text-lg text-brick-red" />
                  <p className="text-xs font-semibold mt-1">Efectivo</p>
                  <i className="fa-solid fa-circle-check text-brick-red text-sm mt-1" />
                </button>
              </div>
            </div>

            {/* Received amount (cash only) */}
            {method === "cash" && (
              <div className="mb-4">
                <label className="text-sm font-semibold text-foreground mb-2 block">
                  <i className="fa-solid fa-hand-holding-dollar mr-2 text-secondary" />Monto recibido ({currency === "NIO" ? "C$" : "$"})
                </label>
                <input
                  type="number"
                  value={received}
                  onChange={(e) => setReceived(e.target.value)}
                  className="input-touch text-2xl font-bold text-center"
                  placeholder="0.00"
                  min={0}
                  step={0.01}
                />
                {receivedNum > 0 && (
                  <div className="mt-2 pos-card p-3 text-center">
                    <p className="text-sm text-secondary">Vuelto</p>
                    <p className={`text-2xl font-bold ${change > 0 ? "text-accent" : "text-foreground"}`}>
                      {currency === "NIO" ? "C$" : "$"}{change.toFixed(2)}
                    </p>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        <button
          onClick={handleConfirm}
          disabled={!canConfirm}
          className="btn-cobrar w-full flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <i className="fa-solid fa-check-circle" />Confirmar Pago
        </button>
      </div>
    </div>
  );
}
