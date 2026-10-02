(() => {
  const cfg = window.MEILAN_CONFIG || {};
  const $ = id => document.getElementById(id);

  const els = {
    modal: $("accountModal"),
    openBtn: $("accountBtn"),
    closeBtn: $("accountCloseBtn"),
    setupNotice: $("accountSetupNotice"),
    authForms: $("accountAuthForms"),
    accountPanel: $("accountPanel"),
    gate: $("accessGate"),
    gateTitle: $("accessGateTitle"),
    gateText: $("accessGateText"),
    gateOpenBtn: $("accessGateOpenBtn"),
    message: $("accountMessage"),
    email: $("authEmail"),
    password: $("authPassword"),
    loginBtn: $("loginBtn"),
    registerBtn: $("registerBtn"),
    signedEmail: $("signedInEmail"),
    logoutBtn: $("logoutBtn"),
    subscriptionStatus: $("subscriptionStatus"),
    plan: $("subscriptionPlan"),
    requestSubscriptionBtn: $("requestSubscriptionBtn")
  };

  const state = {
    client: null,
    user: null,
    subscription: null,
    configured: false,
    busy: false
  };

  function credentialsReady(){
    return Boolean(
      cfg.supabaseUrl &&
      /^https:\/\//i.test(cfg.supabaseUrl) &&
      cfg.supabasePublishableKey &&
      cfg.supabasePublishableKey.length > 20
    );
  }

  function libraryReady(){
    return Boolean(
      window.supabase &&
      typeof window.supabase.createClient === "function"
    );
  }

  function setMessage(text, type = "info"){
    if(!els.message) return;
    els.message.textContent = text || "";
    els.message.className = "account-message " + type;
    els.message.hidden = !text;
  }

  function setBusy(busy){
    state.busy = busy;
    [els.loginBtn, els.registerBtn, els.logoutBtn, els.requestSubscriptionBtn]
      .filter(Boolean)
      .forEach(btn => btn.disabled = busy);
  }

  function openModal(){
    if(!els.modal) return;
    if(typeof els.modal.showModal === "function"){
      if(!els.modal.open) els.modal.showModal();
    }else{
      els.modal.hidden = false;
    }
  }

  function closeModal(){
    if(!els.modal) return;
    if(typeof els.modal.close === "function" && els.modal.open) els.modal.close();
    else els.modal.hidden = true;
  }

  function subscriptionLabel(){
    const s = state.subscription;
    if(!s) return {text:"Sin suscripción", cls:"neutral"};
    const labels = {
      pending:"Pendiente de activación",
      active:"Activa",
      past_due:"Pago pendiente",
      canceled:"Cancelada",
      expired:"Vencida"
    };
    return {
      text: labels[s.status] || s.status || "Sin estado",
      cls: s.status === "active" ? "ok" : s.status === "pending" ? "soon" : "neutral"
    };
  }

  function applyGate(){
    if(!els.gate) return;

    let locked = false;
    let title = "";
    let text = "";

    if(state.configured && cfg.requireLogin !== false && !state.user){
      locked = true;
      title = "Inicia sesión para usar Meilan";
      text = "Accede con tu correo electrónico para continuar.";
    }else if(
      state.configured &&
      cfg.requireActiveSubscription === true &&
      state.user &&
      state.subscription?.status !== "active"
    ){
      locked = true;
      title = "Suscripción requerida";
      text = "Tu cuenta necesita una suscripción activa para usar la calculadora.";
    }

    document.body.classList.toggle("auth-locked", locked);
    els.gate.hidden = !locked;
    if(locked){
      els.gateTitle.textContent = title;
      els.gateText.textContent = text;
    }
  }

  function render(){
    if(els.setupNotice) els.setupNotice.hidden = state.configured;
    if(els.authForms) els.authForms.hidden = !state.configured || Boolean(state.user);
    if(els.accountPanel) els.accountPanel.hidden = !state.user;

    if(els.openBtn){
      els.openBtn.textContent = state.user ? "Mi cuenta" : "Acceder";
    }

    if(state.user && els.signedEmail){
      els.signedEmail.textContent = state.user.email || "Cuenta Meilan";
    }

    const badge = subscriptionLabel();
    if(els.subscriptionStatus){
      els.subscriptionStatus.textContent = badge.text;
      els.subscriptionStatus.className = "status-badge " + badge.cls;
    }

    if(state.subscription?.plan_code && els.plan){
      els.plan.value = state.subscription.plan_code;
    }

    applyGate();
  }

  async function loadSubscription(){
    state.subscription = null;
    if(!state.client || !state.user) return;

    const { data, error } = await state.client
      .from("meilan_subscriptions")
      .select("user_id,plan_code,status,current_period_start,current_period_end,created_at,updated_at")
      .eq("user_id", state.user.id)
      .maybeSingle();

    if(error){
      console.warn("No se pudo leer la suscripción de Meilan:", error.message);
      setMessage("La cuenta inició sesión, pero la tabla de suscripciones todavía no está disponible.", "warning");
      return;
    }

    state.subscription = data || null;
  }

  async function handleSession(session){
    state.user = session?.user || null;
    await loadSubscription();
    render();
  }

  async function login(){
    if(!state.client || state.busy) return;
    const email = els.email?.value.trim();
    const password = els.password?.value || "";

    if(!email || !password){
      setMessage("Ingresa correo electrónico y contraseña.", "error");
      return;
    }

    setBusy(true);
    setMessage("Ingresando…");
    try{
      const { data, error } = await state.client.auth.signInWithPassword({ email, password });
      if(error) throw error;
      await handleSession(data.session);
      setMessage("Sesión iniciada correctamente.", "success");
      closeModal();
    }catch(error){
      setMessage(error?.message || "No se pudo iniciar sesión.", "error");
    }finally{
      setBusy(false);
    }
  }

  async function register(){
    if(!state.client || state.busy) return;
    const email = els.email?.value.trim();
    const password = els.password?.value || "";

    if(!email || !password){
      setMessage("Ingresa correo electrónico y contraseña.", "error");
      return;
    }
    if(password.length < 8){
      setMessage("La contraseña debe tener al menos 8 caracteres.", "error");
      return;
    }

    setBusy(true);
    setMessage("Creando cuenta…");
    try{
      const redirectTo = window.location.origin + window.location.pathname;
      const { data, error } = await state.client.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: redirectTo }
      });
      if(error) throw error;

      if(data.session){
        await handleSession(data.session);
        setMessage("Cuenta creada e iniciada.", "success");
        closeModal();
      }else{
        setMessage("Cuenta creada. Revisa tu correo para confirmar el acceso.", "success");
      }
    }catch(error){
      setMessage(error?.message || "No se pudo crear la cuenta.", "error");
    }finally{
      setBusy(false);
    }
  }

  async function logout(){
    if(!state.client || state.busy) return;
    setBusy(true);
    try{
      await state.client.auth.signOut();
      state.user = null;
      state.subscription = null;
      render();
      setMessage("Sesión cerrada.", "success");
    }finally{
      setBusy(false);
    }
  }

  async function requestSubscription(){
    if(!state.client || !state.user || state.busy) return;

    const planCode = els.plan?.value;
    if(!["monthly","annual"].includes(planCode)){
      setMessage("Selecciona un plan.", "error");
      return;
    }

    if(state.subscription?.status === "active"){
      setMessage("Tu suscripción ya está activa.", "success");
      return;
    }

    setBusy(true);
    setMessage("Guardando solicitud…");

    try{
      const payload = {
        user_id: state.user.id,
        plan_code: planCode,
        status: "pending",
        updated_at: new Date().toISOString()
      };

      const { data, error } = await state.client
        .from("meilan_subscriptions")
        .upsert(payload, { onConflict: "user_id" })
        .select("user_id,plan_code,status,current_period_start,current_period_end,created_at,updated_at")
        .single();

      if(error) throw error;
      state.subscription = data;
      render();
      setMessage("Solicitud de suscripción creada. Queda pendiente de activación.", "success");
    }catch(error){
      setMessage(error?.message || "No se pudo crear la solicitud de suscripción.", "error");
    }finally{
      setBusy(false);
    }
  }

  async function init(){
    els.openBtn?.addEventListener("click", openModal);
    els.closeBtn?.addEventListener("click", closeModal);
    els.gateOpenBtn?.addEventListener("click", openModal);
    els.loginBtn?.addEventListener("click", login);
    els.registerBtn?.addEventListener("click", register);
    els.logoutBtn?.addEventListener("click", logout);
    els.requestSubscriptionBtn?.addEventListener("click", requestSubscription);

    els.modal?.addEventListener("click", event => {
      if(event.target === els.modal) closeModal();
    });

    state.configured = credentialsReady();
    render();

    if(!state.configured){
      setMessage("El panel ya está instalado. Falta conectar un proyecto Supabase dedicado a Meilan.", "warning");
      return;
    }

    if(!libraryReady()){
      setMessage("No se pudo cargar el servicio de acceso. Comprueba tu conexión e inténtalo de nuevo.", "error");
      applyGate();
      return;
    }

    state.client = window.supabase.createClient(
      cfg.supabaseUrl,
      cfg.supabasePublishableKey,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      }
    );

    const { data, error } = await state.client.auth.getSession();
    if(error){
      setMessage(error.message, "error");
    }
    await handleSession(data?.session || null);

    state.client.auth.onAuthStateChange((_event, session) => {
      window.setTimeout(() => {
        handleSession(session).catch(error => {
          console.error("Error actualizando sesión:", error);
        });
      }, 0);
    });
  }

  init().catch(error => {
    console.error("No se pudo iniciar el panel de cuenta:", error);
    setMessage("No se pudo iniciar el panel de cuenta.", "error");
  });
})();
