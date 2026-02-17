# 🚀 Fast Lane Wash POS - Configuración Completa

## ✅ Estado Actual

### Repositorio
- ✅ Clonado exitosamente desde GitHub
- ✅ Dependencias instaladas (574 paquetes)
- ✅ Servidor de desarrollo corriendo en: **http://localhost:8080/**

### Configuración de Supabase
- ✅ Archivo `.env` configurado con:
  - Project ID: `dwbfmphghmquxigmczcc`
  - URL: `https://dwbfmphghmquxigmczcc.supabase.co`
  - API Key: Configurada

## 📋 Siguiente Paso: Aplicar Migraciones a la Base de Datos

Para que la aplicación funcione correctamente, necesitas aplicar las migraciones SQL a tu base de datos de Supabase.

### Opción 1: Usar el Dashboard de Supabase (Recomendado)

1. **Abre el Dashboard de Supabase**
   - Ve a: https://supabase.com/dashboard/project/dwbfmphghmquxigmczcc

2. **Navega al SQL Editor**
   - En el menú lateral, haz clic en **"SQL Editor"**

3. **Ejecuta el Script de Migración**
   - Haz clic en **"New query"**
   - Abre el archivo: `/Users/macbookair/Documents/AUTOLAVADO/fast-lane-wash-pos/supabase/complete_migration.sql`
   - Copia todo el contenido del archivo
   - Pégalo en el editor SQL
   - Haz clic en **"Run"** o presiona `Cmd + Enter`

4. **Verifica la Ejecución**
   - Deberías ver mensajes de éxito
   - Si hay errores, revisa que no existan tablas duplicadas

### Opción 2: Usar Supabase CLI

Si tienes Supabase CLI instalado:

```bash
cd /Users/macbookair/Documents/AUTOLAVADO/fast-lane-wash-pos

# Vincula tu proyecto
supabase link --project-ref dwbfmphghmquxigmczcc

# Aplica las migraciones
supabase db push
```

## 🗄️ Estructura de la Base de Datos

El script de migración creará las siguientes tablas:

### Tablas Principales
- **`business_settings`** - Configuración del negocio
- **`customers`** - Clientes del autolavado
- **`services`** - Servicios disponibles (Lavado Breve, Nítido)
- **`service_prices`** - Precios por tipo de vehículo
- **`tickets`** - Tickets de venta
- **`payments`** - Pagos realizados
- **`profiles`** - Perfiles de usuarios
- **`user_roles`** - Roles de usuarios (admin, cajero)

### Tablas de Membresías
- **`membership_plans`** - Planes de membresía
- **`customer_memberships`** - Membresías activas de clientes
- **`membership_washes`** - Historial de lavados de membresía

### Tablas de Lealtad
- **`loyalty_visits`** - Visitas del programa de lealtad
- **`customer_loyalty_status`** - Estado de lealtad de clientes (vista)

### Tablas de Caja
- **`cash_closures`** - Cierres de caja
- **`cash_expenses`** - Gastos registrados

### Datos Iniciales (Seed Data)

El script incluye datos de prueba:
- ✅ Cliente General (para ventas sin cliente específico)
- ✅ 2 Servicios: "Lavado Rápido – Breve" y "Lavado Rápido – Nítido"
- ✅ Precios para 5 tipos de vehículos (Moto, Sedán, SUV, Pickup, Microbús)
- ✅ 2 Planes de membresía: "Combo 8 Lavados" y "Cliente Frecuente"
- ✅ Configuración inicial del negocio

## 🔐 Seguridad (Row Level Security)

El script configura políticas de seguridad (RLS) para:
- **Admins**: Acceso completo a todas las tablas
- **Cajeros**: Pueden crear tickets, pagos, y ver reportes
- **Usuarios**: Solo pueden ver su propia información

## 🧪 Verificar la Instalación

Una vez aplicadas las migraciones:

1. **Abre la aplicación**: http://localhost:8080/

2. **Verifica las páginas**:
   - Dashboard
   - POS (Punto de Venta)
   - Clientes
   - Servicios
   - Membresías
   - Reportes
   - Cierre de Caja

3. **Prueba la conexión a la base de datos**:
   - La aplicación incluye una página de validación de DB
   - Navega a la sección de validación para verificar que todas las tablas estén accesibles

## 📱 Funcionalidades del Sistema

### Punto de Venta (POS)
- Crear tickets de venta
- Seleccionar servicios y tipo de vehículo
- Aplicar descuentos de membresía
- Procesar pagos en efectivo, tarjeta o transferencia
- Soporte para múltiples monedas (NIO/USD)

### Gestión de Clientes
- Registrar clientes con nombre, teléfono, placa
- Programa de lealtad (lavado gratis cada 9 visitas)
- Historial de compras

### Membresías
- Vender membresías con descuentos
- Rastrear lavados usados/disponibles
- Fechas de expiración (28 días por defecto)
- Lavados bonus

### Reportes
- Ventas por período
- Ingresos por servicio
- Estadísticas de clientes
- Análisis de membresías

### Cierre de Caja
- Conteo de efectivo (billetes y monedas)
- Registro de gastos
- Cálculo de diferencias
- Historial de cierres

## 🛠️ Comandos Útiles

```bash
# Iniciar servidor de desarrollo
npm run dev

# Compilar para producción
npm run build

# Ejecutar tests
npm test

# Linter
npm run lint
```

## 📞 Soporte

Si encuentras algún problema:
1. Verifica que las migraciones se hayan ejecutado correctamente
2. Revisa la consola del navegador para errores
3. Verifica que el archivo `.env` tenga las credenciales correctas
4. Asegúrate de que tu usuario de Supabase tenga los permisos necesarios

## 🎉 ¡Listo!

Una vez aplicadas las migraciones, tu sistema Fast Lane Wash POS estará completamente funcional.

**URL de la aplicación**: http://localhost:8080/
**Dashboard de Supabase**: https://supabase.com/dashboard/project/dwbfmphghmquxigmczcc
