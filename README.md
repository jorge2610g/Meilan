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


## Acceso por correo y suscripciones (v0.6.0)

La interfaz ya incluye:
- Registro e inicio de sesión por correo y contraseña.
- Sesión persistente y cierre de sesión.
- Panel “Mi cuenta”.
- Solicitud de plan mensual o anual.
- Estado de suscripción: pendiente, activa, pago pendiente, cancelada o vencida.
- Bloqueo opcional de la calculadora cuando no hay sesión o suscripción activa.

### Conectar Supabase

1. Crear un proyecto Supabase dedicado a Meilan.
2. Ejecutar `supabase/setup.sql`.
3. Editar `config.js` y completar `supabaseUrl` y `supabasePublishableKey`.
4. Usar solamente una publishable key (o anon key legacy). Nunca colocar `service_role` en el navegador.
5. Si se desea exigir una suscripción activa, cambiar `requireActiveSubscription` a `true` después de conectar el flujo de activación/pago.

Las solicitudes de suscripción se crean con estado `pending`. Las políticas RLS impiden que un usuario cambie su propio estado a `active`.

> Nota: Meilan sigue siendo una aplicación estática. El login y el estado de suscripción controlan la interfaz, pero para proteger contenido verdaderamente privado se requiere servir ese contenido desde un backend autorizado.
