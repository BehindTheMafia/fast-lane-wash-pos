import { useState } from "react";

interface PaymentModalProps {
  total: number;
  exchangeRate: number;
  onClose: () => void;
  onConfirm: (data: { currency: string; method: string; received: number; change: number }) => void;
}

export default function PaymentModal({ total, exchangeRate, onClose, onConfirm }: PaymentModalProps) {
  const [currency, setCurrency] = useState<"NIO" | "USD">("NIO");
  const [method, setMethod] = useState("cash");
  const [received, setReceived] = useState("");

  const totalInCurrency = currency === "NIO" ? total : +(total / exchangeRate).toFixed(2);
  const receivedNum = parseFloat(received) || 0;
  const change = Math.max(0, receivedNum - totalInCurrency);

  const canConfirm = method !== "cash" || receivedNum >= totalInCurrency;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content animate-scale-in" onClick={(e) => e.stopPropagation()}>
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

        {/* Method */}
        <div className="mb-4">
          <p className="text-sm font-semibold text-foreground mb-2">
            <i className="fa-solid fa-credit-card mr-2 text-secondary" />Método de pago
          </p>
          <div className="grid grid-cols-3 gap-2">
            {[
              { key: "cash", label: "Efectivo", icon: "fa-money-bills" },
              { key: "card", label: "Tarjeta", icon: "fa-credit-card" },
              { key: "transfer", label: "Transferencia", icon: "fa-mobile-screen" },
            ].map((m) => (
              <button
                key={m.key}
                onClick={() => setMethod(m.key)}
                className={`vehicle-card ${method === m.key ? "vehicle-card-active" : ""}`}
              >
                <i className={`fa-solid ${m.icon} text-lg ${method === m.key ? "text-brick-red" : "text-secondary"}`} />
                <p className="text-xs font-semibold mt-1">{m.label}</p>
                {method === m.key && <i className="fa-solid fa-circle-check text-brick-red text-sm mt-1" />}
              </button>
            ))}
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

        <button
          onClick={() => canConfirm && onConfirm({ currency, method, received: receivedNum, change })}
          disabled={!canConfirm}
          className="btn-cobrar w-full flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <i className="fa-solid fa-check-circle" />Confirmar Pago
        </button>
      </div>
    </div>
  );
}
