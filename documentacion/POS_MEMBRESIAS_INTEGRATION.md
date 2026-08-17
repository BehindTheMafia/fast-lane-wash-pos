# Integración de Membresías en POS - Documentación

## Fecha: 2026-02-16

### ✅ Funcionalidad Implementada

Se ha integrado completamente el sistema de membresías en el POS, permitiendo a los clientes usar sus membresías de forma automática y sencilla.

## Flujo de Uso de Membresías en POS

### 1. **Selección de Cliente con Membresía**

Cuando se selecciona un cliente que tiene una membresía activa:
- ✅ Aparece la sección "Membresía disponible"
- ✅ Muestra un botón "Seleccionar" para ver las membresías activas
- ✅ Solo se muestran membresías con lavados restantes y no expiradas

### 2. **Selección de Membresía**

Al hacer clic en "Seleccionar":
- ✅ Se despliega una lista de membresías activas del cliente
- ✅ Cada membresía muestra:
  - Nombre del plan (ej: "Combo 8 Lavados")
  - Tipo de vehículo (ej: "Moto", "Sedán", "SUV")
  - Descuento (36%)
  - Lavados restantes (ej: "8 lavados")
  - Días restantes (ej: "28d")

### 3. **Restricciones Automáticas**

Cuando se selecciona una membresía:

#### A. Tipo de Vehículo
- ✅ **Se auto-selecciona** el tipo de vehículo de la membresía
- ✅ **Se bloquean** todos los demás tipos de vehículo
- ✅ Solo se puede usar la membresía con el vehículo para el que fue comprada

**Ejemplo**: Si la membresía es para "Moto", solo se puede seleccionar Moto

#### B. Servicios
- ✅ **Se oculta** la sección de selección de servicios
- ✅ **Se muestra** un mensaje indicando que el servicio ya está agregado
- ✅ **Se agrega automáticamente** el servicio de la membresía al ticket
- ✅ El servicio muestra: "{Nombre del Servicio} (Membresía - X lavados restantes)"

**Ejemplo**: "Lavado Rápido – Breve (Membresía - 8 lavados restantes)"

#### C. Precio
- ✅ **El precio es C$0.00** automáticamente
- ✅ No se puede modificar el precio
- ✅ No se pueden aplicar descuentos adicionales
- ✅ El total del ticket es C$0.00

### 4. **Pantalla de Servicios cuando Membresía está Activa**

En lugar de mostrar los servicios disponibles, se muestra:

```
┌─────────────────────────────────────┐
│         🎫 Membresía Activa         │
│                                     │
│  El servicio de tu membresía ya     │
│  está agregado al ticket            │
│                                     │
│  Lavado Rápido – Breve - Moto      │
│                                     │
│        Total: C$0.00                │
└─────────────────────────────────────┘
```

### 5. **Ticket con Membresía**

El ticket muestra:
- ✅ Servicio: "Lavado Rápido – Breve (Membresía - 8 lavados restantes)"
- ✅ Vehículo: "Moto"
- ✅ Precio: C$0.00
- ✅ Subtotal: C$0.00
- ✅ Total: C$0.00

### 6. **Proceso de Cobro**

Al hacer clic en "COBRAR":
- ✅ Se abre el modal de pago
- ✅ El total es C$0.00
- ✅ Se confirma el pago (sin necesidad de ingresar dinero)
- ✅ Se registra el uso de la membresía en la base de datos
- ✅ Se decrementa el contador de lavados restantes

### 7. **Deseleccionar Membresía**

Si el usuario decide no usar la membresía:
- ✅ Puede hacer clic en la X para deseleccionar
- ✅ Se limpia el ticket
- ✅ Se habilitan nuevamente todos los tipos de vehículo disponibles
- ✅ Se muestra la selección normal de servicios
- ✅ Los precios vuelven a ser normales

## Cambios Técnicos Realizados

### 1. **Hook `useMemberships.tsx`** ✅

**Cambios**:
- Agregado `service_id` a la interfaz `Membership`
- Agregado `services` al query para obtener información del servicio
- Incluye: `id`, `name`, `description` del servicio

```typescript
services?: {
    id: number;
    name: string;
    description: string | null;
};
```

### 2. **Componente `POS.tsx`** ✅

**Cambios principales**:

#### A. Restricción de Tipo de Vehículo
```typescript
// Si hay membresía seleccionada, solo permite el vehículo de la membresía
const isMembershipRestricted = selectedMembership && 
    selectedMembership.vehicle_type_id !== vt.id;
```

#### B. Auto-agregar Servicio de Membresía
```typescript
onMembershipSelect={(membership) => {
    if (membership) {
        // Auto-seleccionar vehículo
        setSelectedVehicleId(membership.vehicle_type_id);
        
        // Auto-agregar servicio con precio C$0
        setTicketItems([{
            serviceId: membershipService.id,
            serviceName: `${membershipService.name} (Membresía - ${washesRemaining} lavados restantes)`,
            vehicleTypeId: membership.vehicle_type_id,
            vehicleLabel: vt?.label || "",
            price: 0,
            discountPercent: 0,
        }]);
    }
}}
```

#### C. Ocultar Servicios cuando Membresía está Activa
```typescript
{selectedMembership ? (
    // Mostrar mensaje de membresía activa
    <div className="pos-card p-6 text-center">
        <i className="fa-solid fa-id-card text-4xl text-primary mb-3" />
        <p>Membresía Activa</p>
        <p>Total: C$0.00</p>
    </div>
) : (
    // Mostrar servicios normales
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Servicios */}
    </div>
)}
```

### 3. **Registro de Uso de Membresía** ✅

En `handlePaymentComplete`:
```typescript
// Registrar uso de membresía
if (selectedMembershipId && ticketItems.length > 0) {
    await recordWash({
        membershipId: selectedMembershipId,
        ticketId: ticket.id,
        serviceId: ticketItems[0].serviceId,
        isBonus: false,
    });
}
```

## Validaciones Implementadas

### ✅ Validación 1: Solo Vehículo de Membresía
- Si membresía es para "Moto", solo se puede seleccionar Moto
- Otros vehículos aparecen bloqueados con candado 🔒

### ✅ Validación 2: Servicio Automático
- No se puede seleccionar manualmente un servicio
- El servicio de la membresía se agrega automáticamente

### ✅ Validación 3: Precio Fijo C$0.00
- El precio no se puede modificar
- No se pueden aplicar descuentos adicionales
- El total siempre es C$0.00

### ✅ Validación 4: Lavados Restantes
- Solo se pueden usar membresías con lavados disponibles
- Se muestra claramente cuántos lavados quedan

### ✅ Validación 5: Membresías Expiradas
- No se muestran membresías expiradas
- Solo aparecen membresías activas y vigentes

## Ejemplo de Uso Completo

### Escenario: Cliente con Membresía de Moto

1. **Seleccionar cliente**: "Juan Pérez"
   - Tiene membresía: "Combo 8 Lavados - Moto"
   - Lavados usados: 0/8
   - Días restantes: 28

2. **Aparece**: "Membresía disponible" → Clic en "Seleccionar"

3. **Se muestra**:
   ```
   Combo 8 Lavados
   Moto
   36% desc. | 8 lavados | 28d
   ```

4. **Al seleccionar la membresía**:
   - ✅ Vehículo: Solo "Moto" disponible (auto-seleccionado)
   - ✅ Servicios: Mensaje "Membresía Activa"
   - ✅ Ticket: "Lavado Rápido – Breve (Membresía - 8 lavados restantes)"
   - ✅ Total: C$0.00

5. **Clic en "COBRAR"**:
   - Modal de pago con C$0.00
   - Confirmar pago
   - ✅ Ticket registrado
   - ✅ Membresía actualizada: 1/8 lavados usados

## Base de Datos

### Tabla `customer_memberships`
```sql
- service_id: ID del servicio incluido en la membresía
- vehicle_type_id: ID del tipo de vehículo
- washes_used: Lavados ya usados
- total_washes_allowed: Total de lavados permitidos (8)
```

### Tabla `membership_washes`
```sql
- membership_id: ID de la membresía
- ticket_id: ID del ticket donde se usó
- service_id: ID del servicio usado
- is_bonus: false (no es lavado bonus)
```

## Estado Final

✅ **COMPLETAMENTE FUNCIONAL**

El sistema ahora:
1. ✅ Restringe el tipo de vehículo al de la membresía
2. ✅ Agrega automáticamente el servicio de la membresía
3. ✅ Establece el precio en C$0.00
4. ✅ Oculta la selección manual de servicios
5. ✅ Muestra claramente el estado de la membresía
6. ✅ Registra correctamente el uso en la base de datos
7. ✅ Actualiza el contador de lavados restantes

**¡El cliente puede usar su membresía de forma intuitiva y sin errores!** 🎉
