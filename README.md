# Meilan

Web móvil para controlar la vida útil de productos en tienda a partir de la tabla oficial de Chile, actualización 28 de julio de 2026.

## Funciones actuales

- Base de productos y reglas de vida útil.
- Cálculos FR/FB y PREP/PROD independientes.
- Historial local en el dispositivo.
- Diseño responsive e instalable como web app.
- Registro e inicio de sesión por correo y contraseña preparado con Firebase Authentication.
- Panel “Mi cuenta”.
- Solicitud de plan mensual o anual almacenada en Cloud Firestore.
- Bloqueo opcional por sesión o suscripción activa.

## Publicación

El proyecto es estático y puede publicarse en GitHub Pages, Hostinger, Netlify o Vercel.

## Acceso por correo y suscripciones (v0.7.0)

Meilan usa Firebase para la capa de cuenta:

- **Firebase Authentication**: correo y contraseña.
- **Cloud Firestore**: documento de suscripción por usuario.
- **Reglas de Firestore**: el usuario puede leer su propia suscripción y crear/actualizar solamente una solicitud con estado `pending`; no puede autoactivarse.

### Conectar Firebase

1. Crear un proyecto Firebase dedicado a Meilan.
2. Crear una **Web App** dentro del proyecto.
3. En Firebase Authentication, habilitar **Email/Password**.
4. Crear una base de datos **Cloud Firestore**.
5. Publicar las reglas de `firestore.rules`.
6. Copiar la configuración Web App de Firebase en `config.js`.
7. Si se desea exigir verificación de correo, cambiar `requireVerifiedEmail` a `true`.
8. Si se desea exigir suscripción activa, cambiar `requireActiveSubscription` a `true` solamente cuando exista un flujo administrativo/pago que pueda establecer `status: "active"`.

La configuración Web App de Firebase se usa en el navegador para identificar el proyecto. No se deben publicar claves privadas de Admin SDK, cuentas de servicio ni credenciales de servidor.

Las solicitudes se guardan en:

```
meilan_subscriptions/{uid}
```

con los campos `user_id`, `plan_code`, `status`, `created_at` y `updated_at`.

> Nota: Meilan sigue siendo una aplicación estática. El login y el estado de suscripción controlan la interfaz, pero contenido verdaderamente privado debe servirse desde un backend autorizado.
