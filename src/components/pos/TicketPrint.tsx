interface Props {
  ticket: any;
  onClose: () => void;
}

export default function TicketPrint({ ticket, onClose }: Props) {
  const handlePrint = () => {
    window.print();
  };

  const date = new Date(ticket.created_at || Date.now());

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content animate-scale-in max-w-sm" onClick={(e) => e.stopPropagation()}>
        {/* Print-friendly ticket */}
        <div id="ticket-print" className="bg-white p-6 rounded-xl text-foreground">
          <div className="text-center mb-4">
            <h2 className="text-lg font-bold">{ticket.settings?.business_name || "EL RAPIDO AUTOLAVADO"}</h2>
            {ticket.settings?.address && <p className="text-xs text-muted-foreground">{ticket.settings.address}</p>}
            {ticket.settings?.phone && <p className="text-xs text-muted-foreground">Tel: {ticket.settings.phone}</p>}
            {ticket.settings?.ruc && <p className="text-xs text-muted-foreground">RUC: {ticket.settings.ruc}</p>}
            <hr className="my-2 border-border" />
          </div>

          <div className="text-xs space-y-1 mb-3">
            <div className="flex justify-between">
              <span className="text-secondary">Ticket #:</span>
              <span className="font-semibold">{ticket.ticket_number}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-secondary">Fecha:</span>
              <span>{date.toLocaleDateString("es-NI")} {date.toLocaleTimeString("es-NI", { hour: "2-digit", minute: "2-digit" })}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-secondary">Cliente:</span>
              <span>{ticket.customer?.name || "Cliente General"}</span>
            </div>
            {ticket.customer?.plate && (
              <div className="flex justify-between">
                <span className="text-secondary">Placa:</span>
                <span>{ticket.customer.plate}</span>
              </div>
            )}
          </div>

          <hr className="my-2 border-border" />

          <div className="text-xs space-y-1 mb-3">
            {ticket.items?.map((item: any, i: number) => (
              <div key={i} className="flex justify-between">
                <span>{item.serviceName} ({item.vehicleLabel})</span>
                <span className="font-semibold">C${item.price.toFixed(2)}</span>
              </div>
            ))}
          </div>

          <hr className="my-2 border-border" />

          <div className="text-xs space-y-1">
            <div className="flex justify-between">
              <span>Subtotal:</span><span>C${Number(ticket.subtotal).toFixed(2)}</span>
            </div>
            {Number(ticket.discount) > 0 && (
              <div className="flex justify-between text-destructive">
                <span>Descuento:</span><span>-C${Number(ticket.discount).toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-sm pt-1 border-t border-border">
              <span>TOTAL:</span><span>C${Number(ticket.total).toFixed(2)}</span>
            </div>
            {ticket.payment && (
              <>
                <div className="flex justify-between">
                  <span>Pago ({ticket.payment.method}):</span>
                  <span>{ticket.payment.currency === "NIO" ? "C$" : "$"}{ticket.payment.received.toFixed(2)}</span>
                </div>
                {ticket.payment.change > 0 && (
                  <div className="flex justify-between">
                    <span>Vuelto:</span>
                    <span>{ticket.payment.currency === "NIO" ? "C$" : "$"}{ticket.payment.change.toFixed(2)}</span>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="text-center mt-4 text-xs text-muted-foreground">
            <p>Gracias por su visita</p>
          </div>
        </div>

        <div className="flex gap-2 mt-4 print:hidden">
          <button onClick={handlePrint} className="touch-btn flex-1 bg-accent text-accent-foreground py-3 rounded-xl font-semibold flex items-center justify-center gap-2">
            <i className="fa-solid fa-print" />Imprimir
          </button>
          <button onClick={onClose} className="touch-btn flex-1 border border-border text-foreground py-3 rounded-xl font-semibold">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
