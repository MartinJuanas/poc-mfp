# Validación de la entrega

## Resultados ejecutados

| Verificación | Resultado |
|---|---|
| Backend, Vitest | **106/106 pruebas aprobadas**, 9 archivos |
| Integración | MongoDB 7.0.14 real y temporal; API Express real; PDFs de fixture reales |
| Frontend, ESLint | Sin errores ni advertencias del código |
| Frontend, build Vite | Compilación exitosa; rutas y gráficos divididos en chunks |
| Navegador, Chromium/Playwright | Flujo desktop y nueve vistas móviles sin desborde horizontal |
| Editar gasto | Formulario real y monto confirmado en MongoDB |
| Aportar a meta | Modal, guardado y actualización de la vista |
| PDF individual | Analizar con fallback, revisar y confirmar; registro confirmado en MongoDB |
| Carga masiva | Subir PDF sin período, ver revisión, corregir y guardar; registro confirmado |
| Errores de JavaScript del navegador | Ninguno durante los flujos verificados |

Las cotizaciones y la base inicial son sintéticas y exclusivas de la prueba. El asistente se prueba con el ejemplo de resumen aportado en el pedido; no se conectó una cuenta real de Mercado Pago. Los tests de contrato de IA simulan respuestas LangChain; la prueba de navegador recorre la falla real por ausencia de clave y la extracción básica. No se utilizó una base o una API key privada del usuario.

## Actualización: oscuro y asistente

Se verificó el cambio de tema, persistencia después de recargar, nueve pantallas en oscuro/claro, borrador del resumen completo, aclaraciones posteriores por chat, categorías, transferencia bloqueada, guardado de 14 gastos y repetición del resumen sin duplicarlos. Se capturó también la revisión móvil en oscuro.

Pruebas backend nuevas: formato argentino/millones, reparto de pendiente, conservación del total, remanente, monedas no admitidas, categorías/fuentes inválidas, caída de IA, respuestas JSON por bloques y montos inventados. Integración real: análisis sin escritura, confirmación explícita, replay, dos confirmaciones simultáneas y corte parcial de Mongo con recuperación sin duplicados. Los gastos individuales idénticos se permiten como nuevas compras; el replay del mismo borrador sigue protegido.

## Cobertura crítica

Finanzas: ingresos/gastos, balance, meses con gastos solamente, promedio mensual, clasificación, centavos y formatos numéricos. Períodos: contenido PDF, rutas, nombres, prioridad y revisión.

PDF: texto extraíble, datos incompletos, extensión falsa, PDF vacío/corrupto, tamaño configurable, caída de IA y RAG, JSON inválido y respuestas por bloques. Facturas: clasificación y persistencia de ítems.

Lotes: hash antes de IA, mismo hash/número, índice único, revisión y neto, retry por archivo y lote, PDF recuperado desde disco, eliminación de archivos, límites configurables, concurrencia entre lotes, contadores terminales. Los seis endpoints solicitados participan de las pruebas HTTP o su flujo.

Metas: aportes simultáneos sin pérdida, strings convertidos, objetivos cero, creación ya completada y cambio de objetivo. API: números/períodos/fechas/IDs inválidos, operadores Mongo, fallo de base con respuesta segura. Cotizaciones: Redis fallando, caché en memoria, consultas compartidas, conversión redondeada y caída externa sin tasas inventadas.

## Límites de verificación

- **Docker no está instalado en el entorno de trabajo.** Se revisó la estructura de Compose, puertos, variables, volúmenes, Dockerfiles y lockfiles; no se ejecutó `docker compose up --build` aquí.
- **Proveedores reales de IA:** las cuatro implementaciones/configuraciones se conservaron, pero no se verificaron respuestas contra Gemini, OpenAI, Azure u Ollama con credenciales/modelos del usuario.
- **Navegadores:** se ejecutó Chromium. La selección múltiple, selección de carpetas por capacidad y drag & drop se mantuvieron; no se ejecutó una matriz real de Firefox/Safari/Edge ni arrastre nativo de carpetas en cada sistema.
- Se revisaron desktop 1440 px y móvil 390 px. No se realizó una auditoría formal WCAG, de lectores de pantalla o de carga para miles de registros.
- Los PDFs escaneados sin texto y protegidos se rechazan con explicación; no se agregó OCR.
- La recuperación de lotes está implementada y la lectura persistida se probó en retry; no se forzó la caída completa del proceso durante una llamada externa real.
- Los resúmenes todavía recuperan documentos para algunos cálculos; la paginación de movimientos es del cliente. No se afirma escalabilidad multiusuario ni procesamiento distribuido. El semáforo y bloqueo por hash son del proceso; el índice único protege la persistencia.

## Capturas

`docs/screenshots/` contiene resumen, movimientos, metas, revisión de PDF y carga masiva en desktop; resumen, movimientos y metas en móvil. Las capturas del asistente usan los importes del ejemplo aportado, sobre una base de prueba.

## Actualización: 21 categorías principales

Los 18 ejemplos de categorización del pedido y un concepto desconocido se verifican automáticamente. Catálogos de backend y frontend idénticos y exactamente 21 categorías; rechazo de categorías inventadas; IA simulada que devuelve nombre exacto y que intenta inventar fecha/medio de pago. Se verifica que un celular sin marca no genere una marca inventada.

API real con MongoDB: compra con tarjeta incluida, categoría independiente, fecha explícita persistida, agrupación por Supermercado, edición y eliminación de datos opcionales, migración histórica idempotente y recuperación de borradores congelados antiguos. Resúmenes de fechas diferentes no se confunden. La migración solo renombra Ocio a Entretenimiento; no recategoriza descripciones antiguas arbitrariamente.

Navegador: 21 opciones en el selector del asistente, compra de $500.000 en supermercado con crédito y fecha 03/09/2026; guardado confirmado en MongoDB. Captura adicional: `08-categoria-medio-pago.png`. Medio y fecha editables también en el formulario manual. Los proveedores reales de IA siguen sin verificarse con credenciales del usuario.
