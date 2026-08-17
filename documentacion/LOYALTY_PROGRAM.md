# Programa de Lealtad - Documentación

## Descripción General

Se ha implementado un programa de lealtad para clientes que permite:
- **Acumular visitas**: Cada compra de servicio (no membresías) cuenta como una visita
- **Ganar lavados gratis**: Cada 9 visitas, el cliente gana un lavado "Pasteado" (Lavado Rápido – Nítido) GRATIS
- **Seguimiento visual**: Los clientes pueden ver su progreso en la página de Clientes

## Características Implementadas

### 1. Base de Datos
- **Nuevas columnas en `customers`**:
  - `loyalty_visits`: Contador de visitas totales
  - `loyalty_last_visit`: Fecha de la última visita
  - `loyalty_free_washes_earned`: Total de lavados gratis ganados
  - `loyalty_free_washes_used`: Total de lavados gratis ya usados

- **Nueva tabla `loyalty_visits`**:
  - Registra cada visita individual del cliente
  - Vincula la visita con el ticket y servicio
  - Marca si la visita ganó un lavado gratis

- **Funciones de base de datos**:
  - `increment_loyalty_visit()`: Incrementa el contador y otorga lavados gratis automáticamente
  - `use_loyalty_free_wash()`: Marca un lavado gratis como usado
  - Vista `customer_loyalty_status`: Consulta optimizada del estado de lealtad

### 2. Interfaz de Usuario - Página de Clientes

La página de Clientes ahora muestra:
- **Contador de visitas**: Número total de visitas del cliente
- **Lavados gratis disponibles**: Badge destacado cuando hay lavados gratis
- **Barra de progreso**: Visualización del progreso hacia el próximo lavado gratis
- **Texto informativo**: "X lavados para pasteado gratis"

## Cómo Funciona

### Flujo de Compra Normal
1. Cliente compra un servicio en el POS
2. Al completar el pago, se llama a `increment_loyalty_visit()`
3. La función:
   - Incrementa el contador de visitas
   - Si `visitas % 9 == 0`, otorga un lavado gratis
   - Registra la visita en `loyalty_visits`
   - Retorna información sobre el estado actual

### Uso de Lavado Gratis
1. Cliente con lavados gratis disponibles llega al negocio
2. En el POS, se detecta que tiene lavados gratis
3. Se aplica el servicio "Pasteado" sin costo
4. Se llama a `use_loyalty_free_wash()` para marcar como usado

## Integración con el POS

**PENDIENTE**: Se necesita integrar la lógica del programa de lealtad en el POS:

```typescript
// En el POS, después de crear el ticket exitosamente:
if (selectedCustomer && !isMembershipPurchase) {
  // Llamar a la función de Supabase
  const { data, error } = await supabase.rpc('increment_loyalty_visit', {
    p_customer_id: selectedCustomer.id,
    p_ticket_id: ticketId,
    p_service_id: selectedService.id
  });
  
  if (data && data.earned_free_wash) {
    // Mostrar mensaje: "¡Felicidades! Has ganado un lavado Pasteado GRATIS"
    showToast(`¡Felicidades! Has ganado un lavado Pasteado GRATIS. Total disponibles: ${data.free_washes_available}`);
  }
}
```

## Reglas del Programa

1. **Solo compras regulares cuentan**: Las compras de membresías NO cuentan para el programa de lealtad
2. **Cada 9 visitas = 1 lavado gratis**: El servicio gratis es siempre "Lavado Rápido – Nítido" (Pasteado)
3. **Los lavados gratis no expiran**: Se acumulan hasta que el cliente los use
4. **Cliente General no participa**: Solo clientes registrados pueden participar

## Estado Actual

✅ **Completado**:
- Migración de base de datos aplicada
- Funciones de base de datos creadas
- Vista de estado de lealtad
- Interfaz de usuario en página de Clientes actualizada

⚠️ **Pendiente para Producción**:
- Integrar llamada a `increment_loyalty_visit()` en el POS al completar ventas
- Implementar lógica para aplicar lavados gratis en el POS
- Mostrar notificación cuando el cliente gana un lavado gratis
- Probar flujo completo de acumulación y uso de lavados gratis

## Próximos Pasos

1. **Actualizar el componente POS** para llamar a `increment_loyalty_visit()` después de cada venta
2. **Agregar opción en POS** para aplicar lavados gratis cuando el cliente los tiene disponibles
3. **Probar el flujo completo** con datos de prueba
4. **Documentar para el equipo** cómo usar el programa de lealtad
