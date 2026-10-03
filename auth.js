(() => {
  const FIREBASE_VERSION = "12.19.0";
  const cfg = window.MEILAN_CONFIG || {};
  const billing = cfg.billing || {};
  const TRIAL_DAYS = Number(billing.trialDays || 7);
  const PLAN_PRICE_CLP = Number(billing.planPriceClp || 3000);
  const FUNCTIONS_REGION = billing.functionsRegion || "southamerica-west1";
  const ADMIN_EMAILS = (cfg.adminEmails || []).map(email => String(email).trim().toLowerCase());
  const $ = id => document.getElementById(id);

  const els = {
    modal: $("accountModal"),
    openBtn: $("accountBtn"),
    closeBtn: $("accountCloseBtn"),
    setupNotice: $("accountSetupNotice"),
    authForms: $("accountAuthForms"),
    accountPanel: $("accountPanel"),
    adminPanel: $("adminPanel"),
    gate: $("accessGate"),
    gateTitle: $("accessGateTitle"),
    gateText: $("accessGateText"),
    gateOpenBtn: $("accessGateOpenBtn"),
    message: $("accountMessage"),
    email: $("authEmail"),
    password: $("authPassword"),
    loginBtn: $("loginBtn"),
    registerBtn: $("registerBtn"),
    userRoleBtn: $("userRoleBtn"),
    adminRoleBtn: $("adminRoleBtn"),
    authRoleHint: $("authRoleHint"),
    signedEmail: $("signedInEmail"),
    logoutBtn: $("logoutBtn"),
    openAdminPanelBtn: $("openAdminPanelBtn"),
    adminSignedEmail: $("adminSignedEmail"),
    adminToUserBtn: $("adminToUserBtn"),
    adminLogoutBtn: $("adminLogoutBtn"),
    mpAccessToken: $("mpAccessToken"),
    mpWebhookSecret: $("mpWebhookSecret"),
    saveMpCredentialsBtn: $("saveMpCredentialsBtn"),
    mpCredentialStatus: $("mpCredentialStatus"),
    subscriptionStatus: $("subscriptionStatus"),
    trialOffer: $("trialOffer"),
    trialActive: $("trialActive"),
    trialEndsText: $("trialEndsText"),
    startTrialBtn: $("startTrialBtn"),
    paidPlanOffer: $("paidPlanOffer"),
    planPriceText: $("planPriceText"),
    buyPlanBtn: $("buyPlanBtn"),
    paymentSetupNote: $("paymentSetupNote"),
    activePlan: $("activePlan"),
    planEndsText: $("planEndsText")
  };

  const state = {
    firebaseApp: null,
    auth: null,
    db: null,
    functions: null,
    user: null,
    subscription: null,
    isAdmin: false,
    loginMode: "user",
    viewMode: "user",
    configured: false,
    busy: false,
    api: null
  };

  function credentialsReady(){
    const f = cfg.firebaseConfig || {};
    return Boolean(f.apiKey && f.authDomain && f.projectId && f.appId);
  }

  async function loadFirebase(){
    const base = "https://www.gstatic.com/firebasejs/" + FIREBASE_VERSION + "/";
    const [appApi, authApi, firestoreApi, functionsApi] = await Promise.all([
      import(base + "firebase-app.js"),
      import(base + "firebase-auth.js"),
      import(base + "firebase-firestore.js"),
      import(base + "firebase-functions.js")
    ]);

    state.api = {
      initializeApp: appApi.initializeApp,
      getAuth: authApi.getAuth,
      setPersistence: authApi.setPersistence,
      browserLocalPersistence: authApi.browserLocalPersistence,
      onAuthStateChanged: authApi.onAuthStateChanged,
      signInWithEmailAndPassword: authApi.signInWithEmailAndPassword,
      createUserWithEmailAndPassword: authApi.createUserWithEmailAndPassword,
      sendEmailVerification: authApi.sendEmailVerification,
      signOut: authApi.signOut,
      getFirestore: firestoreApi.getFirestore,
      doc: firestoreApi.doc,
      getDoc: firestoreApi.getDoc,
      setDoc: firestoreApi.setDoc,
      serverTimestamp: firestoreApi.serverTimestamp,
      getFunctions: functionsApi.getFunctions,
      httpsCallable: functionsApi.httpsCallable
    };
  }

  function setMessage(text, type = "info"){
    if(!els.message) return;
    els.message.textContent = text || "";
    els.message.className = "account-message " + type;
    els.message.hidden = !text;
  }

  function friendlyError(error, fallback){
    const code = error?.code || "";
    const map = {
      "auth/invalid-credential": "Correo o contraseña incorrectos.",
      "auth/user-disabled": "Esta cuenta está deshabilitada.",
      "auth/email-already-in-use": "Ya existe una cuenta con ese correo.",
      "auth/invalid-email": "El correo electrónico no es válido.",
      "auth/weak-password": "La contraseña no cumple los requisitos de seguridad.",
      "auth/too-many-requests": "Demasiados intentos. Inténtalo nuevamente más tarde.",
      "auth/network-request-failed": "No se pudo conectar con Firebase. Revisa tu conexión.",
      "functions/unauthenticated": "Debes iniciar sesión para continuar.",
      "functions/permission-denied": "Esta cuenta no tiene permisos de administrador.",
      "functions/failed-precondition": "La función todavía no está habilitada.",
      "functions/internal": "No se pudo completar la operación."
    };
    return map[code] || error?.message || fallback;
  }

  function setBusy(busy){
    state.busy = busy;
    [
      els.loginBtn,
      els.registerBtn,
      els.logoutBtn,
      els.adminLogoutBtn,
      els.startTrialBtn,
      els.buyPlanBtn,
      els.saveMpCredentialsBtn
    ].filter(Boolean).forEach(btn => btn.disabled = busy);

    if(els.buyPlanBtn && !billing.mercadoPagoEnabled) els.buyPlanBtn.disabled = true;
    if(els.saveMpCredentialsBtn && !billing.adminCredentialSaveEnabled) els.saveMpCredentialsBtn.disabled = true;
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

  function setLoginMode(mode){
    state.loginMode = mode === "admin" ? "admin" : "user";
    els.userRoleBtn?.classList.toggle("active", state.loginMode === "user");
    els.adminRoleBtn?.classList.toggle("active", state.loginMode === "admin");

    if(els.registerBtn) els.registerBtn.hidden = state.loginMode === "admin";
    if(els.authRoleHint){
      els.authRoleHint.textContent = state.loginMode === "admin"
        ? "Solo cuentas marcadas como administradoras pueden entrar aquí."
        : "Acceso normal para usuarios de Meilan.";
    }
    if(els.loginBtn){
      els.loginBtn.textContent = state.loginMode === "admin"
        ? "Ingresar como administrador"
        : "Iniciar sesión";
    }
    setMessage("");
  }

  async function checkAdminRole(user){
    if(!user) return false;

    const email = String(user.email || "").trim().toLowerCase();
    if(email && ADMIN_EMAILS.includes(email)) return true;

    if(!state.db || !user.uid || !state.api) return false;
    try{
      const ref = state.api.doc(state.db, "meilan_admins", user.uid);
      const snap = await state.api.getDoc(ref);
      return snap.exists() && snap.data()?.active === true;
    }catch(error){
      console.warn("No se pudo comprobar el rol administrador:", error);
      return false;
    }
  }

  function toDate(value){
    if(!value) return null;
    if(typeof value.toDate === "function") return value.toDate();
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function addDays(date, days){
    return new Date(date.getTime() + days * 86400000);
  }

  function formatDate(date){
    if(!date) return "—";
    return new Intl.DateTimeFormat("es-CL", {
      day:"2-digit",
      month:"long",
      year:"numeric"
    }).format(date);
  }

  function trialEndsAt(){
    const started = toDate(state.subscription?.trial_started_at);
    return started ? addDays(started, TRIAL_DAYS) : null;
  }

  function activePlanEndsAt(){
    return toDate(state.subscription?.current_period_end);
  }

  function entitlement(){
    const s = state.subscription;
    const now = Date.now();

    if(!s) return {active:false, kind:"none"};

    if(s.status === "trial"){
      const end = trialEndsAt();
      if(end && end.getTime() > now) return {active:true, kind:"trial", end};
      return {active:false, kind:"trial_expired", end};
    }

    if(s.status === "active"){
      const end = activePlanEndsAt();
      if(!end || end.getTime() > now) return {active:true, kind:"paid", end};
      return {active:false, kind:"paid_expired", end};
    }

    return {active:false, kind:s.status || "none"};
  }

  function subscriptionLabel(){
    const e = entitlement();
    if(e.kind === "none") return {text:"Prueba disponible", cls:"soon"};
    if(e.kind === "trial") return {text:"Prueba gratis activa", cls:"ok"};
    if(e.kind === "trial_expired") return {text:"Prueba finalizada", cls:"neutral"};
    if(e.kind === "paid") return {text:"Plan 30 días activo", cls:"ok"};
    if(e.kind === "paid_expired") return {text:"Plan vencido", cls:"neutral"};

    const labels = {
      pending:"Pago pendiente",
      canceled:"Cancelado",
      expired:"Vencido",
      past_due:"Pago pendiente"
    };
    return {text:labels[e.kind] || "Plan disponible", cls:e.kind === "pending" ? "soon" : "neutral"};
  }

  function verifiedEnough(){
    return !cfg.requireVerifiedEmail || Boolean(state.user?.emailVerified);
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
    }else if(state.configured && state.user && !verifiedEnough()){
      locked = true;
      title = "Verifica tu correo";
      text = "Revisa tu bandeja de entrada y confirma tu correo para continuar.";
    }else if(state.configured && cfg.requireActiveSubscription === true && state.user && !state.isAdmin){
      const e = entitlement();
      if(!e.active){
        locked = true;
        if(e.kind === "none"){
          title = "Activa tu prueba gratis";
          text = "Tienes 7 días gratis para probar Meilan.";
        }else if(e.kind === "trial_expired"){
          title = "Tu prueba gratis terminó";
          text = "Continúa con el plan de 30 días por $3.000 CLP.";
        }else{
          title = "Renueva tu acceso";
          text = "Activa el plan de 30 días por $3.000 CLP para seguir usando Meilan.";
        }
      }
    }

    document.body.classList.toggle("auth-locked", locked);
    els.gate.hidden = !locked;
    if(locked){
      els.gateTitle.textContent = title;
      els.gateText.textContent = text;
    }
  }

  function renderPlan(){
    if(!state.user) return;

    const e = entitlement();
    const noSubscription = e.kind === "none";
    const trialActive = e.kind === "trial";
    const paidActive = e.kind === "paid";
    const showPaidOffer = !noSubscription && !trialActive && !paidActive;

    if(els.trialOffer) els.trialOffer.hidden = !noSubscription;
    if(els.trialActive) els.trialActive.hidden = !trialActive;
    if(els.paidPlanOffer) els.paidPlanOffer.hidden = !showPaidOffer;
    if(els.activePlan) els.activePlan.hidden = !paidActive;

    if(els.trialEndsText && trialActive){
      els.trialEndsText.textContent = "Tu prueba termina el " + formatDate(e.end) + ".";
    }

    if(els.planEndsText && paidActive){
      els.planEndsText.textContent = e.end
        ? "Tu acceso está activo hasta el " + formatDate(e.end) + "."
        : "Tu plan está activo.";
    }

    if(els.planPriceText){
      els.planPriceText.textContent = "$" + PLAN_PRICE_CLP.toLocaleString("es-CL") + " CLP";
    }

    if(els.paymentSetupNote){
      els.paymentSetupNote.hidden = Boolean(billing.mercadoPagoEnabled);
    }

    if(els.buyPlanBtn){
      els.buyPlanBtn.disabled = state.busy || !billing.mercadoPagoEnabled;
    }
  }

  function render(){
    if(els.setupNotice) els.setupNotice.hidden = state.configured;
    if(els.authForms) els.authForms.hidden = !state.configured || Boolean(state.user);

    const showAdmin = Boolean(state.user && state.isAdmin && state.viewMode === "admin");
    if(els.adminPanel) els.adminPanel.hidden = !showAdmin;
    if(els.accountPanel) els.accountPanel.hidden = !state.user || showAdmin;

    if(els.openBtn){
      els.openBtn.textContent = state.user
        ? (showAdmin ? "Administrador" : "Mi cuenta")
        : "Acceder";
    }

    if(state.user && els.signedEmail) els.signedEmail.textContent = state.user.email || "Cuenta Meilan";
    if(state.user && els.adminSignedEmail) els.adminSignedEmail.textContent = state.user.email || "Administrador";

    if(els.openAdminPanelBtn) els.openAdminPanelBtn.hidden = !state.isAdmin;

    const badge = subscriptionLabel();
    if(els.subscriptionStatus){
      els.subscriptionStatus.textContent = badge.text;
      els.subscriptionStatus.className = "status-badge " + badge.cls;
    }

    if(els.mpCredentialStatus){
      els.mpCredentialStatus.textContent = billing.adminCredentialSaveEnabled
        ? "Guardado seguro habilitado"
        : "Pendiente de desplegar backend seguro";
      els.mpCredentialStatus.className = "status-badge " + (billing.adminCredentialSaveEnabled ? "ok" : "soon");
    }

    renderPlan();
    setBusy(state.busy);
    applyGate();
  }

  async function loadSubscription(){
    state.subscription = null;
    if(!state.db || !state.user || !state.api) return;

    try{
      const ref = state.api.doc(state.db, "meilan_subscriptions", state.user.uid);
      const snap = await state.api.getDoc(ref);
      state.subscription = snap.exists() ? snap.data() : null;
    }catch(error){
      console.warn("No se pudo leer el acceso de Meilan:", error);
      setMessage("La cuenta inició sesión, pero no se pudo leer el estado del plan.", "warning");
    }
  }

  async function handleUser(user){
    state.user = user || null;
    state.isAdmin = false;

    if(!state.user){
      state.subscription = null;
      state.viewMode = "user";
      render();
      return;
    }

    state.isAdmin = await checkAdminRole(state.user);

    if(state.user && cfg.requireVerifiedEmail && !state.user.emailVerified){
      state.subscription = null;
    }else{
      await loadSubscription();
    }

    if(state.loginMode === "admin" && !state.isAdmin){
      await state.api.signOut(state.auth);
      state.user = null;
      state.subscription = null;
      state.viewMode = "user";
      render();
      setMessage("Esta cuenta no tiene acceso de administrador.", "error");
      openModal();
      return;
    }

    if(state.loginMode === "admin" && state.isAdmin){
      state.viewMode = "admin";
    }

    render();
  }

  async function login(){
    if(!state.auth || state.busy || !state.api) return;
    const email = els.email?.value.trim();
    const password = els.password?.value || "";

    if(!email || !password){
      setMessage("Ingresa correo electrónico y contraseña.", "error");
      return;
    }

    setBusy(true);
    setMessage(state.loginMode === "admin" ? "Verificando acceso administrador…" : "Ingresando…");

    try{
      const credential = await state.api.signInWithEmailAndPassword(state.auth, email, password);

      if(cfg.requireVerifiedEmail && !credential.user.emailVerified){
        await state.api.sendEmailVerification(credential.user);
        await state.api.signOut(state.auth);
        setMessage("Tu correo todavía no está verificado. Te enviamos un nuevo enlace de verificación.", "warning");
        return;
      }

      if(state.loginMode === "admin"){
        const admin = await checkAdminRole(credential.user);
        if(!admin){
          await state.api.signOut(state.auth);
          setMessage("Esta cuenta no tiene acceso de administrador.", "error");
          return;
        }
        state.isAdmin = true;
        state.viewMode = "admin";
        setMessage("Acceso administrador correcto.", "success");
      }else{
        state.viewMode = "user";
        setMessage("Sesión iniciada correctamente.", "success");
      }

      await handleUser(credential.user);
    }catch(error){
      setMessage(friendlyError(error, "No se pudo iniciar sesión."), "error");
    }finally{
      setBusy(false);
      render();
    }
  }

  async function register(){
    if(state.loginMode === "admin"){
      setMessage("Las cuentas administradoras no se crean desde esta pantalla.", "warning");
      return;
    }
    if(!state.auth || state.busy || !state.api) return;

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
      const credential = await state.api.createUserWithEmailAndPassword(state.auth, email, password);

      if(cfg.requireVerifiedEmail){
        await state.api.sendEmailVerification(credential.user);
        await state.api.signOut(state.auth);
        setMessage("Cuenta creada. Revisa tu correo para verificarla antes de ingresar.", "success");
      }else{
        state.viewMode = "user";
        setMessage("Cuenta creada. Ya puedes activar tu prueba gratis de 7 días.", "success");
        await handleUser(credential.user);
      }
    }catch(error){
      setMessage(friendlyError(error, "No se pudo crear la cuenta."), "error");
    }finally{
      setBusy(false);
      render();
    }
  }

  async function logout(){
    if(!state.auth || state.busy || !state.api) return;
    setBusy(true);
    try{
      await state.api.signOut(state.auth);
      state.user = null;
      state.subscription = null;
      state.isAdmin = false;
      state.viewMode = "user";
      setLoginMode("user");
      render();
      setMessage("Sesión cerrada.", "success");
    }catch(error){
      setMessage(friendlyError(error, "No se pudo cerrar la sesión."), "error");
    }finally{
      setBusy(false);
    }
  }

  async function startTrial(){
    if(!state.db || !state.user || state.busy || !state.api) return;

    setBusy(true);
    setMessage("Activando tus 7 días gratis…");

    try{
      const ref = state.api.doc(state.db, "meilan_subscriptions", state.user.uid);
      const existing = await state.api.getDoc(ref);

      if(existing.exists()){
        setMessage("Esta cuenta ya utilizó o tiene configurado un período de acceso.", "warning");
        return;
      }

      await state.api.setDoc(ref, {
        user_id: state.user.uid,
        plan_code: "trial_7d",
        status: "trial",
        trial_started_at: state.api.serverTimestamp(),
        created_at: state.api.serverTimestamp(),
        updated_at: state.api.serverTimestamp()
      });

      await loadSubscription();
      render();
      setMessage("Prueba gratis activada. Tienes 7 días de acceso.", "success");
    }catch(error){
      console.error("No se pudo activar la prueba:", error);
      setMessage("No se pudo activar la prueba gratis. Revisa que las reglas nuevas de Firestore estén publicadas.", "error");
    }finally{
      setBusy(false);
      renderPlan();
    }
  }

  async function buyPlan(){
    if(!state.user || !state.functions || state.busy || !state.api) return;

    if(!billing.mercadoPagoEnabled){
      setMessage("Mercado Pago está preparado, pero falta desplegar el backend de pagos.", "warning");
      return;
    }

    setBusy(true);
    setMessage("Abriendo Mercado Pago…");

    try{
      const createCheckout = state.api.httpsCallable(state.functions, "createMeilanCheckout");
      const result = await createCheckout({});
      const checkoutUrl = result?.data?.checkoutUrl;

      if(!checkoutUrl) throw new Error("Mercado Pago no devolvió una URL de pago.");

      window.location.assign(checkoutUrl);
    }catch(error){
      console.error("No se pudo abrir Mercado Pago:", error);
      setMessage(friendlyError(error, "No se pudo iniciar el pago con Mercado Pago."), "error");
    }finally{
      setBusy(false);
      renderPlan();
    }
  }

  async function saveMercadoPagoCredentials(){
    if(!state.isAdmin || !state.functions || state.busy || !state.api){
      setMessage("Necesitas acceso administrador.", "error");
      return;
    }

    if(!billing.adminCredentialSaveEnabled){
      setMessage("El panel administrador ya está listo, pero falta desplegar la función segura que guarda las credenciales.", "warning");
      return;
    }

    const accessToken = els.mpAccessToken?.value.trim() || "";
    const webhookSecret = els.mpWebhookSecret?.value.trim() || "";

    if(accessToken.length < 20 || webhookSecret.length < 12){
      setMessage("Completa el Access Token y el secreto del webhook de Mercado Pago.", "error");
      return;
    }

    setBusy(true);
    setMessage("Guardando credenciales de forma segura…");

    try{
      const saveCredentials = state.api.httpsCallable(state.functions, "saveMercadoPagoCredentials");
      await saveCredentials({accessToken, webhookSecret});

      if(els.mpAccessToken) els.mpAccessToken.value = "";
      if(els.mpWebhookSecret) els.mpWebhookSecret.value = "";

      setMessage("Credenciales guardadas en Secret Manager. No quedaron almacenadas en el navegador ni en Firestore.", "success");
    }catch(error){
      console.error("No se pudieron guardar las credenciales:", error);
      setMessage(friendlyError(error, "No se pudieron guardar las credenciales."), "error");
    }finally{
      setBusy(false);
      render();
    }
  }

  function handlePaymentReturn(){
    const params = new URLSearchParams(window.location.search);
    const payment = params.get("payment");
    if(!payment) return;

    openModal();

    if(payment === "success"){
      setMessage("Pago recibido. Estamos confirmándolo con Mercado Pago; tu plan se activará al aprobarse.", "success");
      setTimeout(async () => {
        await loadSubscription();
        render();
      }, 2500);
    }else if(payment === "pending"){
      setMessage("El pago quedó pendiente. El plan se activará cuando Mercado Pago lo apruebe.", "warning");
    }else if(payment === "failure"){
      setMessage("El pago no se completó. Puedes intentarlo nuevamente.", "error");
    }

    params.delete("payment");
    const rest = params.toString();
    history.replaceState({}, "", window.location.pathname + (rest ? "?" + rest : "") + window.location.hash);
  }

  async function init(){
    els.openBtn?.addEventListener("click", openModal);
    els.closeBtn?.addEventListener("click", closeModal);
    els.gateOpenBtn?.addEventListener("click", openModal);
    els.loginBtn?.addEventListener("click", login);
    els.registerBtn?.addEventListener("click", register);
    els.logoutBtn?.addEventListener("click", logout);
    els.adminLogoutBtn?.addEventListener("click", logout);
    els.userRoleBtn?.addEventListener("click", () => setLoginMode("user"));
    els.adminRoleBtn?.addEventListener("click", () => setLoginMode("admin"));
    els.openAdminPanelBtn?.addEventListener("click", () => {
      if(!state.isAdmin) return;
      state.viewMode = "admin";
      render();
    });
    els.adminToUserBtn?.addEventListener("click", () => {
      state.viewMode = "user";
      render();
    });
    els.startTrialBtn?.addEventListener("click", startTrial);
    els.buyPlanBtn?.addEventListener("click", buyPlan);
    els.saveMpCredentialsBtn?.addEventListener("click", saveMercadoPagoCredentials);

    els.modal?.addEventListener("click", event => {
      if(event.target === els.modal) closeModal();
    });

    setLoginMode("user");
    state.configured = credentialsReady();
    render();

    if(!state.configured){
      setMessage("El panel está preparado para Firebase, pero falta conectar el proyecto.", "warning");
      return;
    }

    try{
      await loadFirebase();

      state.firebaseApp = state.api.initializeApp(cfg.firebaseConfig);
      state.auth = state.api.getAuth(state.firebaseApp);
      state.db = state.api.getFirestore(state.firebaseApp);
      state.functions = state.api.getFunctions(state.firebaseApp, FUNCTIONS_REGION);

      await state.api.setPersistence(state.auth, state.api.browserLocalPersistence);

      state.api.onAuthStateChanged(state.auth, user => {
        handleUser(user).then(() => {
          handlePaymentReturn();
        }).catch(error => {
          console.error("Error actualizando sesión:", error);
          setMessage("No se pudo actualizar el estado de la cuenta.", "error");
        });
      });
    }catch(error){
      console.error("No se pudo iniciar Firebase:", error);
      setMessage("No se pudo iniciar Firebase. Comprueba la configuración y la conexión.", "error");
      applyGate();
    }
  }

  init().catch(error => {
    console.error("No se pudo iniciar el panel de cuenta:", error);
    setMessage("No se pudo iniciar el panel de cuenta.", "error");
  });
})();
