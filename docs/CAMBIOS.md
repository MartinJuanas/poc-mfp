# Cambios implementados

El trabajo parte del código existente. La auditoría se escribió antes de la implementación; las rutas originales y los cuatro proveedores siguen presentes.

## Confiabilidad y finanzas

- Separación de ingresos y facturas de gasto en resumen, estadísticas y evolución. Gastos manuales y documentales participan del balance; meses con gastos sin ingresos también aparecen.
- Totales compartidos con redondeo a centavos, decimales argentinos/estándar, promedios mensuales y validación de importes/períodos/fechas.
- Datos de factura persistidos: ítems, subtotal, IVA y clasificación. Metas separadas por moneda; sin cotizaciones ficticias para completar conversiones.
- Aportes atómicos en MongoDB; estado de meta recalculado al aportar o cambiar el objetivo.
- Validación de entradas, identificadores, operadores Mongo y campos editables. Errores seguros, CORS configurable y archivos privados.

## Documentos y lotes

- Validación real de PDFs, tamaño y extensión; se corrigió el envío de nombre vacío que rechazaba todos los archivos del lote.
- Conversión de buffers compatible con el parser, manejo de respuestas LangChain por bloques, timeout de IA y fallback visible.
- SHA-256 comprobado antes de llamar al LLM, bloqueo por hash y índice único de persistencia. Un número repetido queda duplicado; ya no se inventa otro número para guardarlo.
- Concurrencia global entre lotes, contadores actuales de estados terminales, reclamo atómico para evitar reintentos/revisiones superpuestos.
- PDFs de lotes guardados en disco privado, leídos cuando llega su turno; reintentos y recuperación tras reinicio. Eliminar un lote elimina sus archivos temporales, no los recibos ya guardados.
- Revisión manual de período y neto; extracción básica e información incompleta quedan para revisión. Lectura completa de carpetas arrastradas y soporte para carpetas mezcladas con archivos sueltos.
- Redis opcional para cotizaciones, caché en memoria, timeout externo y consultas simultáneas compartidas.

## Producto

- Identidad misfinanzas y sistema visual común, shell responsive, navegación con historial/hash, ocho vistas y menú móvil.
- Resumen financiero, balance/flujo, metas y acceso directo a documentos. Datos vacíos explicados y errores recuperables.
- Movimientos unificados con búsqueda, filtros, ordenamiento, paginación, detalle, edición y eliminación.
- Formularios reutilizables, importes claros, errores y confirmaciones; PDF con vista previa y corrección antes de guardar.
- Metas con progreso/faltante, aportes y confirmación de borrado; conservadas inversiones, proyecciones y rendimiento global.
- Carga masiva con cola, pasos, estados legibles, resultados por archivo y revisión en modal accesible.
- Comparador y simulador conservados y adaptados. Se cancelan consultas antiguas al cambiar selección/filtro; polling sin intervalos superpuestos y gráficos/vistas divididos en chunks.

## Infraestructura y alcance

Docker mantiene frontend 5173, backend 3001, MongoDB y Redis. Node 22, instalación por lockfile y volumen persistente de PDFs. Archivos de entorno opcionales para iniciar sin claves; ejemplos y documentación de cuatro proveedores incluidos.

No se incorporaron cuentas de usuario, conectores bancarios, transferencias ni OCR: no existían y requerirían arquitectura ajena a este pedido. El comparador y simulador siguen disponibles; las tasas del simulador original no fueron actualizadas con normativa fiscal.

## Actualización solicitada: modo oscuro y asistente de gastos

Se agregó tema claro/oscuro persistente y un asistente que propone gastos desde texto o un resumen copiado. Utiliza las 21 categorías principales solicitadas, permite aclaraciones conversacionales y edición antes de confirmar. La IA es opcional y reutiliza `getLLM`; las reglas básicas funcionan sin clave.

El nuevo modelo ExpenseImport conserva fuentes, borrador, período y estado. Cada reclasificación mantiene el total por fuente. Confirmación explícita e índice de idempotencia en Expense evitan duplicados tras retry, doble clic o guardado parcial. Endpoints: `POST /api/expenses/assistant/analyze` y `POST /api/expenses/assistant/:id/commit`. Los endpoints y cálculos existentes continúan funcionando.

## Actualización: categorías principales y medios de pago

Catálogo cerrado de 21 opciones en formularios, asistente y gráficos; sin subcategorías. Reglas locales y prompt de IA distinguen supermercado/comida, impuestos, tecnología, viajes y otras categorías. Respuestas con nombres ajenos al catálogo pasan a Otros; el CRUD rechaza valores inválidos. Una prueba comprueba que los catálogos de frontend/backend coinciden.

Medio de pago y fecha opcionales se extraen del texto explícito, revisan, editan y guardan de forma independiente. Compras con tarjeta se incluyen; pagos de deuda de tarjeta mantienen su revisión separada. Fechas imposibles se rechazan; ausencia de datos permanece null. La IA no puede fabricar medios ni fechas; se usan únicamente metadatos del texto original o aclaraciones inequívocas de un gasto.

Migración idempotente al arrancar: ocio → entretenimiento, conservando registros y montos históricos. Compatibilidad de los borradores antiguos con planes congelados y reintentos sin duplicados.
