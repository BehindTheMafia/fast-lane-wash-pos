# 🚀 INSTRUCCIONES PARA APLICAR MIGRACIÓN Y PROBAR

## ✅ Código Ya Actualizado

He descomentado el código en `src/pages/Memberships.tsx` para que use `customer_id` y `vehicle_plate`.

## 📋 Paso 1: Aplicar la Migración SQL

### Opción A: Copiar y Pegar en Supabase (MÁS FÁCIL)

1. **Abre el SQL Editor de Supabase**:
   ```
   https://supabase.com/dashboard/project/dwbfmphghmquxigmczcc/sql/new
   ```

2. **Inicia sesión** si es necesario

3. **Copia este SQL**:
   ```sql
   -- Agregar columna customer_id
   ALTER TABLE public.tickets 
   ADD COLUMN IF NOT EXISTS customer_id bigint REFERENCES public.customers(id);

   -- Crear índice
   CREATE INDEX IF NOT EXISTS idx_tickets_customer_id ON public.tickets(customer_id);
   ```

4. **Pega el SQL** en el editor

5. **Haz clic en "Run"** (botón verde)

6. **Verifica** que aparezca un mensaje de éxito ✅

### Opción B: Usar el archivo creado

Abre el archivo: `/Users/macbookair/Documents/AUTOLAVADO/fast-lane-wash-pos/MIGRATION_CUSTOMER_ID.sql`

Copia todo su contenido y pégalo en el SQL Editor de Supabase.

---

## 📋 Paso 2: Recargar la Aplicación

Una vez aplicada la migración:

1. Ve al navegador donde está corriendo la app (http://localhost:8080)
2. Presiona **Cmd + R** (o Ctrl + R) para recargar
3. O cierra y abre el navegador de nuevo

---

## 📋 Paso 3: Probar Venta de Membresía

1. **Ve a Membresías** en el menú lateral
2. **Haz clic en "Vender Membresía"**
3. **Busca un cliente** (ej: "Josue")
4. **Selecciona**:
   - Cliente: JOSUE TERCERO (o cualquier otro)
   - Servicio: Lavado Rápido – Breve
   - Vehículo: Sedán (o cualquier otro)
5. **Haz clic en "Proceder al Pago"**
6. **Ingresa el monto** (ej: 1000)
7. **Haz clic en "Confirmar Pago"**
8. **Espera** el mensaje de éxito

---

## 📋 Paso 4: Verificar en Reportes

1. **Ve a Reportes** en el menú lateral
2. **Haz clic en "Consultar"**
3. **Busca el ticket** con número M-XXXXX
4. **Verifica que aparezcan**:
   - ✅ **Cliente**: Josue Tercero (o el nombre del cliente)
   - ✅ **Placa**: La placa del cliente (si la tiene)
   - ✅ **Servicio**: Lavado Rápido – Breve
   - ✅ **Vehículo**: Sedán
   - ✅ **Método**: Efectivo
   - ✅ **Total**: C$896 (o el monto correspondiente)

---

## ⚠️ Si Hay Errores

### Error: "Could not find the 'customer_id' column"

**Causa**: La migración SQL no se aplicó correctamente.

**Solución**:
1. Verifica que hayas ejecutado el SQL en Supabase
2. Verifica que no haya errores en el SQL Editor
3. Intenta ejecutar el SQL de nuevo

### Error: "relation does not exist"

**Causa**: Estás en el proyecto incorrecto de Supabase.

**Solución**:
1. Verifica que estés en el proyecto `dwbfmphghmquxigmczcc`
2. Verifica la URL del SQL Editor

### La venta funciona pero no aparece en reportes

**Causa**: El filtro de fechas puede estar mal configurado.

**Solución**:
1. En Reportes, verifica que las fechas "Desde" y "Hasta" incluyan hoy
2. Haz clic en "Consultar" de nuevo

---

## 🎯 Resultado Esperado

Después de seguir estos pasos, cuando vendas una membresía:

| Campo | Antes | Después |
|-------|-------|---------|
| Cliente | ❌ — | ✅ Josue Tercero |
| Placa | ❌ — | ✅ ABC-123 |
| Servicio | ✅ Lavado Rápido – Breve | ✅ Lavado Rápido – Breve |
| Vehículo | ✅ Sedán | ✅ Sedán |
| Método | ✅ Efectivo | ✅ Efectivo |
| Total | ✅ C$896 | ✅ C$896 |

---

## 📞 ¿Necesitas Ayuda?

Si tienes algún problema, avísame y te ayudo a resolverlo.

**¡Listo para probar!** 🚀
