# Pruebas del cobro de autolavado

## Escenarios comprobados

| Escenario | Resultado esperado |
| --- | --- |
| Doble clic en confirmar | Una sola llamada mientras el cobro está en curso. |
| Respuesta perdida y reintento sin recargar | Misma clave y mismos datos; mismo recibo sin repetir efectos. |
| Venta legítima siguiente con los mismos datos | Clave diferente; ambas ventas son válidas. |
| Error al refrescar datos después del commit | Se muestra el recibo confirmado; no se vuelve a enviar el pago. |
| Recarga o cierre tras una respuesta perdida | Recuperar el cobro exacto desde almacenamiento durable y verificar la misma clave. |
| Borrador antes de confirmar | Recuperar cliente, vehículo, conceptos y descuentos sin crear una venta. |
| Efectivo, tarjeta y transferencia en NIO/USD | Método registrado; importe, recibido y vuelto conservados. |
| Pago mixto con autolavado y barbería | Reparto de importes y vuelto sin duplicaciones entre ambos tickets. |
| Método ausente o desconocido | Rechazo sin crear tickets, pagos, visitas ni consumo. |
| Stock insuficiente en un servicio posterior | Reversión del consumo anterior y de todos los registros de la operación. |
| Fallo al insertar el pago | Restauración del inventario; reintento seguro con la misma clave. |
| Uso de membresía y repetición | Un solo uso; una membresía agotada no produce efectos adicionales. |
| Cambio de datos con una clave completada | Rechazo; el contenido original permanece registrado. |
| Otro cajero intenta reutilizar una clave | Rechazo sin mostrar el recibo ajeno. |
| Repetición después de eliminar el ticket | No recrear el ticket ni repetir pagos, consumo o visitas. |

Las pruebas SQL cargan las funciones reales de comprobación, consumo y reversión
de inventario, autorización, sincronización de lealtad y registro de la venta.
También cargan las validaciones pendientes de barbería para comprobar las ventas
combinadas. El esquema de pruebas es local y reducido; no se insertan cobros en
producción.

## Fallo detectado y corrección

La prueba de una parte de pago mixto con `amount: null` falló antes de la
corrección: el servidor aceptaba esa solicitud. En PostgreSQL, comparar `NULL`
con cero no produce `true`; además, `least(restante, NULL)` conserva el otro
valor, permitiendo asignar un importe que el cliente no había enviado.

La migración `20261028024444_validate_car_wash_mixed_payment_parts.sql` rechaza
explícitamente los métodos e importes ausentes, importes no finitos y vuelto
negativo o no finito en las partes. La prueba comprueba que el rechazo revierte
todo el cobro y deja el stock original. Se conserva el resto del comportamiento
del RPC y su autorización. El rechazo por reutilizar una clave completada
con otros datos incluye ahora `IDEMPOTENCY_CONFLICT`, para no confundirlo con
un rollback de la solicitud original.

## Recuperación incorporada

La limitación de `useRef` se reprodujo con una prueba y quedó corregida. Ahora
`CarWashPOS` usa `useDurableCheckout`, compartido con barbería: guarda borrador y
solicitud en `localStorage`, recupera la misma clave al reabrir y realiza reintentos
acotados al reconectar. Los recibos confirmados también se conservan hasta que el
cajero los cierre.

La nueva prueba requiere que la identidad sea igual después de cerrar y reabrir
la pantalla sin reconstruir el ticket. También comprueba la restauración de un
borrador con descuento y que un fallo al refrescar el panel no provoque otro cobro.

Ver el flujo, los límites y la verificación operativa en
[Recuperación ante cortes de conexión](RECUPERACION_CONEXION_POS.md).

## Reproducción

```sh
npm test -- src/components/pos/CarWashPOS.test.tsx
node --test tests/car-wash-sale.test.mjs
npm run test:db
npm test
npm run build
```

PGlite ejecuta las consultas en un solo motor. Las llamadas repetidas prueban la
deduplicación y sus efectos; no sustituyen una prueba de transacciones simultáneas
en conexiones PostgreSQL independientes. La migración de validación continúa
pendiente de despliegue.
