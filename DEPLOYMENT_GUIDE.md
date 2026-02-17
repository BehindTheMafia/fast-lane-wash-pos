# Guía de Deployment a Producción
## Fast Lane Wash POS

**Fecha**: 2026-02-17  
**Versión**: 1.0.0

---

## 🚀 PASOS PARA DEPLOYMENT

### 1. Preparación de Variables de Entorno

#### Opción A: Vercel (Recomendado)

1. Ve a [Vercel](https://vercel.com)
2. Importa tu repositorio de GitHub
3. En **Environment Variables**, agrega:
   ```
   VITE_SUPABASE_PROJECT_ID=dwbfmphghmquxigmczcc
   VITE_SUPABASE_PUBLISHABLE_KEY=[TU_NUEVA_KEY_ROTADA]
   VITE_SUPABASE_URL=https://dwbfmphghmquxigmczcc.supabase.co
   ```
4. Haz clic en **Deploy**

#### Opción B: Netlify

1. Ve a [Netlify](https://netlify.com)
2. Importa tu repositorio
3. Build settings:
   - Build command: `npm run build:prod`
   - Publish directory: `dist`
4. Environment variables (igual que Vercel)
5. Deploy

#### Opción C: GitHub Pages

```bash
# Instalar gh-pages
npm install --save-dev gh-pages

# Agregar al package.json:
"homepage": "https://[tu-usuario].github.io/fast-lane-wash-pos",
"scripts": {
  "predeploy": "npm run build:prod",
  "deploy": "gh-pages -d dist"
}

# Deploy
npm run deploy
```

---

### 2. Configuración de Supabase

#### A. Rotar Claves API (IMPORTANTE)

1. Ve a [Supabase Dashboard](https://supabase.com/dashboard)
2. Selecciona tu proyecto
3. Ve a **Settings** → **API**
4. Haz clic en **Reset** en "anon public" key
5. Copia la nueva clave
6. Actualiza las variables de entorno en tu plataforma de hosting

#### B. Aplicar Migración Pendiente

1. Ve a **SQL Editor** en Supabase
2. Copia el contenido de `supabase/fix_cascade_delete.sql`
3. Pégalo y ejecuta
4. Verifica que no haya errores

#### C. Verificar RLS

1. Ve a **Database** → **Tables**
2. Para cada tabla, verifica que tenga el candado 🔒 (RLS enabled)
3. Haz clic en cada tabla y verifica las políticas

---

### 3. Build de Producción

```bash
# Limpiar builds anteriores
rm -rf dist

# Build optimizado para producción
npm run build:prod

# Probar localmente antes de deployar
npm run preview:prod
# Abre http://localhost:4173 y prueba todo
```

---

### 4. Verificación Pre-Deploy

#### Checklist de Seguridad
- [x] `.env` eliminado del repositorio
- [x] `.env` agregado al `.gitignore`
- [ ] Claves de Supabase rotadas
- [x] Logger condicional implementado
- [ ] Token de GitHub revocado

#### Checklist de Base de Datos
- [ ] Migración `fix_cascade_delete.sql` aplicada
- [ ] RLS verificado en todas las tablas
- [ ] Backup de base de datos creado

#### Checklist de Funcionalidades
- [ ] POS: Venta normal probada
- [ ] POS: Venta con membresía probada
- [ ] Membresías: Venta probada
- [ ] Membresías: Renovación probada
- [ ] Programa de lealtad: 9 compras probadas
- [ ] Reportes: Ver, editar, eliminar, reimprimir
- [ ] Cierre de caja: Flujo completo probado
- [ ] Login/Logout funcionando

---

### 5. Deployment

#### Vercel (Recomendado - Más fácil)

```bash
# Instalar Vercel CLI
npm i -g vercel

# Login
vercel login

# Deploy
vercel --prod
```

#### Netlify CLI

```bash
# Instalar Netlify CLI
npm i -g netlify-cli

# Login
netlify login

# Deploy
netlify deploy --prod
```

#### Manual (Cualquier hosting)

```bash
# Build
npm run build:prod

# Subir la carpeta 'dist' a tu servidor
# Configurar servidor web para servir archivos estáticos
# Configurar redirects para SPA (todas las rutas → index.html)
```

---

### 6. Configuración Post-Deploy

#### A. Dominio Personalizado (Opcional)

**Vercel**:
1. Ve a tu proyecto → Settings → Domains
2. Agrega tu dominio
3. Configura DNS según instrucciones

**Netlify**:
1. Ve a Domain settings
2. Agrega custom domain
3. Configura DNS

#### B. SSL/HTTPS

- ✅ Vercel y Netlify configuran SSL automáticamente
- ✅ GitHub Pages también tiene SSL automático

#### C. Variables de Entorno

Asegúrate de que las variables estén configuradas en producción:
```bash
# Vercel
vercel env ls

# Netlify
netlify env:list
```

---

### 7. Monitoreo Post-Deploy

#### Verificar en Producción

1. **Login**: Prueba con usuario admin y cajero
2. **POS**: Realiza una venta de prueba
3. **Reportes**: Verifica que aparezca la venta
4. **Membresías**: Prueba vender una membresía
5. **Cierre de caja**: Prueba el flujo completo

#### Errores Comunes

**Error: "Failed to fetch"**
- Causa: Variables de entorno incorrectas
- Solución: Verifica VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY

**Error: "Row Level Security policy violation"**
- Causa: RLS mal configurado
- Solución: Verifica políticas en Supabase Dashboard

**Error: "404 en rutas"**
- Causa: SPA routing no configurado
- Solución: Agregar `_redirects` (Netlify) o `vercel.json` (Vercel)

---

### 8. Configuración de Redirects (SPA)

#### Vercel

Crear `vercel.json` en la raíz:
```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

#### Netlify

Crear `public/_redirects`:
```
/*    /index.html   200
```

---

### 9. Optimizaciones Adicionales

#### A. Comprimir Assets

```bash
# Instalar plugin de compresión
npm install --save-dev vite-plugin-compression

# Agregar a vite.config.ts
import viteCompression from 'vite-plugin-compression';

plugins: [
  react(),
  viteCompression()
]
```

#### B. Análisis de Bundle

```bash
# Instalar visualizador
npm install --save-dev rollup-plugin-visualizer

# Build con análisis
npm run build:prod

# Ver reporte en dist/stats.html
```

---

### 10. Backup y Recuperación

#### Backup de Base de Datos

1. Ve a Supabase Dashboard
2. Database → Backups
3. Habilita backups automáticos
4. Descarga backup manual antes de cambios importantes

#### Rollback

**Vercel/Netlify**:
- Ambos guardan historial de deployments
- Puedes hacer rollback con un clic

**Manual**:
```bash
# Volver a commit anterior
git revert HEAD
git push

# O hacer rollback a commit específico
git reset --hard [commit-hash]
git push --force
```

---

## 🎯 COMANDOS RÁPIDOS

```bash
# Desarrollo local
npm run dev

# Build de producción
npm run build:prod

# Probar build localmente
npm run preview:prod

# Deploy a Vercel
vercel --prod

# Deploy a Netlify
netlify deploy --prod
```

---

## 📞 SOPORTE

Si encuentras problemas:

1. **Logs de Vercel**: Dashboard → Deployments → [tu deploy] → Logs
2. **Logs de Netlify**: Site → Deploys → [tu deploy] → Deploy log
3. **Logs de Supabase**: Dashboard → Logs

---

## ✅ CHECKLIST FINAL

Antes de considerar el deployment exitoso:

- [ ] Sitio accesible en URL de producción
- [ ] Login funciona con usuarios existentes
- [ ] POS puede realizar ventas
- [ ] Reportes muestran datos correctamente
- [ ] Membresías se pueden vender y usar
- [ ] Cierre de caja funciona
- [ ] No hay errores en la consola del navegador
- [ ] No hay errores en los logs del servidor
- [ ] SSL/HTTPS activo (candado en navegador)
- [ ] Velocidad de carga aceptable (<3 segundos)

---

## 🎉 ¡LISTO PARA PRODUCCIÓN!

Una vez completados todos los pasos, tu sistema estará en producción y listo para usar.

**Recuerda**:
- Hacer backups regulares
- Monitorear logs de errores
- Actualizar dependencias periódicamente
- Rotar claves de API cada 6 meses
