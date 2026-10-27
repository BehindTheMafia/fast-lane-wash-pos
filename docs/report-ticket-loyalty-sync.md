# Sincronización de visitas con Reportes

## Criterio

- Una visita = un ticket `paid` de `car_wash`, asociado por `customer_id`.
- Premium, Nítido y Breve se clasifican igual que la exportación de Configuración: nombre actual del catálogo, o snapshot si falta el servicio; productos y extras no suman categorías.
- Cada ticket suma una sola vez por programa, aunque incluya dos conceptos del mismo programa.
- Premium y Nítido avanzan su programa correspondiente. Breve se incluye en el total y en el historial; no se convierte en Premium.
- Un premio disponible requiere tickets suficientes y un ticket de origen vigente del mismo cliente/programa. Los grupos consumidos o expirados reservan su posición, igual que el portal público.
- Se conserva la auditoría de canjes. La migración no concede premios históricos.
- Los créditos del programa anterior se conservan como un registro separado; no se confunden con el total de visitas.

Caso de referencia de las capturas de Emigdio: **9 visitas, 2 Premium, 2 Nítido y 5 Breve**. Los datos actuales pueden aumentar si se registraron tickets posteriores.

## Cambios

`complete_car_wash_sale` guarda venta, conceptos, pagos, inventario, uso de membresía, créditos y canje en una transacción. Una clave UUID por venta devuelve el mismo recibo al reintentar.

`edit_report_ticket` y `delete_report_ticket` requieren administrador/propietario. Recalculan los clientes afectados. Si falla un paso, se revierte la operación completa. La edición conserva el desglose mixto y rechaza cambios de importe/servicio ambiguos en tickets con varios conceptos, membresías o canjes. Los borrados desde Configuración usan los mismos triggers de conciliación y devolución de inventario/membresía.

Clientes, Lealtad y POS invalidan su caché después de una operación y refrescan al recuperar el foco o cada minuto visible. Leer lealtad ya no modifica contadores.

## Despliegue

**Proyecto correcto:** `dwbfmphghmquxigmczcc`. El `project_id` antiguo de `supabase/config.toml` no identifica esta base. No ejecutar `db push` con ese destino ni aplicar todas las migraciones históricas automáticamente.

1. Comprobar acceso al proyecto y revisar el esquema actual, las funciones y sus permisos. El historial local contiene cambios antiguos; la comprobación del esquema real es necesaria.
2. Preparar el frontend de esta revisión y cerrar temporalmente las cajas abiertas. La versión anterior realiza escrituras separadas que la migración restringe.
3. Aplicar **solo** `supabase/migrations/20261027044324_report_ticket_loyalty_sync.sql` mediante `apply_migration` en el proyecto correcto. Se puede ejecutar el archivo completo en SQL Editor si lo aplica el propietario.
4. Publicar el frontend de esta misma revisión y recargar las terminales. No publicar primero un frontend que llame a RPC aún inexistentes.
5. Verificar en modo de lectura un cliente conocido: Reportes, exportación, Clientes, Lealtad y portal deben coincidir. No borrar ni crear tickets reales para probar.

El SQL se ejecuta en una transacción y conserva una copia privada de los contadores/estados previos. Una restauración posterior debe considerar los canjes y ventas ocurridos desde el despliegue: no sobrescribirlos con la copia histórica.

## Verificación local

```sh
npm test
npm run test:db
npm run build
```

Las pruebas SQL ejecutan la migración real en PostgreSQL embebido (PGlite), con clientes y tickets ficticios. Incluyen cambios de cliente/servicio, cancelación, borrado repetido, pérdida de elegibilidad, auditoría de canjes, roles, reintentos de venta, pagos mixtos/USD, membresías, reversión ante fallo de inventario y más de 1.000 tickets. El inventario usa un sustituto de prueba para provocar fallos de forma controlada; sus funciones existentes no se modifican.

Las pruebas no usan ni modifican producción. La compilación TypeScript completa del repositorio tiene errores previos en `src/components/animate-ui`; deben distinguirse de los archivos de esta corrección.
