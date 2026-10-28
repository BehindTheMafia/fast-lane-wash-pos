# Recuperación de datos y cobros ante cortes de conexión

## Qué protege

Autolavado y barbería comparten ahora la misma recuperación. El POS guarda en el
navegador un borrador del ticket mientras se edita y una solicitud completa antes
de enviar el cobro a Supabase. Un corte de conexión, una respuesta perdida, una
recarga o el cierre de la pestaña no obligan a reconstruir el cobro.

La recuperación pertenece al mismo dispositivo, navegador, dominio, usuario y
módulo. Los datos quedan en `localStorage`, que persiste entre sesiones del
navegador. Cerrar sesión no borra cobros pendientes de otro usuario.

## Flujo para el cajero

1. Trabajar normalmente. El borrador conserva cliente, conceptos y descuentos;
   autolavado conserva también vehículo, membresía y premio seleccionado. La tasa
   del ticket en preparación se conserva al recuperarlo. Los
   campos de cobros personalizados abiertos se conservan. Los campos internos del
   formulario de pago se convierten en una solicitud durable al pulsar Confirmar.
2. Al confirmar el pago, el POS guarda primero la clave única, el contenido exacto
   de la solicitud, el borrador y los datos del recibo. Si ese guardado local falla,
   no envía una escritura a la base de datos.
3. Si el servidor responde correctamente, el resultado se guarda también en el
   dispositivo y se muestra el recibo. Solo entonces se considera confirmada la
   venta. El recibo se recupera sin otro cobro si la pantalla se cierra en ese punto.
4. Si falta conexión o la respuesta es incierta, aparece «Verificar cobro
   pendiente». El ticket sigue guardado, pero la venta todavía no se presenta como
   confirmada. No borrar ni reconstruir otra factura para resolverlo.
5. Al volver la conexión, el POS verifica automáticamente la solicitud original.
   También se puede usar «Verificar venta pendiente». La clave y el contenido son
   los mismos: si el servidor ya guardó la venta, devuelve el resultado original.
6. Si el servidor rechaza el cobro por stock, membresía, permisos u otro error de
   validación, el borrador se conserva y puede corregirse. La clave se mantiene;
   una venta anterior ya completada nunca puede sustituirse con otros datos.
7. Cerrar el recibo confirmado libera el cobro local y permite comenzar una venta
   nueva con otra clave. La factura y la identidad confirmada permanecen en el
   servidor.

Si el cobro sigue pendiente o existe un problema con el almacenamiento, se puede
usar **Descargar respaldo del ticket**. Genera un archivo JSON local con el
borrador y la solicitud conocida. El archivo no se envía a terceros ni contiene
credenciales. Puede incluir datos del cliente; conservarlo con el resto de los
respaldos del negocio. No es un archivo para importar automáticamente a Supabase.

## Estados y reglas

| Estado | Significado | Acciones permitidas |
| --- | --- | --- |
| Borrador | El ticket aún no se ha confirmado para cobrar. | Editar y recuperar sin ejecutar una venta. |
| Pendiente | La solicitud está guardada; su resultado no es definitivo. | Verificar o descargar respaldo; bloquear otro cobro en ese módulo. |
| Rechazado | PostgreSQL confirmó que esa ejecución falló. | Conservar y corregir el borrador; reusar la misma clave. |
| Confirmado | El servidor confirmó la venta y el resultado quedó guardado localmente. | Mostrar, reimprimir y cerrar el recibo; no volver a ejecutar el cobro. |
| Error local | No es seguro leer o guardar el registro. | Bloquear escrituras nuevas, conservar los datos originales y ofrecer respaldo. |

Una clave corresponde a una venta, no a una combinación de fecha, precio o
cliente. Dos ventas legítimas iguales obtienen claves distintas después de cerrar
el primer recibo. Un reintento conserva cliente, importes, moneda, tasa, servicio,
identidad de membresía y premio originales: no reconstruye el contenido desde el
catálogo actual.

## Control de conexión y llamadas

- Una llamada de cobro tiene un límite de **20 segundos**. Al vencer se aborta la
  espera de la petición, pero eso no demuestra que el servidor haya hecho
  rollback. La solicitud permanece pendiente y conserva su identidad.
- Tras un fallo transitorio se hacen hasta **tres reintentos automáticos**, con
  esperas de 1, 3 y 8 segundos. Después queda disponible la verificación manual.
  Al recuperar la conexión se habilita un nuevo ciclo de recuperación.
- No se reintentan automáticamente errores de validación, conflictos de identidad
  o errores de autenticación conocidos. Los errores de negocio preservan el
  borrador para revisión del cajero.
- Un error al refrescar el panel o al mostrar el recibo después del commit no
  convierte la venta en un cobro fallido. Se conserva el resultado confirmado.
- Cada usuario puede tener un editor activo por módulo en el mismo navegador.
  **Web Locks** concede la edición a una pestaña y hace esperar a las otras. Al
  cerrar o abandonar la primera, la siguiente recupera el trabajo guardado.
- El cambio de usuario o de pantalla aborta la espera de las llamadas anteriores.
  Sus respuestas tardías no pueden mostrar recibos ajenos ni sobrescribir otro
  ticket. La solicitud original queda disponible para su propietario.

## Persistencia y seguridad de los datos

Claves locales:

- `pos:draft:v2:<modulo>:<usuario>`: borrador editable.
- `pos:recovery:v2:<modulo>:<usuario>`: solicitud, estado y resultado del cobro.
- `pos:editor:v2:<modulo>:<usuario>`: nombre del bloqueo nativo entre pestañas.

La versión anterior de barbería guardaba solicitudes en `sessionStorage`. Se
migran al almacenamiento durable antes de borrar esa copia anterior. Si aparecen
dos solicitudes diferentes, no se descarta ninguna y se exige revisión.

Los datos corruptos o ilegibles nunca se reemplazan silenciosamente con un ticket
vacío. Si la copia local no puede guardarse, el POS bloquea el envío. Si ya existía
una solicitud pendiente antes del fallo, se conserva su identidad para poder
consultar nuevamente el resultado.

El servidor completa cada venta dentro de una transacción y guarda el resultado
junto con su clave. El reintento no repite ticket, pago, desglose, inventario,
visita de lealtad, canje o uso de membresía. Las claves confirmadas no se borran
junto con la factura; repetir una solicitud antigua no debe recrear una factura
eliminada. Un conflicto devuelve `IDEMPOTENCY_CONFLICT` y no autoriza a generar
otro UUID.

## Límites prácticos

- Esto protege **borradores y cobros de los dos POS**. No agrega reintentos ciegos a
  todas las escrituras de la aplicación: crear clientes, ajustar inventario o
  administrar membresías por otras pantallas requiere contratos específicos de
  idempotencia antes de reintentar escrituras automáticamente.
- No es un modo offline completo. La aplicación y los catálogos deben estar
  cargados; abrir el sitio por primera vez o volver a descargarlo sin conexión
  puede no ser posible. La copia local se recupera cuando la aplicación pueda
  abrirse de nuevo. No se guarda un catálogo completo para operar sin red.
- Solo se permite un cobro pendiente por usuario/módulo en el navegador. No se
  habilita una cola ilimitada de ventas offline. Stock, premios y membresías se
  validan en el servidor al confirmar; si cambiaron mientras no había conexión,
  el cajero tendrá que resolver el rechazo.
- Borrar datos del navegador, cambiar de dominio, usar otro perfil/dispositivo,
  salir de una sesión privada o perder el almacenamiento físico puede eliminar
  la copia local aún no sincronizada. No es un respaldo independiente del equipo.
  Descargar el JSON permite guardar una copia aparte. Las ventas ya confirmadas
  permanecen en Supabase.
- Se requiere HTTPS y un navegador con Web Locks y almacenamiento disponible.
  Si no puede obtenerse esa protección, el POS no envía cobros nuevos.
- El POS registra el medio de pago y no ejecuta cargos de una pasarela bancaria.
  Una integración bancaria futura necesitará idempotencia propia de la pasarela.

## Pruebas automatizadas

```sh
npm test -- src/lib/checkoutRecovery.test.ts src/hooks/useDurableCheckout.test.tsx
npm test -- src/components/pos/CarWashPOS.test.tsx src/components/pos/BarbershopPOS.test.tsx
npm run test:db
npm test
npm run build
```

Se comprueban: guardado previo al envío; trabajo sin conexión; reconexión;
timeout; respuesta tardía; límite de reintentos; cierre y reapertura de pestaña;
borradores y descuentos; recibos confirmados sin otra llamada; migración de la
copia anterior; almacenamiento lleno o corrupto; conflictos; usuarios y módulos
separados; exclusión entre pestañas; rollback; inventario real y membresías.

Las pruebas SQL locales usan PGlite. Las llamadas repetidas comprueban efectos
idempotentes, pero no sustituyen una prueba de conexiones PostgreSQL simultáneas.
La exclusión nativa entre pestañas debe verificarse también en el navegador de la
tableta antes del despliegue.

## Despliegue y comprobación operativa

Desplegar de forma coordinada la aplicación y estas migraciones:

1. `20261028020848_atomic_barbershop_sale.sql`: venta atómica de barbería y
   restricción de tickets pagados sin pago.
2. `20261028024444_validate_car_wash_mixed_payment_parts.sql`: validación de partes
   mixtas y señal explícita de conflicto idempotente en autolavado.

No basta con publicar solamente la interfaz: una tableta con la versión anterior
puede intentar el flujo de guardado antiguo. Recargar los terminales al actualizar.
Antes de hacerlo, terminar o revisar los cobros de la versión anterior. Un borrador
antiguo que existía solo en memoria no puede recuperarse tras esa primera recarga.

En un entorno de prueba: preparar un ticket; cortar la conexión antes y después
de Confirmar; reconectar; comprobar una sola factura y un solo consumo; repetir
cerrando y reabriendo la pestaña; intentar abrir dos pestañas con el mismo usuario;
y simular un fallo al refrescar el panel tras una venta confirmada. No usar ventas
reales para esa comprobación.

Referencias de las APIs utilizadas: [Web Locks](https://developer.mozilla.org/en-US/docs/Web/API/LockManager/request),
[localStorage](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage),
[AbortSignal en Supabase](https://supabase.com/docs/reference/javascript/using-modifiers-abortsignal).
