interface Props {
  ticket: any;
  onClose: () => void;
}

export default function TicketPrint({ ticket, onClose }: Props) {
  const handlePrint = () => {
    window.print();
  };

  const handleWhatsApp = () => {
    if (!ticket.customer?.phone) return;

    // Normalize phone (remove non-digits, handle Nicaragua code if missing)
    let phone = ticket.customer.phone.replace(/\D/g, "");
    if (phone.length === 8) phone = "505" + phone;

    const dateStr = new Date(ticket.created_at || Date.now()).toLocaleDateString("es-NI");
    const timeStr = new Date(ticket.created_at || Date.now()).toLocaleTimeString("es-NI", { hour: "2-digit", minute: "2-digit" });

    // Format professional message
    let message = `*${ticket.settings?.business_name || "EL RAPIDO AUTOLAVADO"}*\n`;
    message += `🖨️ *TICKET:* ${ticket.ticket_number}\n`;
    message += `📅 *Fecha:* ${dateStr} ${timeStr}\n`;
    message += `👤 *Cliente:* ${ticket.customer?.name || "Cliente"}\n`;
    if (ticket.customer?.plate) message += `🚗 *Placa:* ${ticket.customer.plate.toUpperCase()}\n`;
    message += `──────────────────\n`;
    message += `*SERVICIOS:*\n`;

    ticket.items?.forEach((item: any) => {
      message += `• ${item.serviceName}\n`;
      message += `  _C$${item.price.toFixed(2)}_\n`;
    });

    message += `──────────────────\n`;
    message += `*SUBTOTAL:* C$${Number(ticket.subtotal).toFixed(2)}\n`;
    if (Number(ticket.discount) > 0) message += `*DESCUENTO:* -C$${Number(ticket.discount).toFixed(2)}\n`;
    message += `💰 *TOTAL: C$${Number(ticket.total).toFixed(2)}*\n`;
    message += `──────────────────\n`;
    message += `_${ticket.settings?.receipt_footer || "¡Gracias por su visita!"}_`;

    const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    window.open(url, "_blank");
  };

  const date = new Date(ticket.created_at || Date.now());
  const printerWidth = ticket.settings?.printer_width_mm || 80;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content animate-scale-in max-w-sm" onClick={(e) => e.stopPropagation()}>

        {/* Print-friendly ticket */}
        <div
          id="ticket-print"
          className="bg-white p-6 rounded-xl text-foreground print:p-4 print:rounded-none print:shadow-none print:text-black"
          style={{ '--printer-width': `${printerWidth}mm` } as React.CSSProperties}
        >
          {/* Logo */}
          {ticket.settings?.logo_url && (
            <div className="flex justify-center mb-3 print:mb-2">
              <img
                src={ticket.settings.logo_url}
                alt="Logo"
                className="max-h-20 object-contain print:max-h-16"
              />
            </div>
          )}

          {/* Business Header */}
          <div className="text-center mb-4 print:mb-3">
            <h2 className="text-xl font-black uppercase tracking-wider mb-1 print:text-lg">
              {ticket.settings?.business_name || "EL RAPIDO AUTOLAVADO"}
            </h2>
            {ticket.settings?.address && (
              <p className="text-[10px] text-muted-foreground print:text-black leading-tight px-2">
                {ticket.settings.address}
              </p>
            )}
            <div className="flex justify-center gap-3 mt-1 text-[10px] text-muted-foreground print:text-black">
              {ticket.settings?.phone && (
                <span><i className="fa-solid fa-phone text-[8px]" /> {ticket.settings.phone}</span>
              )}
              {ticket.settings?.ruc && (
                <span>RUC: {ticket.settings.ruc}</span>
              )}
            </div>
            {ticket.settings?.social_media && (
              <p className="text-[10px] mt-1 font-semibold text-muted-foreground print:text-black">
                <i className="fa-brands fa-instagram text-[8px]" /> {ticket.settings.social_media}
              </p>
            )}
          </div>

          <div className="border-t-2 border-dashed border-border print:border-black my-3 print:my-2" />

          {/* Ticket Info */}
          <div className="text-xs space-y-1 mb-3 print:mb-2">
            <div className="flex justify-between font-bold">
              <span>TICKET #:</span>
              <span>{ticket.ticket_number}</span>
            </div>
            <div className="flex justify-between text-[10px]">
              <span>Fecha:</span>
              <span>{date.toLocaleDateString("es-NI")} {date.toLocaleTimeString("es-NI", { hour: "2-digit", minute: "2-digit" })}</span>
            </div>
            <div className="flex justify-between text-[10px]">
              <span>Cliente:</span>
              <span className="font-semibold">{ticket.customer?.name || "Cliente General"}</span>
            </div>
            {ticket.customer?.plate && (
              <div className="flex justify-between text-[10px]">
                <span>Placa:</span>
                <span className="font-bold uppercase">{ticket.customer.plate}</span>
              </div>
            )}
          </div>

          <div className="border-t-2 border-dashed border-border print:border-black my-3 print:my-2" />

          {/* Items */}
          <div className="mb-3 print:mb-2">
            <div className="text-xs font-bold mb-2 uppercase">Servicios</div>
            <div className="space-y-1.5">
              {ticket.items?.map((item: any, i: number) => (
                <div key={i} className="text-[11px]">
                  <div className="flex justify-between font-semibold">
                    <span>{item.serviceName}</span>
                    <span>C${item.price.toFixed(2)}</span>
                  </div>
                  <div className="text-[9px] text-muted-foreground print:text-gray-600 pl-2">
                    {item.vehicleLabel}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="border-t-2 border-dashed border-border print:border-black my-3 print:my-2" />

          {/* Totals */}
          <div className="text-xs space-y-1 mb-3 print:mb-2">
            <div className="flex justify-between">
              <span>Subtotal:</span>
              <span>C${Number(ticket.subtotal).toFixed(2)}</span>
            </div>
            {Number(ticket.discount) > 0 && (
              <div className="flex justify-between text-destructive print:text-black font-semibold">
                <span>Descuento:</span>
                <span>-C${Number(ticket.discount).toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between font-black text-base pt-1 border-t border-border print:border-black">
              <span>TOTAL:</span>
              <span>C${Number(ticket.total).toFixed(2)}</span>
            </div>
          </div>

          {/* Payment Info */}
          {ticket.payment && (
            <>
              <div className="border-t border-dashed border-border print:border-black my-2" />
              <div className="text-xs space-y-1">
                <div className="flex justify-between">
                  <span>Pago ({ticket.payment.method}):</span>
                  <span>{ticket.payment.currency === "NIO" ? "C$" : "$"}{ticket.payment.received.toFixed(2)}</span>
                </div>
                {ticket.payment.change > 0 && (
                  <div className="flex justify-between font-semibold">
                    <span>Vuelto:</span>
                    <span>{ticket.payment.currency === "NIO" ? "C$" : "$"}{ticket.payment.change.toFixed(2)}</span>
                  </div>
                )}
              </div>
            </>
          )}

          <div className="border-t-2 border-dashed border-border print:border-black my-3 print:my-2" />

          {/* Footer */}
          <div className="text-center text-[11px] text-muted-foreground print:text-black space-y-1">
            <p className="font-semibold">
              {ticket.settings?.receipt_footer || "¡Gracias por su visita!"}
            </p>
            <p className="text-[9px]">Vuelva pronto</p>
            <div className="mt-2 print:mt-1">
              <p className="text-[8px]">★ ★ ★ ★ ★</p>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2 mt-4 print:hidden">
          <div className="flex gap-2">
            <button onClick={handlePrint} className="touch-btn flex-1 bg-brick-red text-white py-3 rounded-xl font-semibold flex items-center justify-center gap-2">
              <i className="fa-solid fa-print" />Imprimir
            </button>
            {!ticket.customer?.is_general && ticket.customer?.phone && (
              <button onClick={handleWhatsApp} className="touch-btn flex-1 bg-[#25D366] text-white py-3 rounded-xl font-semibold flex items-center justify-center gap-2">
                <i className="fa-brands fa-whatsapp text-xl" />WhatsApp
              </button>
            )}
          </div>
          <button onClick={onClose} className="touch-btn w-full border border-border text-foreground py-3 rounded-xl font-semibold">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
