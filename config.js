window.MEILAN_CONFIG = {
  // Pega aquí la configuración Web App del proyecto Firebase dedicado a Meilan.
  // Estos valores identifican el proyecto cliente; NO pongas claves de Admin SDK
  // ni credenciales privadas del servidor en este archivo público.
  firebaseConfig: {
    apiKey: "",
    authDomain: "",
    projectId: "",
    storageBucket: "",
    messagingSenderId: "",
    appId: ""
  },

  // Cuando Firebase esté configurado, el acceso por correo será obligatorio.
  requireLogin: true,

  // Si se activa, los nuevos usuarios deberán verificar su correo antes de entrar.
  requireVerifiedEmail: false,

  // Déjalo en false hasta conectar un proveedor de pago o activar
  // las suscripciones manualmente desde administración.
  requireActiveSubscription: false
};
