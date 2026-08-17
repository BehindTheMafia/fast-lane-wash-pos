# Instrucciones para Aplicar la Migración de CASCADE DELETE

## Problema
Al intentar eliminar tickets desde la página de Reportes, aparece el error:
```
Error al eliminar ticket: update or delete on table "tickets" violates foreign key constraint "ticket_items_ticket_id_fkey" on table "ticket_items"
```

## Solución
Aplicar la migración SQL que configura CASCADE DELETE en las foreign keys.

## Pasos para Aplicar la Migración

### Opción 1: Desde Supabase Dashboard (Recomendado)

1. Ve a tu proyecto en Supabase: https://supabase.com/dashboard
2. Navega a **SQL Editor** en el menú lateral
3. Haz clic en **New Query**
4. Copia y pega el contenido del archivo: `supabase/fix_cascade_delete.sql`
5. Haz clic en **Run** para ejecutar la migración
6. Deberías ver el mensaje: "Success. No rows returned"

### Opción 2: Usando CLI de Supabase

```bash
# Si tienes Supabase CLI instalado
npx supabase db push

# O ejecuta directamente el SQL
psql "postgresql://[TU_CONNECTION_STRING]" -f supabase/fix_cascade_delete.sql
```

### Opción 3: Usando el script de migración

```bash
# Desde la raíz del proyecto
node scripts/migrate.js
```

## Verificación

Después de aplicar la migración, verifica que funcione:

1. Ve a http://localhost:8080/reports
2. Intenta eliminar un ticket
3. Debería eliminarse sin errores

## ¿Qué hace esta migración?

La migración modifica las foreign key constraints de las siguientes tablas:

- ✅ `ticket_items` → CASCADE DELETE (elimina items cuando se elimina el ticket)
- ✅ `payments` → CASCADE DELETE (elimina pagos cuando se elimina el ticket)
- ✅ `membership_washes` → CASCADE DELETE (elimina registros de lavados cuando se elimina el ticket)
- ✅ `loyalty_visits` → SET NULL (pone NULL en ticket_id cuando se elimina el ticket)

Esto permite eliminar tickets sin errores de foreign key constraints.

## Cambios en el Código

También se han corregido los siguientes problemas en el código:

### 1. ✅ Modal de Reimpresión Arreglado
- **Archivo**: `src/pages/Reports.tsx`
- **Cambio**: La función `handleReprint()` ahora calcula correctamente `subtotal`, `discount`, y todos los campos necesarios
- **Resultado**: El modal de reimpresión ahora se abre correctamente

### 2. ✅ Datos de Pago Completos
- Se incluyen `received` y `change` en los datos de reimpresión
- Se calculan desde los datos históricos del ticket

## Pruebas

Después de aplicar la migración, prueba:

1. **Reimprimir Ticket**: ✅ Debería abrir el modal correctamente
2. **Editar Ticket**: ✅ Debería permitir editar placa y total
3. **Eliminar Ticket**: ✅ Debería eliminar sin errores de foreign key

---

**IMPORTANTE**: Aplica la migración SQL antes de probar la funcionalidad de eliminar tickets.
