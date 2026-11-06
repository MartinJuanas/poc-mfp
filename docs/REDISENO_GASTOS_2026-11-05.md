# Rediseño de Gastos

## Distribución

1. Selector de mes/año y tres tarjetas: ingresos, total gastado y saldo. Comparan con el mes calendario anterior, incluso entre diciembre y enero. Las flechas muestran la dirección del cambio; para gastos, una disminución es positiva. Si no existe base comparable, no se inventa un porcentaje.
2. Grilla de dos columnas para categorías y gasto semanal. En pantallas pequeñas se apila en una columna.
3. Presupuestos mensuales: tres columnas en escritorio amplio, dos en tamaños intermedios y una en móvil.
4. Lista del mes con búsqueda, categoría y orden, chips con íconos y edición/eliminación. Incluye las facturas de gasto.
5. Consulta IA desplegable y botón flotante de registro, ubicado sobre la navegación móvil.

El formulario muestra monto, categoría y descripción. Fecha (incluido Hoy) y medio de pago se encuentran en Opcionales. Se mantiene el período elegido y la distinción entre fecha real y período de registro.

## Gráficos y cálculos

- Categorías: barras horizontales con montos, top 5 y resto agrupado, con opción de ver todas sin duplicar una tabla. Facturas de gasto se agrupan aparte y cada documento aporta su total una sola vez.
- Semanas: barras verticales con promedio aritmético de todas las semanas visibles, incluidas semanas sin consumo y semanas parciales. Tooltip y detalle desplegable con fechas/importes. Los gastos sin fecha se señalan aparte.
- Resumen mensual y categorías usan el período de registro; el semanal usa fecha real. La diferencia está indicada en pantalla.

## Presupuestos persistentes

Nueva colección `ExpenseBudget` con índice único por categoría/mes/año. No se migran ni reescriben gastos existentes.

- `GET /api/expenses/budgets?mes=11&anio=2026`
- `PUT /api/expenses/budgets/:category` con `{periodo:{mes,anio},limite}`
- `DELETE /api/expenses/budgets/:category?mes=11&anio=2026`

Los límites se comparan con gastos manuales y del asistente en esa categoría. Las facturas no se asignan automáticamente. Advertencia desde 80%, alerta al superar el límite, con importe disponible o excedente. Eliminar un límite conserva los gastos.

## Legibilidad y validación

Escala: texto principal 16 px, texto de apoyo/controles 14 px, títulos de sección 22 px, importes destacados 26–36 px. Paleta oscura azul con acento celeste, verde positivo, ámbar de advertencia y rojo de alerta; se conserva el selector claro/oscuro.

La comprobación automatizada aplica los umbrales de [WCAG 2.2, contraste mínimo](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html): 4,5:1 para texto normal y 3:1 para texto grande. También revisa placeholders y contraste de límites de campos (3:1). Esto verifica contraste en las vistas ejercitadas; no constituye una certificación de todos los criterios de accesibilidad de la aplicación.

- Backend: **124 pruebas aprobadas**, incluidas persistencia, actualización y eliminación de límites, exclusión de otros meses, facturas, sueldos, centavos, variaciones y agrupación de categorías.
- Frontend: ESLint y compilación de producción aprobados.
- `node scripts/expenses-redesign-ui.mjs` desde backend: recorrido en Edge con API simulada, sin escrituras reales. Comprueba filtros, modal, Hoy, presupuestos, alertas, vacío, vista móvil, teclado Escape y contraste en ambos temas.
- Capturas de datos sintéticos: `12-expenses-redesign-desktop.png`, `13-expenses-redesign-mobile.png`, `14-expense-modal-mobile.png` en `docs/screenshots/`.

Se preservaron `.env`, credenciales y volúmenes. Las copias anteriores están en `.local-backups/2026-11-05-expenses-redesign/`. Se reiniciaron solo backend/frontend para cargar los cambios.
