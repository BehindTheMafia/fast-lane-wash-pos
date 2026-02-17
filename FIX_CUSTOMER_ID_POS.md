# Fix: Customer ID No Se Guardaba en Tickets del POS

## Problema Reportado

Al registrar una venta en el POS, el nombre del cliente no aparecía en los reportes, mostrando "—" en lugar del nombre del cliente.

**Ejemplo del problema**:
```
T-MLQUP3WV
17/02/2026  11:01 a.m.  Lavado Rápido – Nítido  Microbús  22  —  Efectivo  Josue Tercero  C$450
                                                                  ↑
                                                          No mostraba el cliente
```

## Causa Raíz

En el archivo `src/pages/POS.tsx`, cuando se creaba un ticket en la función `handlePaymentComplete()`, **NO se estaba guardando el `customer_id`** en la base de datos.

### Código Anterior (INCORRECTO):
```tsx
const { data: ticket, error: ticketErr } = await supabase
  .from("tickets")
  .insert({
    ticket_number: ticketNumber,
    user_id: user.id,
    vehicle_type_id: firstItem.vehicleTypeId,
    vehicle_plate: customer?.plate || "",
    total,
    status: "paid",
  } as any)
```

❌ Faltaba: `customer_id`

### Código Corregido (CORRECTO):
```tsx
const { data: ticket, error: ticketErr } = await supabase
  .from("tickets")
  .insert({
    ticket_number: ticketNumber,
    user_id: user.id,
    customer_id: customer?.id || null, // ✅ AGREGADO
    vehicle_type_id: firstItem.vehicleTypeId,
    vehicle_plate: customer?.plate || "",
    total,
    status: "paid",
  } as any)
```

✅ Ahora SÍ guarda el `customer_id`

## Solución Aplicada

**Archivo modificado**: `src/pages/POS.tsx` (línea 166)

**Cambio**: Agregada la línea:
```tsx
customer_id: customer?.id || null, // Save customer ID
```

## Verificación

### ✅ Memberships.tsx
Revisé el código de ventas de membresías y **SÍ estaba guardando correctamente** el `customer_id` (línea 154):
```tsx
customer_id: Number(selectedCustomer),
```

### ✅ POS.tsx
Ahora también guarda correctamente el `customer_id`.

## Resultado

Ahora cuando registres una venta en el POS:

1. **Con cliente seleccionado**: Se guardará el `customer_id` y el nombre aparecerá en reportes
2. **Con "Cliente General"**: Se guardará `customer_id = null` y mostrará "—" (comportamiento esperado)
3. **Programa de Lealtad**: Funcionará correctamente porque ahora tiene el `customer_id` asociado

## Pruebas

Para verificar que funciona:

1. Ve al POS (http://localhost:8080/)
2. Selecciona un cliente (no "Cliente General")
3. Agrega un servicio
4. Completa el pago
5. Ve a Reportes (http://localhost:8080/reports)
6. ✅ Deberías ver el nombre del cliente en la columna "Cliente"

## Impacto en Programa de Lealtad

Este fix también es **crítico para el programa de lealtad** porque:

- ✅ Ahora el `customer_id` se guarda en cada ticket
- ✅ La función `increment_loyalty_visit()` puede asociar correctamente las visitas al cliente
- ✅ El contador de lavados gratis funcionará correctamente

## Estado

✅ **CORREGIDO** - El servidor ya recargó los cambios automáticamente
✅ Listo para probar

---

**Fecha**: 2026-02-17
**Archivo**: `src/pages/POS.tsx`
**Línea**: 166
