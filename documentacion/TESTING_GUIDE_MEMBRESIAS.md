# Guía de Pruebas - Sistema de Membresías

## Fecha: 2026-02-16

### ⚠️ IMPORTANTE: Problema del Navegador

El navegador automatizado no está funcionando debido a un problema de entorno (`$HOME` variable no configurada). Por lo tanto, necesitarás hacer las pruebas manualmente.

## 🧪 Pruebas Manuales Requeridas

### Prueba 1: Verificar Página de Membresías

**URL**: http://localhost:8080/memberships

**Pasos**:
1. Abrir la página en tu navegador
2. Verificar que se muestren los planes de membresía:
   - "Combo 8 Lavados"
   - 36% descuento
   - 8 lavados
   - 28 días

3. Hacer clic en el botón "Activas"
4. **Verificar que se muestren las membresías activas**:
   - SILVIO - Combo 8 Lavados - Moto (0/8 lavados)
   - DOUGLAS - Combo 8 Lavados - Microbús (0/8 lavados)
   - DOUGLAS - Combo 8 Lavados - SUV (4/8 lavados)

**Resultado Esperado**:
✅ Se deben ver 3 tarjetas de membresías activas
✅ Cada tarjeta muestra: nombre del cliente, plan, vehículo, lavados usados, días restantes

**Si NO se muestran las membresías**:
- Abrir la consola del navegador (F12)
- Buscar errores en rojo
- Reportar cualquier error que veas

---

### Prueba 2: Verificar POS con Membresía

**URL**: http://localhost:8080/pos

**Pasos**:

#### A. Seleccionar Cliente con Membresía
1. Hacer clic en el botón de cliente (icono de usuario)
2. Buscar "SILVIO"
3. Seleccionar a SILVIO

**Resultado Esperado**:
✅ Debe aparecer una sección "Membresía disponible"
✅ Debe mostrar un botón "Seleccionar"

#### B. Seleccionar Membresía
4. Hacer clic en "Seleccionar"
5. Debe aparecer la membresía: "Combo 8 Lavados - Moto - 8 lavados - 28d"
6. Hacer clic en la membresía para seleccionarla

**Resultado Esperado**:
✅ El tipo de vehículo "Moto" debe auto-seleccionarse
✅ Los demás vehículos (Sedán, SUV, etc.) deben estar bloqueados con candado 🔒
✅ La sección de servicios debe cambiar a mostrar "Membresía Activa"
✅ Debe mostrar: "El servicio de tu membresía ya está agregado al ticket"
✅ Debe mostrar: "Lavado Rápido – Breve - Moto"
✅ Debe mostrar: "Total: C$0.00"

#### C. Verificar Ticket
7. Revisar el panel derecho del ticket

**Resultado Esperado**:
✅ Debe haber un item en el ticket:
   - Servicio: "Lavado Rápido – Breve (Membresía - 8 lavados restantes)"
   - Vehículo: "Moto"
   - Precio: C$0
✅ Subtotal: C$0.00
✅ Total: C$0.00

#### D. Procesar Pago
8. Hacer clic en "COBRAR"
9. Confirmar el pago (C$0.00)

**Resultado Esperado**:
✅ El ticket se debe crear exitosamente
✅ Debe mostrar el ticket de impresión
✅ La membresía debe actualizarse a 1/8 lavados usados

---

### Prueba 3: Verificar Restricciones

**URL**: http://localhost:8080/pos

**Pasos**:
1. Seleccionar cliente "SILVIO" (tiene membresía de Moto)
2. Hacer clic en "Seleccionar" membresía
3. Seleccionar la membresía

**Verificar Restricciones**:

#### A. Tipo de Vehículo
- ✅ Solo "Moto" debe estar disponible
- ✅ "Sedán" debe estar bloqueado
- ✅ "SUV" debe estar bloqueado
- ✅ "Pick up" debe estar bloqueado
- ✅ "Microbús" debe estar bloqueado
- ✅ Los bloqueados deben mostrar un candado 🔒

#### B. Servicios
- ✅ NO debe mostrarse la lista de servicios
- ✅ Debe mostrar el mensaje "Membresía Activa"
- ✅ NO debe haber botón "Agregar al ticket"

#### C. Precio
- ✅ El precio debe ser C$0.00
- ✅ NO se debe poder modificar el precio
- ✅ NO se debe poder aplicar descuento

---

### Prueba 4: Deseleccionar Membresía

**URL**: http://localhost:8080/pos

**Pasos**:
1. Seleccionar cliente "SILVIO"
2. Seleccionar su membresía
3. Hacer clic en la X para deseleccionar la membresía

**Resultado Esperado**:
✅ El ticket debe limpiarse (sin items)
✅ Todos los tipos de vehículo deben habilitarse
✅ Debe volver a mostrarse la lista de servicios
✅ Los precios deben volver a ser normales

---

### Prueba 5: Cliente con Múltiples Membresías

**URL**: http://localhost:8080/pos

**Pasos**:
1. Seleccionar cliente "DOUGLAS" (tiene 2 membresías: SUV y Microbús)
2. Hacer clic en "Seleccionar" membresía

**Resultado Esperado**:
✅ Deben aparecer 2 membresías:
   - Combo 8 Lavados - SUV (4/8 lavados)
   - Combo 8 Lavados - Microbús (0/8 lavados)

3. Seleccionar la membresía de SUV

**Resultado Esperado**:
✅ Solo "SUV" debe estar disponible
✅ Servicio: "Lavado Rápido – Breve (Membresía - 4 lavados restantes)"
✅ Total: C$0.00

4. Deseleccionar y seleccionar la membresía de Microbús

**Resultado Esperado**:
✅ Solo "Microbús" debe estar disponible
✅ Servicio: "Lavado Rápido – Nítido (Membresía - 8 lavados restantes)"
✅ Total: C$0.00

---

## 🐛 Problemas Conocidos a Verificar

### Problema 1: Membresías no se muestran en /memberships

**Síntomas**:
- La página carga pero no muestra tarjetas de membresías
- El filtro "Activas" no muestra nada

**Posibles Causas**:
1. Error en la consulta de Supabase
2. Problema con el hook `useMemberships`
3. Error de TypeScript no detectado

**Cómo Verificar**:
1. Abrir consola del navegador (F12)
2. Ir a la pestaña "Console"
3. Buscar errores en rojo
4. Ir a la pestaña "Network"
5. Filtrar por "customer_memberships"
6. Verificar que la respuesta tenga datos

### Problema 2: Membresía no se auto-selecciona en POS

**Síntomas**:
- Al seleccionar una membresía, no pasa nada
- El vehículo no se auto-selecciona
- El servicio no se agrega automáticamente

**Posibles Causas**:
1. Error en el callback `onMembershipSelect`
2. Problema con el estado de React
3. Error de TypeScript

**Cómo Verificar**:
1. Abrir consola del navegador
2. Buscar errores cuando se selecciona la membresía
3. Verificar que `selectedMembership` tenga la propiedad `services`

---

## 📊 Verificación de Base de Datos

Si las pruebas fallan, ejecuta estas consultas SQL en Supabase:

### Consulta 1: Verificar Membresías Activas
```sql
SELECT 
    cm.id,
    c.name as customer_name,
    s.name as service_name,
    vt.name as vehicle_type_name,
    cm.washes_used,
    cm.total_washes_allowed,
    cm.active,
    cm.expires_at
FROM customer_memberships cm
LEFT JOIN customers c ON cm.customer_id = c.id
LEFT JOIN services s ON cm.service_id = s.id
LEFT JOIN vehicle_types vt ON cm.vehicle_type_id = vt.id
WHERE cm.active = true
ORDER BY cm.id DESC;
```

**Resultado Esperado**:
- Debe haber al menos 3 membresías activas
- Cada una debe tener `service_id` no nulo
- Cada una debe tener `vehicle_type_id` no nulo

### Consulta 2: Verificar Estructura de Membresía
```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'customer_memberships'
AND column_name IN ('service_id', 'vehicle_type_id')
ORDER BY column_name;
```

**Resultado Esperado**:
- `service_id`: integer, NOT NULL
- `vehicle_type_id`: bigint, nullable

---

## 📝 Reporte de Resultados

Por favor, reporta los resultados de cada prueba:

### Prueba 1: Membresías
- [ ] ✅ Se muestran los planes
- [ ] ✅ Se muestran las membresías activas
- [ ] ❌ NO se muestran (reportar error de consola)

### Prueba 2: POS con Membresía
- [ ] ✅ Aparece "Membresía disponible"
- [ ] ✅ Se auto-selecciona el vehículo
- [ ] ✅ Se muestra "Membresía Activa"
- [ ] ✅ Total es C$0.00
- [ ] ❌ Algo no funciona (reportar qué)

### Prueba 3: Restricciones
- [ ] ✅ Solo el vehículo de la membresía está disponible
- [ ] ✅ Otros vehículos están bloqueados
- [ ] ✅ No se muestran servicios
- [ ] ❌ Algo no funciona (reportar qué)

### Prueba 4: Deseleccionar
- [ ] ✅ El ticket se limpia
- [ ] ✅ Todos los vehículos se habilitan
- [ ] ✅ Vuelven a aparecer los servicios
- [ ] ❌ Algo no funciona (reportar qué)

### Prueba 5: Múltiples Membresías
- [ ] ✅ Se muestran ambas membresías
- [ ] ✅ Cada una restringe su vehículo
- [ ] ✅ Cada una muestra su servicio
- [ ] ❌ Algo no funciona (reportar qué)

---

## 🔧 Solución de Problemas

Si encuentras errores, por favor proporciona:
1. **Captura de pantalla** del error
2. **Mensaje de error** de la consola
3. **Paso específico** donde ocurre el error
4. **Navegador** que estás usando

Con esta información podré corregir los problemas específicos.
