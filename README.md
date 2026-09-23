# Meilan

Web móvil para controlar la vida útil de productos en tienda a partir de la tabla oficial de Chile, actualización 28 de julio de 2026.

## Funciones actuales

- Cámara trasera del teléfono y carga de fotografías.
- OCR en navegador con Tesseract.js para intentar leer PREP/PROD, fechas y horas.
- Corrección manual de los datos detectados.
- Base de productos y reglas de vida útil del documento entregado.
- Cálculo de vencimiento oficial.
- Estados: VIGENTE, POR VENCER y VENCIDO.
- Comparación entre vencimiento escrito en la etiqueta y vencimiento calculado.
- Aviso de almacenamiento refrigerado en reglas marcadas con ***.
- Historial local en el dispositivo.
- Diseño responsive e instalable como web app.

## Importante

La escritura manuscrita puede no ser reconocida de forma fiable por OCR. La aplicación siempre permite revisar y corregir los datos antes de validar. Las celdas sin regla en la tabla fuente se mantienen sin regla: no se inventan duraciones.

## Publicación

El proyecto es estático y puede publicarse en GitHub Pages, Hostinger, Netlify o Vercel. Para usar cámara en navegador debe servirse mediante HTTPS o localhost durante desarrollo.
