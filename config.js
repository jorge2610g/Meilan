window.MEILAN_CONFIG = {
  // Completa estos dos valores con un proyecto Supabase dedicado a Meilan.
  // Usa SIEMPRE una publishable key (o anon key legacy), nunca service_role.
  supabaseUrl: "",
  supabasePublishableKey: "",

  // Cuando Supabase esté configurado, el acceso por correo será obligatorio.
  requireLogin: true,

  // Déjalo en false hasta conectar un proveedor de pago o activar
  // las suscripciones manualmente desde administración.
  requireActiveSubscription: false
};
