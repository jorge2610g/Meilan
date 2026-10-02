# Meilan

Web móvil para controlar la vida útil de productos en tienda a partir de la tabla oficial de Chile.

## Roles

Meilan separa dos accesos:

- **Usuario**: calculadora, prueba gratis de 7 días y plan de 30 días.
- **Administrador**: puede entrar a la vista de usuario y a una pantalla administrativa separada.

El rol administrador se autoriza con un documento creado por administración:

`meilan_admins/{uid}`

con:

```json
{
  "active": true
}
```

La aplicación cliente puede leer únicamente el documento de rol de la propia cuenta. No puede crear, editar ni eliminar administradores.

## Plan de usuario

- Prueba gratis: 7 días.
- Plan pagado: 30 días.
- Precio: $3.000 CLP.
- Pago único, sin renovación automática.

## Mercado Pago

La pantalla de administración contiene únicamente la configuración de Mercado Pago.

Las credenciales privadas **no se guardan en el navegador, GitHub ni Firestore**. El backend preparado recibe el Access Token y el secreto del webhook únicamente desde una sesión administradora y los guarda como versiones de secretos en Google Secret Manager.

Cloud Functions preparadas:

- `saveMercadoPagoCredentials`
- `createMeilanCheckout`
- `mercadoPagoWebhook`

Región: `southamerica-west1`.

Dependencias:

- `mercadopago`
- `firebase-functions`
- `firebase-admin`
- `@google-cloud/secret-manager`

Para habilitar el guardado desde el panel administrador todavía hay que:

1. publicar las reglas nuevas de `firestore.rules`;
2. habilitar facturación Blaze para Cloud Functions;
3. desplegar las Functions;
4. otorgar al servicio de Functions permisos para crear versiones y leer secretos en Secret Manager;
5. cambiar `billing.adminCredentialSaveEnabled` y `billing.mercadoPagoEnabled` a `true`.

## Seguridad

Un usuario normal nunca ve el panel administrador. Aunque intente abrirlo desde el navegador, Firestore no le permite obtener un rol que no sea el suyo y el backend vuelve a comprobar que el UID sea administrador antes de aceptar credenciales.

La vista de administrador no convierte una cuenta por sí sola en administrador.
