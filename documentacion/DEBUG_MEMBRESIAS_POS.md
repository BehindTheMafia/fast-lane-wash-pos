# DEBUG - Problema de Membresías en POS

## Fecha: 2026-02-16 16:03

### 🐛 Problema Observado

Según la captura de pantalla:
1. ✅ Cliente SILVIO seleccionado
2. ✅ Vehículo SUV auto-seleccionado (correcto)
3. ❌ Servicios se muestran normalmente (debería mostrar "Membresía Activa")
4. ❌ Mensaje "Servicio no aplica para esta membresía" en ambas membresías
5. ❌ Total C$0.00 pero sin items en el ticket

### 🔍 Diagnóstico

El problema es que `membership.services` probablemente es `null` o `undefined`, lo que impide que se agregue el servicio automáticamente al ticket.

### 🧪 Pasos de Debugging

#### 1. Abrir la Consola del Navegador
- Presiona **F12**
- Ve a la pestaña **Console**

#### 2. Recargar la Página
- Presiona **Ctrl + Shift + R** para forzar recarga

#### 3. Seleccionar Cliente con Membresía
- Selecciona cliente "SILVIO"
- Busca en la consola:
  ```
  [useMemberships] Loaded memberships with services: Array(X)
  ```

#### 4. Expandir el Array
- Haz clic en el array para expandirlo
- Verifica que cada membresía tenga la propiedad `services`
- **Ejemplo esperado**:
  ```javascript
  {
    id: 10,
    customer_id: 3,
    service_id: 1,
    vehicle_type_id: 1,
    services: {  // ← Esto debe existir
      id: 1,
      name: "Lavado Rápido – Breve",
      description: "..."
    },
    // ... otros campos
  }
  ```

#### 5. Seleccionar la Membresía
- Haz clic en "Seleccionar" membresía
- Haz clic en la membresía de SILVIO
- Busca en la consola:
  ```
  [POS] Membership selected: {id: 10, ...}
  [POS] Membership services: {id: 1, name: "...", ...}
  [POS] Membership vehicle_type_id: 1
  [POS] Auto-selected vehicle: 1
  [POS] Added membership service to ticket
  ```

#### 6. Reportar Resultados

**Si ves**:
```
[POS] Cannot add service - membershipService: null vehicle_type_id: 1
```

**Significa**: Los servicios NO se están cargando correctamente en el hook `useMemberships`

**Si ves**:
```
[POS] Added membership service to ticket
```

**Significa**: El servicio se agregó correctamente, pero hay otro problema en la UI

---

### 🔧 Posibles Causas y Soluciones

#### Causa 1: Servicios No Se Cargan
**Síntoma**: `membership.services` es `null`

**Verificar**:
```
[useMemberships] Loaded memberships with services: Array(3)
```
- Expandir el array
- Verificar que cada objeto tenga `services: {...}`

**Si NO tiene `services`**:
- Hay un problema con la consulta de servicios en `useMemberships.tsx`
- Posiblemente los `service_id` son `null` en la base de datos

#### Causa 2: service_id es NULL en la Base de Datos
**Verificar en Supabase**:
```sql
SELECT id, customer_id, service_id, vehicle_type_id
FROM customer_memberships
WHERE active = true;
```

**Resultado esperado**:
- Todas las filas deben tener `service_id` NO NULL
- Ejemplo: `service_id: 1` o `service_id: 2`

**Si `service_id` es NULL**:
- Necesitamos actualizar las membresías existentes
- O crear nuevas membresías con `service_id`

#### Causa 3: Error en el JOIN Manual
**Verificar**:
```
[useMemberships] Loaded memberships with services: Array(3)
```
- Si el array está vacío, hay un error en la consulta
- Si el array tiene datos pero sin `services`, el JOIN manual falló

---

### 📋 Checklist de Debugging

Por favor, ejecuta estos pasos y reporta los resultados:

- [ ] 1. Abrir consola del navegador (F12)
- [ ] 2. Recargar página (Ctrl+Shift+R)
- [ ] 3. Seleccionar cliente SILVIO
- [ ] 4. Buscar log: `[useMemberships] Loaded memberships with services:`
- [ ] 5. Expandir el array y verificar si tiene `services: {...}`
- [ ] 6. Hacer clic en "Seleccionar" membresía
- [ ] 7. Seleccionar la membresía
- [ ] 8. Buscar logs:
  - `[POS] Membership selected:`
  - `[POS] Membership services:`
  - `[POS] Added membership service to ticket` O `[POS] Cannot add service`

---

### 📊 Información Requerida

Por favor, copia y pega de la consola:

#### Log 1: Membresías Cargadas
```
[useMemberships] Loaded memberships with services: ???
```

#### Log 2: Membresía Seleccionada
```
[POS] Membership selected: ???
[POS] Membership services: ???
[POS] Membership vehicle_type_id: ???
```

#### Log 3: Resultado
```
[POS] Added membership service to ticket
O
[POS] Cannot add service - membershipService: ??? vehicle_type_id: ???
```

#### Errores (si hay)
```
(Copia cualquier error en rojo que veas)
```

---

### 🔄 Próximos Pasos

Según los logs que me proporciones, podré:
1. Identificar exactamente dónde está fallando
2. Corregir el problema específico
3. Verificar que funcione correctamente

**Por favor, ejecuta el debugging y reporta los resultados de la consola.**
