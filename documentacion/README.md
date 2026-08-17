# 🚗 Fast Lane Wash POS

Sistema de Punto de Venta (POS) completo para autolavados, con gestión de membresías, programa de lealtad, reportes y cierre de caja.

## ✨ Características

- **POS Completo**: Registro de ventas con múltiples métodos de pago (efectivo, tarjeta, transferencia)
- **Gestión de Membresías**: Venta, renovación y uso de paquetes de lavados
- **Programa de Lealtad**: Sistema automático de recompensas (9 lavados = 1 gratis)
- **Reportes Avanzados**: Visualización, edición y reimpresión de tickets
- **Cierre de Caja**: Control de efectivo con conteo de billetes y monedas
- **Multi-usuario**: Roles de admin y cajero con permisos diferenciados
- **Gestión de Clientes**: Base de datos de clientes con historial
- **Configuración Flexible**: Precios por tipo de vehículo, servicios personalizables

## 🛠️ Tecnologías

- **Frontend**: React 18 + TypeScript + Vite
- **Backend**: Supabase (PostgreSQL + Auth + Storage)
- **Estilos**: Tailwind CSS + shadcn/ui
- **Iconos**: Font Awesome
- **Routing**: React Router v6

## 🚀 Deployment

### Variables de Entorno Requeridas

```env
VITE_SUPABASE_PROJECT_ID=tu_project_id
VITE_SUPABASE_PUBLISHABLE_KEY=tu_publishable_key
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
```

### Plataformas Soportadas

- ✅ Vercel (Recomendado)
- ✅ Netlify
- ✅ GitHub Pages
- ✅ Cualquier hosting de archivos estáticos

### Comandos

```bash
# Desarrollo
npm run dev

# Build de producción
npm run build:prod

# Preview local
npm run preview:prod
```

## 📚 Documentación

- `DEPLOYMENT_GUIDE.md` - Guía completa de deployment
- `AUDITORIA_SEGURIDAD.md` - Reporte de seguridad
- `MEJORAS_LEALTAD_CRUD.md` - Documentación del programa de lealtad
- `MEJORAS_CIERRE_CAJA.md` - Documentación del cierre de caja

## 🔒 Seguridad

- ✅ Row Level Security (RLS) habilitado
- ✅ Autenticación con Supabase Auth
- ✅ Variables de entorno protegidas
- ✅ Headers de seguridad configurados
- ✅ Logger condicional (sin logs en producción)

## 📋 Requisitos

- Node.js 18+
- npm o yarn
- Cuenta de Supabase

## 🎯 Instalación Local

```bash
# Clonar repositorio
git clone https://github.com/BehindTheMafia/fast-lane-wash-pos.git
cd fast-lane-wash-pos

# Instalar dependencias
npm install

# Configurar variables de entorno
cp .env.example .env
# Editar .env con tus credenciales de Supabase

# Iniciar desarrollo
npm run dev
```

## 🗄️ Base de Datos

### Migraciones Requeridas

1. `supabase/complete_migration.sql` - Esquema completo
2. `supabase/fix_cascade_delete.sql` - Corrección de foreign keys

### Aplicar Migraciones

1. Ve a Supabase Dashboard → SQL Editor
2. Copia y pega el contenido de cada archivo
3. Ejecuta en orden

## 👥 Roles de Usuario

- **Admin**: Acceso completo al sistema
- **Cajero**: Acceso a POS, reportes y cierre de caja

## 📱 Pantallas

- `/` - Dashboard con estadísticas
- `/pos` - Punto de venta
- `/customers` - Gestión de clientes
- `/memberships` - Gestión de membresías
- `/reports` - Reportes de ventas
- `/cash-close` - Cierre de caja
- `/services` - Configuración de servicios
- `/settings` - Configuración del negocio

## 🔧 Configuración

### Servicios
- Lavado Breve
- Lavado Rápido
- Lavado Nítido
- Lavado Completo
- Pasteado

### Tipos de Vehículo
- Moto
- Sedán
- SUV
- Pick up
- Microbús

### Métodos de Pago
- Efectivo (NIO/USD)
- Tarjeta
- Transferencia

## 📊 Reportes

- Ventas por período
- Ventas por servicio
- Ventas por vehículo
- Ventas por método de pago
- Historial de cierres de caja

## 🎁 Programa de Lealtad

- Cada 9 lavados regulares = 1 lavado Pasteado gratis
- Contador automático por cliente
- Notificación al ganar lavado gratis
- Reinicio automático del contador

## 📞 Soporte

Para reportar problemas o solicitar características, abre un issue en GitHub.

## 📄 Licencia

Privado - Todos los derechos reservados

## 🙏 Créditos

Desarrollado para Fast Lane Wash

---

**Versión**: 1.0.0  
**Última actualización**: 2026-02-17
