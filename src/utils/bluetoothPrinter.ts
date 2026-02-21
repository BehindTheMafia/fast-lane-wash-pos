import ReceiptPrinterEncoder from '@point-of-sale/receipt-printer-encoder';
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

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

        // 2. Build Recipe (SIMPLIFIED for compatibility)
        let result = encoder
            .initialize()
            .align('center')
            .line(businessName)
            // Removed size('small') and address/phone for simplicity in testing
            .newline()
            .align('left')
            .line(`TICKET #: ${ticketNum}`)
            .line(`FECHA: ${dateStr}`)
            .line(`CLIENTE: ${clientName.toUpperCase()}`);

        if (plate) {
            result = result.line(`PLACA: ${plate}`);
        }

        result = result
            .line(hr)
            .line('SERVICIOS');

        const items = Array.isArray(ticket.items) ? ticket.items : [];
        items.forEach((item: any) => {
            const name = item?.serviceName ?? "Servicio";
            const price = Number(item?.price || 0);
            const priceStr = ` C$${price.toFixed(2)}`;
            const nameWidth = Math.max(0, columns - priceStr.length);
            result = result.line(`${name.substring(0, nameWidth).padEnd(nameWidth)}${priceStr}`);
        });

        result = result
            .line(hr)
            .align('right')
            .line(`TOTAL: C$${Number(ticket.total || 0).toFixed(2)}`)
            .newline()
            .align('center')
            .line(ticket.settings?.receipt_footer || "GRACIAS POR SU VISITA")
            .newline()
            .newline()
            .newline()
            .newline()
            .newline()
            // Removed cut() as many cheap printers don't support it and it might hang
            .encode();

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
