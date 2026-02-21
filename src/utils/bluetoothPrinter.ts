import ReceiptPrinterEncoder from '@point-of-sale/receipt-printer-encoder';

export async function printTicketBluetooth(ticket: any) {
    try {
        const encoder = new ReceiptPrinterEncoder({
            language: 'esc-pos',
            width: parseInt(ticket.settings?.printer_width_mm || '58'),
        });

        // 1. Prepare Content
        const businessName = ticket.settings?.business_name || "EL RAPIDO";
        const ticketNum = ticket.ticket_number || "----";
        const date = new Date(ticket.created_at || Date.now());
        const dateStr = date.toLocaleDateString("es-NI") + " " + date.toLocaleTimeString("es-NI", { hour: "2-digit", minute: "2-digit" });
        const clientName = ticket.customer?.name || "Cliente General";
        const plate = ticket.customer?.plate ? String(ticket.customer.plate).toUpperCase() : "";

        // 2. Build Recipe
        let result = encoder
            .initialize()
            .align('center')
            .line(businessName)
            .size('small')
            .line(ticket.settings?.address || "")
            .line(`Tel: ${ticket.settings?.phone || ""}`)
            .newline()
            .align('left')
            .line(`TICKET #: ${ticketNum}`)
            .line(`Fecha: ${dateStr}`)
            .line(`Cliente: ${clientName}`);

        if (plate) {
            result = result.line(`Placa: ${plate}`);
        }

        result = result
            .line('-'.repeat(32))
            .line('SERVICIOS');

        const items = Array.isArray(ticket.items) ? ticket.items : [];
        items.forEach((item: any) => {
            const name = item?.serviceName ?? "Servicio";
            const price = Number(item?.price || 0);
            result = result.line(`${name.substring(0, 20).padEnd(20)} C$${price.toFixed(2).padStart(8)}`);
        });

        result = result
            .line('-'.repeat(32))
            .align('right')
            .line(`SUBTOTAL: C$${Number(ticket.subtotal || 0).toFixed(2)}`);

        if (Number(ticket.discount || 0) > 0) {
            result = result.line(`DESCUENTO: -C$${Number(ticket.discount).toFixed(2)}`);
        }

        result = result
            .size('normal')
            .line(`TOTAL: C$${Number(ticket.total || 0).toFixed(2)}`)
            .newline()
            .align('center')
            .line(ticket.settings?.receipt_footer || "¡Gracias por su visita!")
            .newline()
            .newline()
            .cut()
            .encode();

        // 3. Connect Bluetooth
        console.log("Requesting Bluetooth Device...");
        const device = await (navigator as any).bluetooth.requestDevice({
            filters: [{ services: ['000018f0-0000-1000-8000-00805f9b34fb', '49535343-fe7d-41aa-8956-727e70a863f5'] }, { namePrefix: 'PR' }, { namePrefix: 'Printer' }],
            optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb', '49535343-fe7d-41aa-8956-727e70a863f5']
        }).catch(async () => {
            // Fallback to any device that looks like a printer
            return await (navigator as any).bluetooth.requestDevice({
                acceptAllDevices: true,
                optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb', '49535343-fe7d-41aa-8956-727e70a863f5']
            });
        });

        console.log("Connecting to GATT Server...");
        const server = await device.gatt.connect();

        console.log("Getting Primary Service...");
        // Most thermal printers use a specific service for data
        const services = await server.getPrimaryServices();
        let characteristic;

        for (const service of services) {
            const characteristics = await service.getCharacteristics();
            characteristic = characteristics.find(c => c.properties.write || c.properties.writeWithoutResponse);
            if (characteristic) break;
        }

        if (!characteristic) {
            throw new Error("No se encontró una característica de escritura en la impresora.");
        }

        console.log("Sending data in chunks...");
        const chunkSize = 512;
        for (let i = 0; i < result.length; i += chunkSize) {
            const chunk = result.slice(i, i + chunkSize);
            await characteristic.writeValue(chunk);
        }

        console.log("Print successful!");
        return true;

    } catch (error) {
        console.error("Bluetooth Print Error:", error);
        throw error;
    }
}
