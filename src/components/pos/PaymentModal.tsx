import { useState } from "react";

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
    mixedPayment?: {
      cashAmount: number;
      cardAmount: number;
    }
  }) => void;
}

type PaymentMethod = "cash" | "card" | "transfer";

export default function PaymentModal({ total, exchangeRate, onClose, onConfirm }: PaymentModalProps) {
  const [currency, setCurrency] = useState<"NIO" | "USD">("NIO");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [received, setReceived] = useState("");

  const totalInCurrency = currency === "NIO" ? total : +(total / exchangeRate).toFixed(2);
  const symbol = currency === "NIO" ? "C$" : "$";

  // Single payment logic (cash only needs received amount)
  const receivedNum = parseFloat(received) || 0;
  const change = Math.max(0, receivedNum - totalInCurrency);

  // For transfer/card: amount is exactly the total
  const canConfirm =
    method === "cash"
      ? receivedNum >= totalInCurrency
      : true; // transfer and card: total is confirmed directly

  const handleConfirm = () => {
    console.log("[PaymentModal] totalInCurrency:", totalInCurrency, "currency:", currency, "exchangeRate:", exchangeRate);
    if (!canConfirm) return;

    if (method === "cash") {
      onConfirm({ currency, method, amount: totalInCurrency, received: receivedNum, change });
    } else {
      // For card and transfer: received = total, no change
      onConfirm({ currency, method, amount: totalInCurrency, received: totalInCurrency, change: 0 });
    }
  };

  const paymentMethods: { id: PaymentMethod; label: string; icon: string; description: string }[] = [
    {
      id: "cash",
      label: "Efectivo",
      icon: "fa-money-bills",
      description: "Pago en físico",
    },
    {
      id: "card",
      label: "Tarjeta",
      icon: "fa-credit-card",
      description: "Débito / Crédito",
    },
    {
      id: "transfer",
      label: "Transferencia",
      icon: "fa-building-columns",
      description: "Bancaria / Móvil",
    },
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
                onClick={() => setCurrency(c)}
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
          <div className="grid grid-cols-3 gap-2">
            {paymentMethods.map((pm) => {
              const isSelected = method === pm.id;
              return (
                <button
                  key={pm.id}
                  onClick={() => {
                    setMethod(pm.id);
                    setReceived("");
                  }}
                  className={`vehicle-card flex-col py-4 transition-all duration-200 ${isSelected
                    ? "vehicle-card-active ring-2 ring-primary"
                    : "hover:border-primary/40"
                    }`}
                >
                  <i
                    className={`fa-solid ${pm.icon} text-2xl mb-1 ${isSelected ? "text-brick-red" : "text-secondary"
                      }`}
                  />
                  <p className="text-sm font-bold">{pm.label}</p>
                  <p className="text-xs text-muted-foreground">{pm.description}</p>
                  {isSelected && (
                    <i className="fa-solid fa-circle-check text-brick-red text-sm mt-1" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Cash: received amount input */}
        {method === "cash" && (
          <div className="mb-4">
            <label className="text-sm font-semibold text-foreground mb-2 block">
              <i className="fa-solid fa-hand-holding-dollar mr-2 text-secondary" />
              Monto recibido ({symbol})
            </label>
            <input
              type="number"
              value={received}
              onChange={(e) => setReceived(e.target.value)}
              className="input-touch text-2xl font-bold text-center"
              placeholder="0.00"
              min={0}
              step={0.01}
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

        {/* Card: info panel */}
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

        {/* Transfer: info panel */}
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

        <button
          onClick={handleConfirm}
          disabled={!canConfirm}
          className="btn-cobrar w-full flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <i className="fa-solid fa-check-circle" />
          {method === "transfer"
            ? "Confirmar Transferencia"
            : method === "card"
              ? "Confirmar Pago con Tarjeta"
              : "Confirmar Pago"}
        </button>
      </div>
    </div>
  );
}
