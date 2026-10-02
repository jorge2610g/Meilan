# Meilan

Web móvil para controlar la vida útil de productos en tienda a partir de la tabla oficial de Chile, actualización 28 de julio de 2026.

## Cuenta y acceso

- Firebase Authentication con correo y contraseña.
- Una prueba gratis de **7 días** por cuenta.
- Un solo plan pagado: **30 días por $3.000 CLP**.
- El plan está diseñado como **pago único por 30 días**; no hay renovación automática.
- Checkout Pro de Mercado Pago preparado en Cloud Functions.
- Firestore guarda el período de prueba y la vigencia del plan.

## Mercado Pago

La integración usa el SDK oficial de Node.js en `functions/` y mantiene el Access Token fuera del navegador.

Dependencias principales:

- `mercadopago@3.6.1`
- `firebase-functions@7.4.0`
- `firebase-admin@14.5.0`

Funciones preparadas:

- `createMeilanCheckout`: crea el pago de $3.000 CLP.
- `mercadoPagoWebhook`: valida la firma del webhook, consulta el pago en Mercado Pago y activa/extiende 30 días de acceso.

Región: `southamerica-west1` (Santiago, Chile).

### Credenciales privadas

Nunca colocar el Access Token ni el secreto del webhook en `config.js`.

Antes de desplegar las funciones, crear estos secretos en Firebase / Google Cloud Secret Manager:

- `MERCADOPAGO_ACCESS_TOKEN`
- `MERCADOPAGO_WEBHOOK_SECRET`

Después se despliegan las Functions y se cambia `billing.mercadoPagoEnabled` a `true` en `config.js`.

> Cloud Functions requiere que el proyecto Firebase tenga facturación Blaze habilitada para desplegar funciones.

## Firestore

Publicar `firestore.rules` en Firebase.

El cliente puede:

- leer únicamente su propio documento `meilan_subscriptions/{uid}`;
- crear una sola prueba de 7 días usando timestamps del servidor.

El cliente no puede activar ni extender un plan pagado. Eso solo lo hace el backend después de confirmar un pago aprobado de Mercado Pago.

## Publicación web

La interfaz continúa publicándose en GitHub Pages.
