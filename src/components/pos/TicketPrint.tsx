import { useState } from "react";
import { printTicketBluetooth } from "@/utils/bluetoothPrinter";
import { niFormatDate, niFormatTime } from "@/utils/niDate";

interface Props {
  ticket: any;
  onClose: () => void;
}

export default function TicketPrint({ ticket, onClose }: Props) {
  const [isPrintingBT, setIsPrintingBT] = useState(false);
  const [printError, setPrintError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  const doublePrint = ticket.settings?.double_print_ticket ?? true;
  const printerWidth = ticket.settings?.printer_width_mm || 80;
  const date = new Date(ticket.created_at || Date.now());

  const handlePrint = () => {
    // Un solo click, un solo diálogo — el CSS maneja el salto de página para las 2 copias
    window.print();
  };

  const handlePrintBluetooth = async () => {
    setIsPrintingBT(true);
    setPrintError(null);
    setIsSuccess(false);
    try {
      await printTicketBluetooth(ticket);
      setIsSuccess(true);
      setTimeout(() => setIsSuccess(false), 3000);
    } catch (error: any) {
      setPrintError(error.message || "Error al conectar con la impresora");
    } finally {
      setIsPrintingBT(false);
    }
  };

  const handleWhatsApp = () => {
    const rawPhone = ticket.customer?.phone;
    if (!rawPhone) return;

    let phone = String(rawPhone).replace(/\D/g, "");
    if (phone.length === 8) phone = "505" + phone;

    const toNumber = (v: any) => {
      const n = typeof v === "string" ? v.replace(/,/g, "").trim() : v;
      const out = Number(n);
      return Number.isFinite(out) ? out : 0;
    };

    const items = Array.isArray(ticket.items) ? ticket.items : [];
    const itemLabel = (item: any) =>
      item?.name || item?.serviceName || item?.service_name_snapshot || "Ítem";
    const itemQty = (item: any) => toNumber(item?.quantity ?? item?.qty ?? 1);
    const itemLineTotal = (item: any) => {
      const unit = toNumber(item?.price);
      const qty = itemQty(item);
      const disc = toNumber(item?.discountPercent) / 100;
      return unit * qty * (1 - disc);
    };
    const computedSubtotal = items.reduce((sum: number, item: any) => sum + itemLineTotal(item), 0);

    const subtotal = toNumber(ticket.subtotal) || computedSubtotal;
    const discount = toNumber(ticket.discount);
    const total = toNumber(ticket.total) || Math.max(0, subtotal - discount);

    const dt = new Date(ticket.created_at || Date.now());
    const dateStr = niFormatDate(dt);
    const timeStr = niFormatTime(dt);

    const businessName = ticket.settings?.business_name || "EL RAPIDO AUTOLAVADO";
    const ticketNum = ticket.ticket_number || "----";
    const clientName = ticket.customer?.name || "Cliente";
    const isBarber = ticket.business_line === "barbershop";
    const plate =
      !isBarber && ticket.customer?.plate
        ? String(ticket.customer.plate).toUpperCase()
        : "";
    const symbol = ticket.payment?.currency === "USD" ? "$" : "C$";
    const line = "------------------------------";

    let message = `✨ *${businessName}* ✨\n`;
    message += `🧾 *TICKET:* ${ticketNum}\n`;
    message += `📅 *Fecha:* ${dateStr} ${timeStr}\n`;
    message += `👤 *Cliente:* ${clientName}\n`;
    if (plate) message += `🚗 *Placa:* ${plate}\n`;
    message += `${line}\n`;
    const serviceItems = items.filter((i: any) => (i.itemType || i.item_type) !== "product");
    const productItems = items.filter((i: any) => (i.itemType || i.item_type) === "product");
    if (serviceItems.length) {
      message += `🧼 *SERVICIOS:*\n`;
      serviceItems.forEach((item: any) => {
        const name = itemLabel(item);
        const qty = itemQty(item);
        message += `🔹 ${name}${qty > 1 ? ` (x${qty})` : ""}\n`;
        message += `   💰 ${symbol}${itemLineTotal(item).toFixed(2)}\n`;
      });
    }
    if (productItems.length) {
      message += `📦 *PRODUCTOS:*\n`;
      productItems.forEach((item: any) => {
        const name = itemLabel(item);
        const qty = itemQty(item);
        message += `🔹 ${name}${qty > 1 ? ` (x${qty})` : ""}\n`;
        message += `   💰 ${symbol}${itemLineTotal(item).toFixed(2)}\n`;
      });
    }

    const rate = Number(ticket.settings?.exchange_rate || 36.5);
    const totalUSD = total / rate;

    message += `${line}\n`;
    message += `📦 *SUBTOTAL:* C$${subtotal.toFixed(2)}\n`;
    if (discount > 0) message += `🏷️ *DESCUENTO:* -C$${discount.toFixed(2)}\n`;
    message += `💵 *TOTAL:* C$${total.toFixed(2)}\n`;
    message += `🌎 *TOTAL USD:* $${totalUSD.toFixed(2)}\n`;

    // Payment method info
    if (ticket.payment?.method === "mixed" && ticket.payment?.mixedPayments?.length) {
      message += `💳 *PAGO MIXTO:*\n`;
      for (const part of ticket.payment.mixedPayments) {
        const partSym = ticket.payment.currency === "USD" ? "$" : "C$";
        const partLabel = part.method === "cash" ? "Efectivo" : part.method === "card" ? "Tarjeta" : "Transferencia";
        message += `   🔹 ${partLabel}: ${partSym}${Number(part.amount).toFixed(2)}\n`;
        if (part.change > 0) message += `   ↩️ Vuelto: ${partSym}${Number(part.change).toFixed(2)}\n`;
      }
    }
    message += `${line}\n`;
    const waGreeting = ticket.settings?.whatsapp_greeting || ticket.settings?.receipt_footer || "¡Gracias por su visita!";
    message += `🙏 _${waGreeting}_\n`;

    const feedbackEnabled = ticket.settings?.whatsapp_feedback_enabled ?? true;
    if (feedbackEnabled) {
      const feedbackText = ticket.settings?.whatsapp_feedback_text || "Tu opinión es importante para nosotros";
      const linkLabel = ticket.settings?.whatsapp_link_label || "Dejanos tu recomendación aquí:";
      const feedbackLink = ticket.settings?.whatsapp_feedback_link || "https://forms.gle/ZLqzSWJPxrK1Wsum7";
      message += `\n⭐ *${feedbackText}* ⭐\n`;
      message += `📝 ${linkLabel}\n`;
      message += `👉 ${feedbackLink}`;
    }

    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    const base = isMobile ? "https://api.whatsapp.com/send" : "https://web.whatsapp.com/send";
    const url = `${base}?phone=${phone}&text=${encodeURIComponent(message)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  // ─── Contenido del ticket (reutilizable para 1ª y 2ª copia) ───────────────
  const renderTicketContent = () => (
    <div className="bg-white p-6 rounded-xl text-foreground print:p-4 print:rounded-none print:shadow-none print:text-black">
      {/* Logo */}
      {ticket.settings?.logo_url && (
        <div className="flex justify-center mb-3 print:mb-2 text-center">
          <img
            src={ticket.settings.logo_url}
            alt="Logo"
            className="max-h-20 object-contain print:max-h-16 inline-block"
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
      {(() => {
        const allItems = ticket.items || [];
        const renderLines = (list: any[], title: string) =>
          list.length > 0 ? (
            <div className="mb-3 print:mb-2">
              <div className="text-xs font-bold mb-2 uppercase">{title}</div>
              <div className="space-y-1.5">
                {list.map((item: any, i: number) => {
                  const qty = Number(item.quantity ?? 1);
                  const unit = Number(item.price) || 0;
                  const discPct = Number(item.discountPercent) || 0;
                  const lineTotal = unit * qty * (1 - discPct / 100);
                  const symbol = ticket.payment?.currency === "USD" ? "$" : "C$";
                  const name = item.name || item.serviceName || item.service_name_snapshot || "Ítem";
                  return (
                    <div key={i} className="text-[11px]">
                      <div className="flex justify-between font-semibold">
                        <span>
                          {name}
                          {qty > 1 ? ` x${qty}` : ""}
                          {discPct > 0 ? ` – ${discPct}% desc.` : ""}
                        </span>
                        <span>{symbol}{lineTotal.toFixed(2)}</span>
                      </div>
                      {item.vehicleLabel && ticket.business_line !== "barbershop" && (
                        <div className="text-[9px] text-muted-foreground print:text-gray-600 pl-2">
                          {item.vehicleLabel}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null;

        return (
          <>
            {renderLines(
              allItems.filter((i: any) => (i.itemType || i.item_type) !== "product"),
              "Servicios"
            )}
            {renderLines(
              allItems.filter((i: any) => (i.itemType || i.item_type) === "product"),
              "Productos"
            )}
          </>
        );
      })()}

      <div className="border-t-2 border-dashed border-border print:border-black my-3 print:my-2" />

      {/* Totals */}
      {(() => {
        const items = Array.isArray(ticket.items) ? ticket.items : [];
        const lineAmt = (i: any) => {
          const p = Number(i.price) || 0;
          const q = Number(i.quantity ?? 1);
          const d = Number(i.discountPercent) || 0;
          return p * q * (1 - d / 100);
        };
        const gross = (i: any) => {
          const p = Number(i.price) || 0;
          const q = Number(i.quantity ?? 1);
          return p * q;
        };
        const computedSubtotal = items.reduce((s: number, i: any) => s + gross(i), 0);
        const computedDiscount = items.reduce((s: number, i: any) => {
          const p = Number(i.price) || 0;
          const q = Number(i.quantity ?? 1);
          const d = Number(i.discountPercent) || 0;
          return s + p * q * (d / 100);
        }, 0);
        const displaySubtotal = Number(ticket.subtotal) || computedSubtotal;
        const displayDiscount = Number(ticket.discount) || computedDiscount;
        const displayTotal = Number(ticket.total) || (displaySubtotal - displayDiscount);
        const rate = Number(ticket.settings?.exchange_rate || 36.5);
        const totalUSD = displayTotal / rate;

        return (
          <div className="text-xs space-y-1 mb-3 print:mb-2">
            <div className="flex justify-between">
              <span>Subtotal:</span>
              <span>C${displaySubtotal.toFixed(2)}</span>
            </div>
            {displayDiscount > 0 && (
              <div className="flex justify-between text-destructive print:text-black font-semibold">
                <span>Descuento:</span>
                <span>-C${displayDiscount.toFixed(2)}</span>
              </div>
            )}
            <div className="flex flex-col border-t border-border print:border-black pt-1">
              <div className="flex justify-between font-black text-base">
                <span>TOTAL:</span>
                <span>C${displayTotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-bold text-sm text-muted-foreground print:text-black italic">
                <span>TOTAL USD:</span>
                <span>${totalUSD.toFixed(2)}</span>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Payment Info */}
      {ticket.payment && (
        <>
          <div className="border-t border-dashed border-border print:border-black my-2" />
          <div className="text-xs space-y-1">
            {ticket.payment.method === "mixed" && ticket.payment.mixedPayments?.length ? (
              <>
                <div className="flex justify-between font-semibold">
                  <span>Pago Mixto:</span>
                  <span>{ticket.payment.currency === "NIO" ? "C$" : "$"}{ticket.payment.amount.toFixed(2)}</span>
                </div>
                {ticket.payment.mixedPayments.map((part: any, idx: number) => {
                  const sym = ticket.payment.currency === "NIO" ? "C$" : "$";
                  const label = part.method === "cash" ? "Efectivo" : part.method === "card" ? "Tarjeta" : "Transferencia";
                  return (
                    <div key={idx} className="pl-2 space-y-0.5">
                      <div className="flex justify-between text-muted-foreground print:text-gray-600">
                        <span>↳ {label}:</span>
                        <span>{sym}{part.amount.toFixed(2)}</span>
                      </div>
                      {part.method === "cash" && part.received > part.amount && (
                        <div className="flex justify-between text-muted-foreground print:text-gray-600">
                          <span className="pl-2">Recibido:</span>
                          <span>{sym}{part.received.toFixed(2)}</span>
                        </div>
                      )}
                      {part.change > 0 && (
                        <div className="flex justify-between font-semibold print:text-black">
                          <span className="pl-2">Vuelto:</span>
                          <span>{sym}{part.change.toFixed(2)}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </>
            ) : (
              <>
                <div className="flex justify-between">
                  <span>Pago ({ticket.payment.method === "cash" ? "Efectivo" : ticket.payment.method === "card" ? "Tarjeta" : ticket.payment.method === "transfer" ? "Transferencia" : ticket.payment.method}):</span>
                  <span>{ticket.payment.currency === "NIO" ? "C$" : "$"}{ticket.payment.received.toFixed(2)}</span>
                </div>
                {ticket.payment.change > 0 && (
                  <div className="flex justify-between font-semibold">
                    <span>Vuelto:</span>
                    <span>{ticket.payment.currency === "NIO" ? "C$" : "$"}{ticket.payment.change.toFixed(2)}</span>
                  </div>
                )}
              </>
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
      </div>

      {/* QR Code */}
      {ticket.settings?.qr_image_url && (
        <>
          <div className="border-t border-dashed border-border print:border-black my-3 print:my-2" />
          <div className="flex flex-col items-center text-center">
            <img
              src={ticket.settings.qr_image_url}
              alt="QR"
              className="w-24 h-24 object-contain print:w-20 print:h-20 inline-block"
            />
            {ticket.settings?.qr_text && (
              <p className="text-[9px] text-muted-foreground print:text-black mt-1 font-medium leading-tight px-4">
                {ticket.settings.qr_text}
              </p>
            )}
          </div>
        </>
      )}

      <div className="mt-2 print:mt-1 text-center">
        <p className="text-[8px] text-muted-foreground print:text-black">★ ★ ★ ★ ★</p>
      </div>
    </div>
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content animate-scale-in max-w-sm" onClick={(e) => e.stopPropagation()}>

        {/* ── Área de impresión ── */}
        <div
          id="ticket-print"
          style={{ '--printer-width': `${printerWidth}mm` } as React.CSSProperties}
        >
          {/* PANTALLA: solo muestra 1 preview */}
          <div className="print:hidden">
            {renderTicketContent()}
            {doublePrint && (
              <p className="mt-4 text-center text-[10px] text-muted-foreground bg-accent/5 p-3 rounded-lg border border-dashed border-accent/20">
                <i className="fa-solid fa-copy mr-2" /> Se imprimirán 2 copias con corte automático
              </p>
            )}
          </div>

          {/* IMPRESIÓN: 2 copias apiladas con salto de página entre ellas */}
          <div className="hidden print:block">
            {doublePrint ? (
              <>
                <div className="print-copy-block">{renderTicketContent()}</div>
                <div className="print-page-break" />
                <div className="print-copy-block">{renderTicketContent()}</div>
              </>
            ) : (
              <div className="print-copy-block">{renderTicketContent()}</div>
            )}
          </div>
        </div>

        {/* ── Botones de acción ── */}
        <div className="flex flex-col gap-2 mt-4 print:hidden">
          <div className="flex gap-2">
            <button onClick={handlePrint} className="touch-btn flex-1 bg-brick-red text-white py-3 rounded-xl font-semibold flex items-center justify-center gap-2">
              <i className="fa-solid fa-print" />{doublePrint ? "Imprimir (×2)" : "Imprimir"}
            </button>
            <button
              onClick={handlePrintBluetooth}
              disabled={isPrintingBT}
              className={`touch-btn flex-1 py-3 rounded-xl font-semibold flex items-center justify-center gap-2 disabled:opacity-50 ${isSuccess ? 'bg-green-600 text-white' : 'bg-secondary text-white'}`}
            >
              <i className={`fa-solid ${isPrintingBT ? "fa-spinner fa-spin" : isSuccess ? "fa-check" : "fa-bluetooth"}`} />
              {isPrintingBT ? "..." : isSuccess ? "¡Enviado!" : "BT (×2)"}
            </button>
          </div>
          {printError && (
            <p className="text-[10px] text-destructive text-center font-semibold animate-shake">
              <i className="fa-solid fa-circle-exclamation mr-1" />
              {printError}
            </p>
          )}
          <div className="flex gap-2">
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
