# Auditoría previa a los cambios

## Arquitectura encontrada
Frontend React 19 + Vite, sin router: App controla siete vistas mediante estado. Los 14 componentes cubren dashboard, documentos, gastos, reservas/inversiones, comparación, simulador y carga masiva. GoalsPanel existe pero no se monta; SavingsView lo reemplaza. Estilos independientes con clases globales que colisionan.
Backend Express ESM con siete routers, MongoDB/Mongoose y Redis opcional como caché de cotizaciones. Modelos: Receipt, Expense, Goal y BulkImport. PdfUploader analiza, permite revisar mediante ReceiptForm y confirma por JSON. El upload directo y la importación desde carpeta son rutas legacy. LangChain soporta cuatro proveedores, usa una búsqueda de ejemplos en Mongo y recurre a regex si la IA falla. BulkImport guarda estados por archivo, SHA-256 y período; el procesamiento usa semáforos por lote.

## Bugs críticos
- bulkService llama validateFile con originalname vacío: rechaza cada PDF por extensión.
- Colisiones de numeroRecibo se disimulan con sufijos BULK/REVIEW: se guardan duplicados.
- Dashboard, estadísticas y evolución consideran facturas GASTO como INGRESO.
- Receipt no declara items, subtotal, IVA ni motivoCategoria: Mongoose descarta información de facturas.
- fileHash no es único: dos workers pueden guardar el mismo archivo.
- Aportes realizan read-modify-save: pierden actualizaciones concurrentes y aceptan strings.

## Bugs importantes
- Cálculos del formulario envían requests por tecla; respuestas atrasadas pueden pisar valores.
- parseNumericValue elimina puntos decimales: "1234.56" termina como 123456.
- Fallos de cotizaciones impiden analizar/guardar documentos aunque la extracción funcionó.
- Reintentos confían en nombre/índice sin comprobar identidad del archivo.
- Progreso del lote se actualiza al terminar, no durante el procesamiento.
- Lectura de carpetas solo llama readEntries una vez: omite entradas después de la primera página.
- Selección mixta de carpetas/archivos pierde archivos sueltos.
- USD y ARS se mezclan en resumen de metas; conversión inventada a 1200 en gráficos.
- Sin persistencia de PDFs para recuperar procesamiento tras reinicio.

## UX y UI
Navegación escondida en dropdown; exceso de emojis y KPIs redundantes; no hay movimientos unificados ni búsquedas. Errores se ocultan en console o alert, algunos estados vacíos aparentan éxito. Reservas no muestran objetivo ni progreso en su tarjeta. Error al confirmar un borrador queda oculto. No hay vista del PDF seleccionado ni prevención consistente de doble envío.

## Arquitectura y performance
ExpensesView (531 líneas), SavingsView (554), BulkUpload (584) mezclan requests, cálculos y UI. Endpoints localhost repetidos ignoran VITE_API_URL. Polling por interval puede superponer requests. Semáforos por lote no limitan concurrencia global. PDF se parsea varias veces. Queries recuperan documentos completos en resúmenes; no hay paginación del listado. RAG introduce una consulta antes de cada llamada IA.

## Seguridad
Upload individual sin límite; errores exponen mensajes internos. CORS abierto. import-folder permite lectura arbitraria del servidor. PUT permite mass assignment y operadores Mongo. .env con configuración privada dentro del ZIP de origen: el entregable debe omitirlo. Aplicación monousuario sin autenticación; no es apta para exposición pública sin control de acceso.

## Propuesta y orden de implementación
1. Corregir cálculos, schema, duplicados, validación y aportes atómicos.
2. Preservar endpoints y estados legacy; exponer estados legibles en UI.
3. Definir identidad propia (verde profundo, superficies claras, acentos lima), navegación lateral y móvil.
4. Nuevo dashboard con balance registrado, ingresos, gastos y porcentaje de saldo; sin afirmar que es saldo bancario.
5. Movimientos unificados con búsqueda, filtros, orden, edición y eliminación. Conservar detalle de recibos.
6. Mejorar metas, PDF individual, carga masiva, estados y accesibilidad.
7. Agregar pruebas significativas de cálculos, extracción/fallback, concurrencia y errores. Build y revisión visual.

## Inventario de APIs original
| Método | Endpoint | Router |
|---|---|---|
| POST | /api/receipts/bulk/ | bulkRoutes.js |
| GET | /api/receipts/bulk/:batchId | bulkRoutes.js |
| POST | /api/receipts/bulk/:batchId/retry | bulkRoutes.js |
| POST | /api/receipts/bulk/:batchId/files/:fileIndex/retry | bulkRoutes.js |
| POST | /api/receipts/bulk/:batchId/files/:fileIndex/review | bulkRoutes.js |
| DELETE | /api/receipts/bulk/:batchId | bulkRoutes.js |
| GET | /api/currency/ | currency.js |
| GET | /api/currency/refresh | currency.js |
| POST | /api/currency/convert | currency.js |
| GET | /api/dashboard/years | dashboard.js |
| GET | /api/dashboard/summary | dashboard.js |
| GET | /api/dashboard/monthly | dashboard.js |
| GET | /api/dashboard/retenciones | dashboard.js |
| GET | /api/dashboard/by-employer | dashboard.js |
| GET | /api/dashboard/savings-evolution | dashboard.js |
| GET | /api/expenses/ | expenses.js |
| GET | /api/expenses/categorias | expenses.js |
| GET | /api/expenses/summary | expenses.js |
| GET | /api/expenses/:id | expenses.js |
| POST | /api/expenses/ | expenses.js |
| PUT | /api/expenses/:id | expenses.js |
| DELETE | /api/expenses/:id | expenses.js |
| GET | /api/goals/ | goals.js |
| GET | /api/goals/summary | goals.js |
| GET | /api/goals/:id | goals.js |
| POST | /api/goals/ | goals.js |
| PUT | /api/goals/:id | goals.js |
| POST | /api/goals/:id/aportes | goals.js |
| DELETE | /api/goals/:id | goals.js |
| GET | /api/receipts/ | receipts.js |
| GET | /api/receipts/compare | receipts.js |
| GET | /api/receipts/stats | receipts.js |
| GET | /api/receipts/:id | receipts.js |
| POST | /api/receipts/analyze | receipts.js |
| POST | /api/receipts/ | receipts.js |
| PUT | /api/receipts/:id | receipts.js |
| POST | /api/receipts/upload | receipts.js |
| POST | /api/receipts/import-folder | receipts.js |
| DELETE | /api/receipts/:id | receipts.js |
| POST | /api/receipts/calculate | receipts.js |
| GET | /api/simulator/config | simulator.js |
| POST | /api/simulator/calculate | simulator.js |
| GET | /api/simulator/periodos | simulator.js |
