# Sistema de diseño — misfinanzas

Identidad propia centrada en dos tareas: entender el dinero y convertir documentos en registros revisables. Paleta cálida, superficies claras y una tarjeta principal verde; no depende de imágenes o fuentes remotas.

| Token | Valor | Uso |
|---|---|---|
| Marca | `#245c45` | Acciones principales, navegación |
| Texto | `#203b30` | Texto sobre superficies claras |
| Secundario | `#67776e` | Contexto y etiquetas |
| Fondo | `#f6f7f2` | Lienzo |
| Superficie | `#ffffff` | Paneles y formularios |
| Borde | `#e0e7df` | Separación |
| Ingreso | `#237452` | Montos positivos con etiqueta |
| Gasto/error | `#b7443f` | Gastos y validación |
| Acento | `#d8eb91` | Orientación y llamadas a acción |

Tipografía: interfaz en `Inter, Segoe UI, system-ui, sans-serif` (fuentes del sistema si Inter no está instalado); títulos principales con serif Georgia. Escala aproximada: 10/12/14/17/21/32/46 px. Espaciado: pasos de 4 px, grupos de 12–24 px y separación entre secciones de 24–32 px. Radios: controles 8 px, estados 10–12 px, paneles 16 px, modales 18 px. Sombras discretas; bordes proporcionan la separación principal.

Los tokens globales están en `frontend/src/index.css`, el producto en `product.css`; los componentes originales conservan sus hojas especializadas adaptadas a estos tokens. `UI.jsx` concentra iconos SVG, avisos de error/éxito, estados vacíos, skeletons, modales nativos y recuperación de errores de renderizado. `ExpenseForm` y `ReceiptForm` se reutilizan al crear y editar.

Accesibilidad: foco visible, labels y nombres accesibles, iconos decorativos ocultos a lectores, estados `status/alert`, navegación activa, modales con `dialog`, Escape y restauración de foco. Los estados incluyen texto y no dependen exclusivamente del color. Se respeta movimiento reducido. No se afirma certificación WCAG ni prueba con todos los lectores de pantalla.

Desktop: sidebar y área de trabajo. Tablet/móvil: encabezado, menú y navegación inferior; movimientos en tarjetas, formularios de una columna, métricas en filas y gráficos que respetan el ancho disponible. Los gráficos conservan tooltip/leyenda y no utilizan animación inicial; las vistas de comparación y simulación se cargan bajo demanda.

## Tema oscuro

`useTheme.js` inicializa el tema antes de montar React, respeta la preferencia del sistema y guarda la elección en localStorage. Los tokens y ajustes de superficies, inputs, modales, estados y gráficos están en `theme.css`. Fondo `#101c17`, paneles `#1a2b24`, texto `#e2ede5`, secundario `#a4b6ac` y acción `#a2d5b0`. La iconografía sol/luna y el nombre accesible indican la acción del botón. El asistente utiliza las mismas superficies y controles en ambos temas.
