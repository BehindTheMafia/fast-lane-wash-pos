# Criterios de idempotencia del cobro de barbería

La operación protegida es `complete_barbershop_sale`. Registrar otra vez la misma
solicitud debe devolver el resultado original sin repetir ticket, pago, conceptos,
desglose mixto ni descuento de inventario.

La recuperación durable común a ambos módulos se describe en
[Recuperación ante cortes de conexión](RECUPERACION_CONEXION_POS.md).

## Criterios de aceptación

| Criterio | Comportamiento exigido | Verificación |
| --- | --- | --- |
| IDEM-01 — Identidad de la venta | Crear un UUID al confirmar el primer cobro y guardarlo antes de enviar la solicitud. Conservarlo hasta confirmar el resultado. | Pruebas del almacenamiento y del POS. |
| IDEM-02 — Doble clic | Mientras se está enviando, bloquear otra confirmación. El servidor debe deduplicar también llamadas repetidas que lleguen a él. | Prueba de doble clic y ráfaga de ocho llamadas con la misma clave. |
| IDEM-03 — Respuesta perdida | Un fallo de red, un timeout o una respuesta indeterminada no autorizan a generar otra identidad. Reenviar el UUID y el contenido originales mediante «Verificar venta pendiente». | Prueba de desconexión, desmontaje y recuperación de la pantalla. |
| IDEM-04 — Recarga | Conservar en `localStorage` el UUID, usuario, contenido enviado y resultado. Recuperarlos al recargar o reabrir el POS en el mismo navegador y dominio. No sustituir importes, cliente ni tasa con valores nuevos del catálogo. | Pruebas de recuperación y cambio de tasa durante la desconexión. |
| IDEM-05 — Repetición confirmada | La misma clave, usuario y contenido devuelve exactamente el JSON de resultado original. No vuelve a descontar stock ni a insertar pagos o partes mixtas. | Pruebas del RPC con pagos simples y mixtos. |
| IDEM-06 — Conflicto | Una clave completada con otro cliente, importe, conceptos o método de pago se rechaza con `IDEMPOTENCY_CONFLICT`. El cliente mantiene la solicitud y bloquea otro cobro hasta verificarla. | Pruebas del RPC y del POS. |
| IDEM-07 — Usuarios | La recuperación local se separa por usuario y módulo. Otro usuario, aunque sea personal autorizado, no puede obtener el recibo ni reutilizar la clave de una venta ajena. | Pruebas de almacenamiento y autorización del RPC. |
| IDEM-08 — Rechazo con rollback | Una respuesta explícita de PostgreSQL que confirme el rechazo permite corregir los datos. Se conserva la misma clave, incluso después del rollback, para impedir duplicados si existiera otra copia de la solicitud en curso. Un conflicto de idempotencia nunca se interpreta como rollback de la venta original. | Pruebas de rechazo, corrección, stock insuficiente y fallo al insertar el pago. |
| IDEM-09 — Ventas iguales legítimas | Después de cerrar el recibo confirmado, la siguiente venta obtiene otra clave. Dos cortes al mismo cliente por el mismo precio son ventas diferentes si tienen identidades diferentes. No deduplicar por total, hora o cliente. | Pruebas de nuevas identidades y ventas idénticas. |
| IDEM-10 — Factura eliminada | Repetir una solicitud cuya factura fue eliminada no debe recrearla ni producir movimientos nuevos. El resultado guardado describe la operación original; no sustituye la consulta de su estado actual en Reportes. | Prueba del RPC tras eliminar el ticket. |
| IDEM-11 — Persistencia local | Si no se puede guardar la solicitud, no enviar el cobro. Si el registro está corrupto, bloquear el cobro y pedir la revisión de Reportes; nunca descartarlo silenciosamente. | Pruebas de almacenamiento no disponible y datos corruptos. |
| IDEM-12 — Respuestas antiguas | Una respuesta antigua no puede borrar ni marcar como rechazada una solicitud corregida o una venta nueva. | Pruebas de comparación de identidad y contenido al actualizar el registro local. |

## Garantía del servidor

La clave primaria de `loyalty_private.sale_requests` impide dos registros con el
mismo UUID. `INSERT ... ON CONFLICT DO NOTHING` y `SELECT ... FOR UPDATE`
serializan el acceso a esa identidad. Se comparan usuario y JSONB antes de devolver
el resultado guardado. El resultado y todos los efectos del cobro se confirman
dentro de la misma transacción. Un fallo revierte también el registro de la
solicitud; un nuevo intento con la misma clave puede completarse.

Las claves confirmadas no caducan automáticamente ni se eliminan junto con el
ticket. Suprimirlas permitiría volver a ejecutar una solicitud antigua.

## Alcance y límites

- La recuperación pertenece al dispositivo, navegador, dominio, usuario y módulo.
  Sobrevive al cierre de la pestaña. Borrar datos del navegador o perder el equipo
  puede eliminar solicitudes todavía no sincronizadas; no sustituye un respaldo
  externo. La copia anterior en `sessionStorage` se migra antes de eliminarla.
- Solo una pestaña por usuario/módulo puede editar o enviar el cobro en ese
  navegador. Las demás esperan el bloqueo nativo y recuperan el trabajo al
  liberarse. No se sobrescribe una solicitud pendiente desde otra pestaña.
- El POS registra el medio de pago. No ejecuta cargos de una pasarela bancaria;
  esta protección no sustituye la idempotencia de una integración bancaria futura.
- Barbería y autolavado comparten recuperación, borradores, timeout de 20 segundos
  y tres reintentos automáticos acotados. Las ventas combinadas mantienen una sola
  solicitud atómica en el servidor.

## Validación

```sh
npm test -- src/lib/checkoutRecovery.test.ts src/hooks/useDurableCheckout.test.tsx src/components/pos/BarbershopPOS.test.tsx src/components/pos/PaymentModal.test.tsx
node --test tests/barbershop-sale-atomic.test.mjs
npm run test:db
npm test
npm run build
```

Las pruebas SQL locales usan PGlite con las funciones reales de autorización,
inventario y sincronización. La ráfaga comprueba resultados repetidos, pero PGlite
ejecuta las consultas en un único motor: no equivale a una prueba de dos conexiones
PostgreSQL ejecutando transacciones simultáneas. Esa prueba y la recuperación en
la tableta deben verificarse en el entorno de despliegue.

La migración `20261028020848_atomic_barbershop_sale.sql` y la aplicación deben
desplegarse de forma coordinada. Una versión antigua del cliente no puede seguir
insertando tickets de barbería pagados antes de guardar su pago.
