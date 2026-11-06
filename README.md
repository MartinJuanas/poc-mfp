# misfinanzas · Gestión de gastos e ingresos

Aplicación de finanzas personales para registrar gastos, revisar recibos de sueldo y facturas PDF, seguir ingresos reales y planificar presupuestos y metas de ahorro.

**Tecnologías:** React 19, Vite y Recharts en el frontend; Node.js, Express, MongoDB, Redis y LangChain en el backend. Docker Compose permite iniciar el entorno completo.

## Qué hace

- **Resumen financiero:** ingresos, gastos, saldo y comparación porcentual con el mes anterior.
- **Gastos:** registro desde un botón flotante, edición y eliminación; monto, categoría y descripción como campos principales; fecha, botón Hoy y medio de pago opcionales.
- **Categorías:** 22 categorías principales, incluida Salida, sin subcategorías. Gráfico horizontal con top 5 y resto agrupado, o todas las categorías.
- **Gasto semanal:** barras de lunes a domingo y línea de promedio. Los registros sin fecha se señalan aparte.
- **Presupuestos:** límites por categoría y mes, advertencia desde el 80% y alerta al superar el límite.
- **Documentos PDF:** extracción de recibos y facturas, revisión antes de guardar y carga masiva con detección de duplicados y reintentos.
- **Ingresos:** conserva el período del recibo y utiliza la fecha de cobro para los gráficos. Sin fecha de cobro usa el período como respaldo.
- **Asistente de gastos:** interpreta un gasto escrito o un resumen pegado, prepara un borrador y permite revisarlo antes de confirmar. Excluye transferencias propias y ayuda a evitar pagos de tarjeta duplicados.
- **Consulta por descripción:** ranking del mes elegido con importes acumulados y repeticiones; incluye cada factura de gasto una vez y excluye sueldos. El ranking se calcula aunque falle la IA.
- **Metas y reservas:** aportes de ahorro, comparación de recibos, simulador salarial y consulta de cotizaciones.
- **Interfaz:** tema claro/oscuro, diseño adaptable a celulares, filtros y búsqueda.

El resumen mensual usa el período de registro; el semanal usa la fecha real. Las facturas de gasto conservan un grupo propio y no se atribuyen automáticamente a un presupuesto por categoría.

## Inicio rápido con Docker

Requisitos: Git, Docker Desktop/Engine con Docker Compose y conexión para descargar imágenes y dependencias. Esta configuración está pensada para uso local; la aplicación no implementa autenticación de usuarios.

```bash
git clone https://github.com/MartinJuanas/poc-mfp.git
cd poc-mfp
docker compose up -d --build
```

- Aplicación: [http://localhost:5173](http://localhost:5173)
- API: [http://localhost:3001/api](http://localhost:3001/api)
- Estado del servicio: [http://localhost:3001/api/health](http://localhost:3001/api/health)

Se puede iniciar sin configurar una clave LLM. La extracción básica y las reglas locales siguen disponibles. La IA mejora la interpretación, pero no es necesaria para calcular los totales ni guardar gastos.

MongoDB, Redis y los documentos de carga masiva se guardan en volúmenes nombrados de Docker. `docker compose stop` detiene los servicios conservando los datos. **No ejecutes `docker compose down -v` si querés conservar esos volúmenes.**

## Conectar una clave LLM

Las claves pertenecen exclusivamente al backend. No se colocan en React, en variables `VITE_*`, en el código fuente ni en el README.

1. Creá una clave en el panel del proveedor que quieras utilizar.
2. Copiá `backend/.env.example` a `backend/.env` **solo si el archivo privado todavía no existe**. Si ya existe, editá ese archivo conservando sus otras variables.
3. Completá las variables del proveedor. El ejemplo viene con los campos de claves vacíos.
4. Reiniciá el backend con `docker compose restart backend`.

### Gemini (proveedor predeterminado)

En tu archivo privado `backend/.env`, configurá:

```dotenv
LLM_PROVIDER=google
LLM_MODEL=gemini-2.5-flash
GEMINI_API_KEY=
LLM_TEMPERATURE=0
LLM_TIMEOUT_MS=60000
```

Escribí tu clave real después de `GEMINI_API_KEY=` en ese archivo local. El backend también acepta `GOOGLE_API_KEY`; si ambas existen, da prioridad a `GOOGLE_API_KEY`.

### Otros proveedores soportados

| Proveedor | Valor de `LLM_PROVIDER` | Variables privadas |
| --- | --- | --- |
| OpenAI | `openai` | `OPENAI_API_KEY` y `LLM_MODEL` compatible con tu cuenta |
| Azure OpenAI | `azure_openai` | `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_API_INSTANCE_NAME`, `AZURE_OPENAI_API_DEPLOYMENT_NAME`, `AZURE_OPENAI_API_VERSION` |
| Ollama local | `ollama` | `OLLAMA_BASE_URL` y `LLM_MODEL` instalado; no necesita una API key |

Al cambiar de proveedor, cambiá también `LLM_MODEL` o dejalo vacío para usar el predeterminado implementado en el backend. Un modelo del proveedor anterior no se cambia automáticamente por haber cambiado `LLM_PROVIDER`.

Para Ollama dentro de Compose, habilitá el servicio comentado `ollama` de `docker-compose.yml`, iniciá ese servicio y descargá allí el modelo elegido. El backend en Docker utiliza `http://ollama:11434`. Si ejecutás el backend directamente en tu equipo, la plantilla usa `http://localhost:11434`.

### Comprobar la conexión

Abrí **Asistente de gastos**, escribí un gasto de prueba y prepará el borrador. La respuesta distingue si la propuesta fue generada por IA o por reglas locales. Preparar un borrador no guarda gastos; solo se guardan al confirmar.

Si la clave falta, fue rechazada o el modelo no está disponible, el asistente usa reglas locales. La consulta por descripción conserva su ranking calculado. Los PDF pueden requerir más revisión con la extracción básica; no se debe asumir soporte de OCR para documentos escaneados.

Al utilizar un proveedor externo, el contenido de los documentos o descripciones necesarios para la consulta se envía a ese proveedor. Ollama permite trabajar con un modelo local.

## Desarrollo sin Docker para la aplicación

Usá Node.js 22 y npm. Podés iniciar solo las bases con Compose:

```bash
docker compose up -d mongodb redis
```

En una terminal, desde `backend/`:

```bash
npm ci
npm run dev
```

Antes de iniciarlo, creá `backend/.env` a partir de su plantilla si todavía no existe. Los valores locales predeterminados son `MONGODB_URI=mongodb://localhost:27017/gastos` y `REDIS_URL=redis://localhost:6379`. En Compose se reemplazan por los nombres de los servicios.

En otra terminal, desde `frontend/`:

```bash
npm ci
npm run dev
```

La plantilla `frontend/.env.example` solo contiene `VITE_API_URL=http://localhost:3001/api`. No agregues claves LLM al frontend. Si cambia el origen de la interfaz, ajustá `CORS_ORIGINS` en el backend.

## Configuración

| Variable | Función |
| --- | --- |
| `PORT` | Puerto del backend, predeterminado 3001 |
| `MONGODB_URI` | Conexión a MongoDB |
| `REDIS_URL` | Caché de cotizaciones; si no está disponible se usa memoria |
| `CORS_ORIGINS` | Orígenes permitidos, separados por comas |
| `BULK_STORAGE_DIR` | Carpeta privada de documentos de carga masiva |
| `BULK_UPLOAD_CONCURRENCY` | Documentos procesados en paralelo |
| `MAX_BULK_FILES` / `MAX_FILE_SIZE_MB` | Límites de cantidad y tamaño de PDFs |
| `IMPORT_FOLDER_ROOT` | Habilita y limita importación desde una carpeta del servidor; opcional |
| `LLM_PROVIDER` / `LLM_MODEL` | Proveedor y modelo |
| `LLM_TIMEOUT_MS` / `LLM_TEMPERATURE` | Configuración de las consultas LLM |
| `VITE_API_URL` | URL pública de la API; no es una credencial |

## Pruebas y compilación

Backend, desde `backend/`:

```bash
npm ci
npm test
```

Las pruebas de integración levantan **MongoDB temporal aislado**; no usan los volúmenes reales. La primera ejecución descarga el binario de MongoDB. Ejecutalas en Windows o en un Linux compatible; `mongodb-memory-server` no soporta la imagen Alpine del backend de Compose.

Frontend, desde `frontend/`:

```bash
npm ci
npm run lint
npm run build
```

Los scripts de comprobación visual están en `backend/scripts/`. `expenses-redesign-ui.mjs` requiere Microsoft Edge y el frontend en el puerto 5173; simula las respuestas de la API y no escribe en la base real. Los scripts de la interfaz pueden generar capturas locales, que están excluidas de Git.

## Protección antes de publicar

- Se versionan solamente plantillas `.env.example` con credenciales vacías.
- Se excluyen `.env` privados, dependencias, builds, logs, copias locales, documentos personales, capturas, archivos de credenciales y exportaciones/datos de Docker.
- Los PDFs de `backend/src/tests/fixtures/` son documentos sintéticos de prueba, no documentos personales.
- Los nombres de variables como `GEMINI_API_KEY` son configuración pública; sus valores reales nunca deben incluirse.
- El proyecto incluye un auditor que revisa el contenido preparado para el commit y detecta patrones de claves, archivos prohibidos y coincidencias con credenciales de los `.env` locales. No imprime sus valores.

Desde la raíz, con Python 3 disponible:

```bash
python scripts/check_secrets.py
python scripts/check_secrets.py --tree HEAD
```

Para activar la misma verificación antes de cada commit:

```bash
git config core.hooksPath .githooks
```

El chequeo automatizado complementa la revisión del contenido; no sustituye la gestión de acceso y rotación de credenciales.

## Estructura

```text
backend/src/models/       Modelos MongoDB
backend/src/routes/       API Express
backend/src/services/     Cálculos, extracción y proveedores LLM
backend/src/tests/        Pruebas y fixtures sintéticos
frontend/src/components/  Pantallas, formularios y gráficos
frontend/src/utils/       Finanzas y presentación
docs/                     Documentación funcional y técnica
scripts/                  Revisión de seguridad antes de publicar
```
