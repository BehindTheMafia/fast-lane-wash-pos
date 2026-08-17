# Corrección de Reportes - Venta de Membresías

## Problema Identificado

Cuando se registraba una venta de membresía, en la página de Reportes (`/reports`) aparecían campos vacíos:
- **Cliente**: Mostraba "—" en lugar del nombre del cliente
- **Servicio**: Mostraba "—" en lugar del nombre del servicio
- **Placa**: Mostraba "—" en lugar de la placa del vehículo

## Causa del Problema

En el archivo `src/pages/Memberships.tsx`, al crear el ticket para la venta de membresía, **no se estaban guardando** los siguientes datos:
1. `customer_id` - ID del cliente que compró la membresía
2. `vehicle_plate` - Placa del vehículo del cliente
3. No se creaba un registro en `ticket_items` con el servicio

## Solución Implementada

Se modificó el archivo `/Users/macbookair/Documents/AUTOLAVADO/fast-lane-wash-pos/src/pages/Memberships.tsx`:

### 1. Obtener datos del cliente (líneas 141-146)
```typescript
// Get customer data for plate information
const { data: customerData } = await supabase
  .from("customers")
  .select("plate")
  .eq("id", Number(selectedCustomer))
  .single();
```

### 2. Incluir customer_id y vehicle_plate en el ticket (líneas 148-161)
```typescript
const { data: ticket, error: ticketErr } = await supabase
  .from("tickets")
  .insert({
    ticket_number: ticketNumber,
    user_id: user.id,
    customer_id: Number(selectedCustomer), // ✅ AGREGADO
    vehicle_type_id: selectedVehicleType,
    vehicle_plate: customerData?.plate || "", // ✅ AGREGADO
    total: membershipPrice,
    status: "paid",
  } as any)
  .select()
  .single();
```

### 3. Crear ticket_item para el servicio (líneas 188-199)
```typescript
// Create ticket_item for the service (so it shows in reports)
const { error: ticketItemErr } = await supabase.from("ticket_items").insert({
  ticket_id: (ticket as any).id,
  service_id: selectedService,
  price: membershipPrice,
} as any);

if (ticketItemErr) {
  console.error("Error creating ticket item:", ticketItemErr);
  throw ticketItemErr;
}
```

## Resultado

Ahora cuando se registre una venta de membresía, en la página de Reportes se mostrarán **todos los campos correctamente**:

| Campo | Antes | Después |
|-------|-------|---------|
| **#** | M-MLPQG9XI | M-MLPQG9XI |
| **Fecha** | 16/02/2026 | 16/02/2026 |
| **Hora** | 04:15 p. m. | 04:15 p. m. |
| **Servicio** | ❌ — | ✅ Lavado Rápido – Breve |
| **Vehículo** | Moto | Moto |
| **Placa** | ❌ — | ✅ ABC-123 (placa del cliente) |
| **Cliente** | ❌ — | ✅ Josue Tercero |
| **Método** | Efectivo | Efectivo |
| **Registró** | Josue Tercero | Josue Tercero |
| **Total** | C$768 | C$768 |

## Datos Obtenidos de la Base de Datos

Los datos se obtienen de las siguientes tablas:
- **Cliente**: `customers.name` (usando `customer_id`)
- **Placa**: `customers.plate` (usando `customer_id`)
- **Servicio**: `services.name` (a través de `ticket_items.service_id`)
- **Vehículo**: `vehicle_types.name` (usando `vehicle_type_id`)
- **Registró**: `profiles.full_name` (usando `user_id`)
- **Método**: `payments.payment_method`

## Archivos Modificados

- ✅ `/Users/macbookair/Documents/AUTOLAVADO/fast-lane-wash-pos/src/pages/Memberships.tsx`

## Próximos Pasos

1. Probar la venta de una nueva membresía
2. Verificar que todos los campos aparezcan en `/reports`
3. Confirmar que los datos históricos anteriores seguirán mostrando "—" en los campos que no se guardaron (esto es normal, solo las nuevas ventas tendrán todos los datos)
