# Asistente de gastos

1. Abrir **Asistente de gastos** en el menú.
2. Elegir **mes y año del resumen**: el período visible se usa para todos los registros.
3. Pegar las categorías/importes de Mercado Pago en “Resumen o gasto”. También acepta un gasto individual como “Gasté 15 mil en supermercado”.
4. Agregar aclaraciones: “2m son del iPhone. 1.2 millones son de vacaciones”. Si las aclaraciones están debajo del resumen pegado, también se recuperan.
5. Preparar el borrador. No guarda gastos todavía.
6. Conversar para corregir el reparto, o editar descripción/categoría/importe/medio de pago/fecha y decidir qué filas incluir.
7. Confirmar el total y guardar. Movimientos, distribución de gastos y balance reciben los nuevos datos.

## Ejemplo del pedido

| Bloque pendiente original | $3.233.186 |
|---|---:|
| iPhone → Tecnología | $2.000.000 |
| Vacaciones → Viajes | $1.200.000 |
| Remanente → Otros, para revisar | $33.186 |

El reparto suma exactamente el bloque original. No se agrega otra vez el pendiente completo. “1.2” sin unidad se interpreta como 1.200.000 solo en un bloque pendiente de escala millonaria, con aviso visible para confirmar. Es preferible escribir “1.2 millones” o el importe completo.

El resumen completo suma **$5.053.442,63**. Transferencias propias: **$702.001**, excluidas. Pago de tarjeta: **$120.132,86**, inicialmente excluido. Propuesta inicial a guardar: **$4.231.308,77 en 14 filas**. No es dinero gastado adicional al resumen: son sus registros reclasificados.

## Categorías principales

Comida, Supermercado, Servicios, Alquiler, Transporte, Salud, Educación, Impuestos, Compras, Entretenimiento, Ropa, Deporte, Viajes, Mascotas, Familia, Hogar, Tecnología, Finanzas, Regalos, Trabajo y Otros. No hay subcategorías. La IA solo puede elegir estas opciones; nombres desconocidos se convierten en Otros. El servidor rechaza categorías ajenas al guardar o editar.

Ejemplos: mercado → Supermercado; restaurante → Comida; ARCA/patente → Impuestos; luz/internet → Servicios; facultad → Educación; farmacia → Salud; nafta → Transporte; Netflix → Entretenimiento; gimnasio → Deporte; celular → Tecnología; regalo de cumpleaños → Regalos.

### Medio de pago y fecha

“Gasté 500k en supermercado con tarjeta de crédito” propone monto 500000, descripción Supermercado, categoría Supermercado y medio de pago Tarjeta de crédito. “Gasté 200k en facultad con débito” propone monto 200000, descripción Facultad, categoría Educación y medio Débito. Ambas compras se incluyen; son distintas de pagar una deuda de tarjeta.

Medios disponibles: Efectivo, Tarjeta de crédito, Débito, Transferencia y Mercado Pago. Si no se informan quedan en null, con “Sin informar” en la interfaz. El borrador permite completarlos o corregirlos. Una aclaración de fecha/medio para un único gasto también se aplica con reglas locales; para varios gastos, completar la fila correspondiente evita adivinar a cuál pertenece.

Las fechas exactas explícitas en ISO (2026-09-03) o día/mes/año (03/09/2026) se validan y conservan. La fecha no informada queda en null; no se sustituye por hoy ni por la fecha de creación. Mes/año elegido es el período contable, un dato separado. Otros detalles del texto se conservan en la descripción y la fuente original; no se inventan comercios, compras ni datos adicionales.

`categoria` se almacena mediante una clave estable (por ejemplo `supermercado`); formularios y gráficos usan el nombre exacto del catálogo (Supermercado). La antigua clave `ocio` pasa a `entretenimiento` al iniciar el backend, sin borrar gastos ni cambiar importes. Los reintentos de borradores anteriores siguen protegidos.

Las transferencias entre cuentas propias no se incluyen como gasto. Un pago de tarjeta puede duplicar gastos si los consumos ya se registraron: empieza excluido y el usuario decide si corresponde incluirlo. No se infiere un desglose de consumos que no esté en el texto.

## IA y reglas locales

El asistente usa `getLLM` con el proveedor/modelo del backend; no se acopla solo a Gemini. Las claves no llegan al frontend. El modelo recibe las categorías, fuentes/importes y aclaraciones para preparar JSON; no tiene herramientas para guardar. El servidor valida el resultado y mantiene las mismas reglas de presupuesto que el borrador local.

Gemini ofrece un nivel gratuito para ciertos modelos, sujeto a límites del proyecto; requiere una API key. No se garantiza uso gratuito para cualquier modelo o cuenta. Referencia oficial: https://ai.google.dev/gemini-api/docs/billing .

Sin clave, con cuota agotada, timeout, JSON inválido o importes inventados por la IA, se usa el borrador local y se informa. Las reglas locales reconocen formatos de resumen, gastos individuales y repartos comunes de un único pendiente; no se presentan como un chatbot general. Para instrucciones más complejas, usar IA o corregir las filas manualmente.

El total de cada fuente debe conservarse incluso al excluir filas. Si se ajusta una compra dividida, también se ajusta el remanente. Una nueva aclaración vuelve a preparar el borrador; hacer las correcciones manuales después de conversar.

## Persistencia y reintentos

ExpenseImport guarda el borrador en MongoDB. Al confirmar, cada gasto recibe una clave única por borrador/fila. La escritura usa upserts compatibles con MongoDB standalone; un retry completa lo que falta sin duplicar lo que ya se escribió. Si el guardado falla después de comenzar, el plan queda congelado para reintentar. Al reiniciar el backend se libera el estado interrumpido; volver a pegar el resumen recupera ese plan.

Pegar el mismo resumen de varias categorías en el mismo mes/año recupera el borrador/resultado existente. Un gasto individual repetido puede ser una compra legítima nueva, por lo que crear otro borrador individual está permitido; reenviar la confirmación del mismo borrador nunca lo duplica. No se puede detectar automáticamente si el gasto ya se cargó manualmente, por PDF o por otra descripción: se pide revisar esa situación antes de confirmar.

Los borradores y gastos solo se guardan en la aplicación. No se conectó una cuenta de Mercado Pago, no se implementó sincronización bancaria y no se enviaron mensajes a terceros.
