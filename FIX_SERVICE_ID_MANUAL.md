# SOLUCIÓN RÁPIDA - Actualizar service_id en Membresías

## Problema Identificado

Las membresías existentes tienen `service_id = NULL`, lo que impide que se cargue la información del servicio y que funcione correctamente el POS.

## Solución

Necesitas ejecutar este SQL en Supabase para actualizar las membresías existentes:

### Opción 1: Desde el Dashboard de Supabase

1. Ve a https://supabase.com/dashboard/project/dwbfmphghmquxigmczcc/editor
2. Abre el SQL Editor
3. Copia y pega este código:

```sql
-- Actualizar todas las membresías activas sin service_id
UPDATE customer_memberships
SET service_id = 1  -- Lavado Rápido – Breve
WHERE service_id IS NULL AND active = true;

-- Verificar que se actualizaron
SELECT 
    id,
    customer_id,
    service_id,
    vehicle_type_id,
    washes_used,
    total_washes_allowed,
    active
FROM customer_memberships
WHERE active = true
ORDER BY id;
```

4. Haz clic en "Run" o presiona `Ctrl + Enter`
5. Verifica que todas las membresías ahora tengan `service_id = 1`

### Opción 2: Actualizar Manualmente por Membresía

Si quieres asignar servicios específicos a cada membresía:

```sql
-- Para membresías de Moto → Lavado Breve (service_id = 1)
UPDATE customer_memberships
SET service_id = 1
WHERE vehicle_type_id = 1 AND service_id IS NULL;

-- Para membresías de Sedán → Lavado Breve (service_id = 1)
UPDATE customer_memberships
SET service_id = 1
WHERE vehicle_type_id = 2 AND service_id IS NULL;

-- Para membresías de SUV → Lavado Breve (service_id = 1)
UPDATE customer_memberships
SET service_id = 1
WHERE vehicle_type_id = 3 AND service_id IS NULL;

-- Para membresías de Pick up → Lavado Nítido (service_id = 2)
UPDATE customer_memberships
SET service_id = 2
WHERE vehicle_type_id = 4 AND service_id IS NULL;

-- Para membresías de Microbús → Lavado Nítido (service_id = 2)
UPDATE customer_memberships
SET service_id = 2
WHERE vehicle_type_id = 5 AND service_id IS NULL;
```

## Después de Ejecutar el SQL

1. **Recarga la aplicación** con `Ctrl + Shift + R`
2. **Ve a** http://localhost:8080/memberships
3. **Haz clic en "Activas"**
4. **Deberías ver** las 3 membresías activas con toda su información

5. **Ve a** http://localhost:8080/pos
6. **Selecciona cliente SILVIO**
7. **Haz clic en "Seleccionar" membresía**
8. **Selecciona la membresía**
9. **Deberías ver**:
   - Solo el vehículo de la membresía disponible
   - Mensaje "Membresía Activa"
   - Servicio agregado automáticamente al ticket
   - Total: C$0.00

## Verificación

En la consola del navegador (F12) deberías ver:

```
[useMemberships] Raw data from DB: Array(3)
[useMemberships] Service IDs found: [1, 2]
[useMemberships] Services data: Array(2)
[useMemberships] Loaded memberships with services: Array(3)
```

Y al seleccionar una membresía:

```
[POS] Membership selected: {id: 10, ...}
[POS] Membership services: {id: 1, name: "Lavado Rápido – Breve", ...}
[POS] Auto-selected vehicle: 1
[POS] Added membership service to ticket
```

## Si Aún No Funciona

Si después de ejecutar el SQL y recargar la página aún no funciona, revisa la consola y busca:

- `[useMemberships] No service_id found in memberships!` → El SQL no se ejecutó correctamente
- `[POS] Cannot add service` → Hay otro problema en la lógica

## Resumen

**El problema**: `service_id` es NULL en las membresías existentes
**La solución**: Ejecutar el UPDATE SQL para asignar `service_id = 1` a todas las membresías
**Resultado esperado**: Las membresías funcionarán correctamente en el POS

**Por favor, ejecuta el SQL en Supabase y luego recarga la aplicación.**
