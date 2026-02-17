# Guía de Configuración del Ticket Profesional

## Cambios Realizados

### 1. Base de Datos
Se agregaron nuevos campos a la tabla `business_settings`:
- `social_media`: Para mostrar redes sociales (ej: @elrapidonica)
- `ruc`: Campo específico para RUC/NIT
- `printer_width_mm`: Ancho de impresora configurable (58mm, 80mm, 110mm)
- `logo_url`: URL del logo del negocio
- `receipt_footer`: Mensaje personalizado de despedida

### 2. Interfaz de Configuración (Settings)
Ahora puedes configurar desde http://localhost:8080/settings:
- ✅ Datos del negocio (nombre, dirección, teléfono, RUC)
- ✅ Redes sociales
- ✅ Logo del negocio (subir imagen hasta 2MB)
- ✅ Mensaje de despedida personalizado
- ✅ Ancho de impresora (58mm, 80mm, 110mm)
- ✅ Tasa de cambio

### 3. Diseño del Ticket Mejorado
El ticket ahora incluye:
- 🎨 Logo del negocio (si está configurado)
- 📍 Dirección completa
- 📞 Teléfono con icono
- 🏢 RUC
- 📱 Redes sociales con icono de Instagram
- ✨ Separadores decorativos con líneas punteadas
- 🌟 Estrellas decorativas al final
- 💬 Mensaje de despedida personalizable
- 📏 Ancho dinámico según configuración

## Pasos para Aplicar los Cambios

### Paso 1: Aplicar Migración de Base de Datos
Debes ejecutar los siguientes archivos SQL en el SQL Editor de Supabase:

1. **Agregar campos a business_settings:**
   - Archivo: `supabase/add_ticket_settings.sql`
   - Ve a: https://supabase.com/dashboard/project/[TU-PROJECT-ID]/sql
   - Copia y pega el contenido del archivo
   - Ejecuta

2. **Crear bucket de almacenamiento para logos:**
   - Archivo: `supabase/create_storage_bucket.sql`
   - Ejecuta en el mismo SQL Editor

### Paso 2: Configurar tu Negocio
1. Ve a http://localhost:8080/settings
2. Completa todos los campos:
   - **Nombre del negocio**: EL RAPIDO AUTOLAVADO
   - **Dirección**: Esquina del banco lafise de nindiri 500 metros al norte
   - **Teléfono**: 57037623
   - **RUC/NIT**: Tu número de RUC
   - **Redes Sociales**: @elrapidonica
   - **Logo**: Sube el logo de tu negocio (máx 2MB)
   - **Mensaje de despedida**: Personaliza el mensaje final
   - **Ancho de impresora**: Selecciona 80mm (o el que uses)

3. Haz clic en "Guardar configuración"

### Paso 3: Probar el Ticket
1. Ve al POS (http://localhost:8080/pos)
2. Crea una venta de prueba
3. Haz clic en "Imprimir Ticket"
4. Verifica que se vea toda la información correctamente
5. Imprime o guarda como PDF para verificar el formato

## Características del Nuevo Diseño

### Tipografía Mejorada
- Título en negrita y mayúsculas con espaciado amplio
- Tamaños de fuente optimizados para lectura en papel térmico
- Jerarquía visual clara

### Elementos Visuales
- Logo centrado en la parte superior
- Iconos para teléfono y redes sociales
- Líneas divisorias decorativas con estilo punteado
- Estrellas decorativas al final

### Información Organizada
1. **Encabezado**: Logo + Datos del negocio
2. **Info del Ticket**: Número, fecha, cliente, placa
3. **Servicios**: Lista detallada con tipo de vehículo
4. **Totales**: Subtotal, descuento, total
5. **Pago**: Método, monto recibido, vuelto
6. **Pie**: Mensaje personalizado + estrellas

### Soporte Multi-Impresora
El ticket se ajusta automáticamente al ancho configurado:
- **58mm**: Para impresoras pequeñas portátiles
- **80mm**: Estándar (más común)
- **110mm**: Para impresoras grandes

## Solución de Problemas

### El logo no se muestra
1. Verifica que el bucket 'business-assets' existe en Supabase Storage
2. Asegúrate de que las políticas de acceso público están configuradas
3. Intenta subir el logo nuevamente

### Los campos no se guardan
1. Verifica que ejecutaste la migración SQL
2. Revisa la consola del navegador para errores
3. Asegúrate de estar autenticado

### El ticket se ve cortado al imprimir
1. Ve a Settings y ajusta el ancho de impresora
2. En la ventana de impresión, selecciona el tamaño de papel correcto
3. Asegúrate de que los márgenes estén en "Ninguno" o "Mínimo"

## Archivos Modificados

- ✅ `src/pages/Settings.tsx` - Interfaz de configuración expandida
- ✅ `src/components/pos/TicketPrint.tsx` - Diseño profesional del ticket
- ✅ `src/index.css` - Estilos de impresión mejorados
- ✅ `src/integrations/supabase/types.ts` - Tipos actualizados
- ✅ `supabase/add_ticket_settings.sql` - Migración de BD
- ✅ `supabase/create_storage_bucket.sql` - Configuración de storage

## Próximos Pasos Recomendados

1. **Personaliza tu ticket** con tu logo y datos reales
2. **Prueba la impresión** con tu impresora térmica
3. **Ajusta el mensaje de despedida** según tu marca
4. **Configura promociones** en el mensaje footer si deseas
