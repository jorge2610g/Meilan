window.MEILAN_CONFIG = {
  firebaseConfig: {
    apiKey: "AIzaSyAE_nhlqyOvz8wyM8QBMylToOAt7_BJkds",
    authDomain: "meilan-95042.firebaseapp.com",
    projectId: "meilan-95042",
    storageBucket: "meilan-95042.firebasestorage.app",
    messagingSenderId: "878546909079",
    appId: "1:878546909079:web:27511e83b786d03e47f6d2",
    measurementId: "G-YNBY9VX1NC"
  },

  requireLogin: true,
  requireVerifiedEmail: false,

  // Cuenta administradora principal de Meilan.
  adminEmails: ["scuentas150@gmail.com"],

  // Se mantiene desactivado durante la primera prueba de pago.
  requireActiveSubscription: false,

  billing: {
    trialDays: 7,
    planDays: 30,
    planPriceClp: 3000,
    functionsRegion: "southamerica-west1",

    // Backend de Mercado Pago desplegado y disponible.
    mercadoPagoEnabled: true,
    adminCredentialSaveEnabled: true
  }
};
