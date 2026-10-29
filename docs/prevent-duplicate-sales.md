# Prevención de ventas duplicadas

La misma clave de operación conserva permanentemente el recibo original. La nueva
regla añade una ventana de 30 segundos para solicitudes con claves distintas que
describen una atención equivalente.

La base compara área, cliente, vehículo y placa en autolavado, total, conceptos y
cantidades. Agrupa conceptos repetidos, ordena las líneas e ignora cambios de
nombre del catálogo o del texto de lavados restantes. Cambiar el método de pago,
la moneda o el efectivo recibido no convierte una atención en otra.

Para clientes identificados, la protección se comparte entre cajeros. Para cliente
general o sin identificar, se limita al mismo cajero: no se puede distinguir a dos
personas distintas que comparten el registro general. Dos atenciones legítimas e
idénticas del mismo cajero también requieren esa separación de 30 segundos.

Un trigger diferido revisa cada ticket al confirmarse, con todos sus conceptos ya
guardados. Una fila privada con clave única y bloqueo de fila serializa intentos
concurrentes. Rechazar el segundo revierte toda la transacción, incluidos pagos,
inventario, usos de membresía y lealtad. No existe una cola que vuelva a cobrar
automáticamente cuando termina el plazo.

La regla cubre autolavado, barbería, productos, cargos personalizados, ventas
mixtas y tickets M-/MR- de membresías. Estos últimos conservan su flujo existente
de varias peticiones; la revisión ocurre al insertar su ticket pagado, antes del
pago y de crear o renovar la membresía. No convierte ese flujo en una transacción
atómica. Los tickets históricos y sus saldos no se corrigen automáticamente.

En ambos POS, el rechazo conserva el carrito, identifica el ticket anterior y
ofrece revisar/reimprimir en Reportes o volver al POS. Imprimir no inicia otro
cobro. El recibo confirmado requiere pulsar «Nueva atención»; un clic fuera no lo
descarta.

## Instalación

Proyecto: `dwbfmphghmquxigmczcc`. Aplicar únicamente
`supabase/migrations/20261029062838_prevent_duplicate_pos_sales.sql`, que incluye
una transacción. El sitio correcto es `elrapidopos.netlify.app`; el enlace local
de Netlify puede señalar a otro sitio. La validación de base protege también al
frontend anterior, que muestra el mensaje del servidor.

La tabla y las funciones nuevas están en `loyalty_private`, sin permisos para
clientes; la tabla tiene RLS habilitado. Verificar el trigger diferido y estos
permisos después de aplicar el SQL.

## Validación

`node --test tests/duplicate-sales.test.mjs` cubre ambos RPC reales, claves nuevas,
reintentos, distintos cajeros/clientes/vehículos, normalización, pagos, membresías,
venta cruzada, reversión completa y permisos. `npm test` comprueba el manejo del
rechazo en el navegador, recuperación y ausencia de cobros automáticos posteriores.
`npm run test:db` ejecuta las regresiones SQL. `npm run build` compila el sitio.

Para concurrencia real, usar un PostgreSQL local desechable, crear la base
`pos_duplicate_sales_test` y ejecutar con `POS_DUPLICATE_TEST_DATABASE_URL` y
`POS_DUPLICATE_TEST_PSQL` definidos. El test de concurrencia rechaza servidores
remotos y otros nombres de base. Sin esas variables queda omitido en la suite
habitual. Comprueba dos conexiones en READ COMMITTED, REPEATABLE READ y
SERIALIZABLE, además de reintentos simultáneos de la misma clave, para ambos POS.
