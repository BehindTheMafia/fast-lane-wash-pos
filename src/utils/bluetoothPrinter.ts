import ReceiptPrinterEncoder from '@point-of-sale/receipt-printer-encoder';
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function loadImage(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = url;
    });
}

export async function printTicketBluetooth(ticket: any) {
    try {
        const getColumns = (mm: string | number) => {
            const width = parseInt(String(mm));
            if (width <= 58) return 32;
            if (width <= 80) return 42;
            return 48; // Default for larger
        };

        const columns = getColumns(ticket.settings?.printer_width_mm || '58');

        const encoder = new ReceiptPrinterEncoder({
            language: 'esc-pos',
            width: columns,
        });

        // 1. Prepare Content
        const businessName = ticket.settings?.business_name || "EL RAPIDO";
        const ticketNum = ticket.ticket_number || "----";
        const date = new Date(ticket.created_at || Date.now());
        const dateStr = date.toLocaleDateString("es-NI") + " " + date.toLocaleTimeString("es-NI", { hour: "2-digit", minute: "2-digit" });
        const clientName = ticket.customer?.name || "Cliente General";
        const plate = ticket.customer?.plate ? String(ticket.customer.plate).toUpperCase() : "";

        const hr = '-'.repeat(columns);

        // 2. Build Recipe
        // Start directly with alignment to avoid potential reset feed from initialize()
        encoder.align('center');

        // 1. Logo (tightly coupled with header)
        if (ticket.settings?.logo_url) {
            try {
                const img = await loadImage(ticket.settings.logo_url);
                encoder.image(img, 160, 160, 'atkinson');
            } catch (e) {
                console.warn("Could not load logo for printing", e);
            }
        }

        // 2. Encabezado de Empresa
        encoder
            .size('normal')
            .line(businessName.toUpperCase())
            .size('small')
            .line(ticket.settings?.address || "")
            .line(`Tel: ${ticket.settings?.phone || ""}`);

        if (ticket.settings?.ruc) encoder.line(`RUC: ${ticket.settings.ruc}`);
        if (ticket.settings?.social_media) encoder.line(`Social: ${ticket.settings.social_media}`);

        // 3. Información del Ticket
        encoder
            .size('normal')
            .align('left')
            .line(`TICKET #: ${ticketNum}`)
            .line(`FECHA: ${dateStr}`)
            .line(`CLIENTE: ${clientName.toUpperCase()}`);

        if (plate) {
            encoder.line(`PLACA: ${plate}`);
        }

        // 4. Detalle de Servicios
        encoder
            .line(hr)
            .line('SERVICIOS');

        const items = Array.isArray(ticket.items) ? ticket.items : [];
        items.forEach((item: any) => {
            const name = item?.serviceName ?? "Servicio";
            const price = Number(item?.price || 0);
            const priceStr = ` C$${price.toFixed(2)}`;
            const nameWidth = Math.max(0, columns - priceStr.length);

            encoder.size('normal').line(`${name.substring(0, nameWidth).padEnd(nameWidth)}${priceStr}`);

            if (item.vehicleLabel) {
                encoder.size('small').line(` (${item.vehicleLabel})`);
            }
        });

        // 5. Totales
        encoder
            .size('normal')
            .line(hr)
            .align('right')
            .line(`SUBTOTAL: C$${Number(ticket.subtotal || 0).toFixed(2)}`);

        if (Number(ticket.discount || 0) > 0) {
            encoder.line(`DESCUENTO: -C$${Number(ticket.discount).toFixed(2)}`);
        }

        encoder
            .bold(true)
            .line(`TOTAL: C$${Number(ticket.total || 0).toFixed(2)}`)
            .bold(false)
            .newline();

        // 6. Información de Pago
        if (ticket.payment) {
            encoder
                .line(hr)
                .align('left')
                .size('small')
                .line(`PAGO (${ticket.payment.method}): ${ticket.payment.currency === 'NIO' ? 'C$' : '$'}${ticket.payment.received.toFixed(2)}`);
            if (ticket.payment.change > 0) {
                encoder.line(`VUELTO: ${ticket.payment.currency === 'NIO' ? 'C$' : '$'}${ticket.payment.change.toFixed(2)}`);
            }
            encoder.newline();
        }

        // 7. Pie de Página (Footer) - ASEGURADO AL FINAL
        encoder
            .size('normal')
            .align('center')
            .line(hr)
            .line(ticket.settings?.receipt_footer || "¡GRACIAS POR SU VISITA!")
            .line("VUELVA PRONTO")
            .newline()
            .newline()
            .newline()
            .newline()
            .newline()
            .cut();

        const result = encoder.encode();

        // 3. Connect Bluetooth
        console.log("Requesting Bluetooth Device...");
        const device = await (navigator as any).bluetooth.requestDevice({
            filters: [
                { services: ['000018f0-0000-1000-8000-00805f9b34fb'] },
                { services: ['49535343-fe7d-41aa-8956-727e70a863f5'] },
                { services: ['e7e11000-202d-4573-90d2-97914f177291'] },
                { namePrefix: 'PR' },
                { namePrefix: 'Printer' },
                { namePrefix: 'ZJ' }
            ],
            optionalServices: [
                '000018f0-0000-1000-8000-00805f9b34fb',
                '49535343-fe7d-41aa-8956-727e70a863f5',
                'e7e11000-202d-4573-90d2-97914f177291',
                '0000180a-0000-1000-8000-00805f9b34fb', // Device Info Service
                '0000ae01-0000-1000-8000-00805f9b34fb' // Common BLE Printer Service
            ]
        }).catch(async () => {
            return await (navigator as any).bluetooth.requestDevice({
                acceptAllDevices: true,
                optionalServices: [
                    '000018f0-0000-1000-8000-00805f9b34fb',
                    '49535343-fe7d-41aa-8956-727e70a863f5',
                    'e7e11000-202d-4573-90d2-97914f177291',
                    '0000ae01-0000-1000-8000-00805f9b34fb'
                ]
            });
        });

        console.log("Connecting to GATT Server...");
        const server = await device.gatt.connect();

        console.log("Getting Primary Service...");
        const services = await server.getPrimaryServices();
        let characteristic;

        for (const service of services) {
            console.log(`Checking service: ${service.uuid}`);
            try {
                const characteristics = await service.getCharacteristics();
                characteristic = characteristics.find(c => c.properties.write || c.properties.writeWithoutResponse);
                if (characteristic) {
                    console.log(`Found characteristic: ${characteristic.uuid} in service: ${service.uuid}`);
                    break;
                }
            } catch (e) {
                console.warn(`Error getting characteristics for ${service.uuid}`);
            }
        }

        if (!characteristic) {
            throw new Error("No se encontró una característica de escritura válida.");
        }

        console.log("Sending data in chunks with delays...");
        const chunkSize = 20; // Some printers have VERY small buffers
        for (let i = 0; i < result.length; i += chunkSize) {
            const chunk = result.slice(i, i + chunkSize);
            if (characteristic.properties.writeWithoutResponse) {
                await characteristic.writeValueWithoutResponse(chunk);
            } else {
                await characteristic.writeValueWithResponse(chunk);
            }
            await delay(50); // Small delay to prevent buffer overflow
        }

        console.log("Print successful!");
        return true;

    } catch (error) {
        console.error("Bluetooth Print Error:", error);
        throw error;
    }
}
