(() => {
  const FIREBASE_VERSION = "12.19.0";
  const cfg = window.MEILAN_CONFIG || {};
  const billing = cfg.billing || {};
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
    adminSignedEmail: $("adminSignedEmail"),
    adminLogoutBtn: $("adminLogoutBtn"),

    subscriptionStatus: $("subscriptionStatus"),
    subscriptionActiveState: $("subscriptionActiveState"),
    currentPlanName: $("currentPlanName"),
    currentPlanEndsText: $("currentPlanEndsText"),
    subscriptionCountdown: $("subscriptionCountdown"),
    subscriptionCountdownLabel: $("subscriptionCountdownLabel"),
    recurringSubscriptionState: $("recurringSubscriptionState"),
    cancelSubscriptionBtn: $("cancelSubscriptionBtn"),
    planCatalog: $("planCatalog"),
    planCatalogEmpty: $("planCatalogEmpty"),

    mpAccessToken: $("mpAccessToken"),
    saveMpCredentialsBtn: $("saveMpCredentialsBtn"),
    mpCredentialStatus: $("mpCredentialStatus"),

    planEditorTitle: $("planEditorTitle"),
    planId: $("planId"),
    planName: $("planName"),
    planType: $("planType"),
    planDays: $("planDays"),
    planDaysLabel: $("planDaysLabel"),
    planPrice: $("planPrice"),
    planSortOrder: $("planSortOrder"),
    planActive: $("planActive"),
    planDescription: $("planDescription"),
    savePlanBtn: $("savePlanBtn"),
    cancelPlanEditBtn: $("cancelPlanEditBtn"),
    adminPlanCount: $("adminPlanCount"),
    adminPlansList: $("adminPlansList")
  };

  const state = {
    firebaseApp: null,
    auth: null,
    db: null,
    functions: null,
    user: null,
    subscription: null,
    plans: [],
    adminPlans: [],
    isAdmin: false,
    adminSession: false,
    loginMode: "user",
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
      "functions/failed-precondition": "Esta operación no está disponible para esta cuenta.",
      "functions/not-found": "El plan seleccionado ya no existe.",
      "functions/invalid-argument": "Revisa los datos ingresados.",
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
      els.saveMpCredentialsBtn,
      els.savePlanBtn,
      els.cancelPlanEditBtn
    ].filter(Boolean).forEach(btn => btn.disabled = busy);

    document.querySelectorAll("[data-plan-action]").forEach(btn => {
      btn.disabled = busy || btn.dataset.permanentDisabled === "1";
    });

    if(els.saveMpCredentialsBtn && !billing.adminCredentialSaveEnabled) {
      els.saveMpCredentialsBtn.disabled = true;
    }
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
    if(state.user) return;
    state.loginMode = mode === "admin" ? "admin" : "user";
    els.userRoleBtn?.classList.toggle("active", state.loginMode === "user");
    els.adminRoleBtn?.classList.toggle("active", state.loginMode === "admin");

    if(els.registerBtn) els.registerBtn.hidden = state.loginMode === "admin";
    if(els.authRoleHint){
      els.authRoleHint.textContent = state.loginMode === "admin"
        ? "Acceso exclusivo para cuentas administradoras autorizadas."
        : "Acceso normal para usuarios de Meilan. Este ingreso nunca abre el panel administrador.";
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
    return new Date(date.getTime() + Number(days || 0) * 86400000);
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
    const explicit = toDate(state.subscription?.trial_end);
    if(explicit) return explicit;
    const started = toDate(state.subscription?.trial_started_at);
    const days = Number(state.subscription?.trial_days_snapshot || billing.trialDays || 7);
    return started ? addDays(started, days) : null;
  }

  function activePlanEndsAt(){
    return toDate(state.subscription?.current_period_end);
  }

  function entitlement(){
    const s = state.subscription;
    const now = Date.now();

    if(!s) return {active:false, kind:"none", end:null};

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

    return {active:false, kind:s.status || "none", end:null};
  }

  function subscriptionLabel(){
    const e = entitlement();
    if(e.kind === "none") return {text:"Elige un plan", cls:"soon"};
    if(e.kind === "trial") return {text:"Prueba activa", cls:"ok"};
    if(e.kind === "trial_expired") return {text:"Prueba finalizada", cls:"neutral"};
    if(e.kind === "paid") return {text:"Plan activo", cls:"ok"};
    if(e.kind === "paid_expired") return {text:"Plan vencido", cls:"neutral"};

    const labels = {
      pending:"Pago pendiente",
      canceled:"Cancelado",
      expired:"Vencido",
      past_due:"Pago pendiente"
    };
    return {text:labels[e.kind] || "Plan disponible", cls:e.kind === "pending" ? "soon" : "neutral"};
  }

  function formatRemaining(ms){
    if(!Number.isFinite(ms) || ms <= 0) return "0d 00h 00m 00s";
    let total = Math.floor(ms / 1000);
    const days = Math.floor(total / 86400);
    total -= days * 86400;
    const hours = Math.floor(total / 3600);
    total -= hours * 3600;
    const minutes = Math.floor(total / 60);
    const seconds = total - minutes * 60;
    return `${days}d ${String(hours).padStart(2,"0")}h ${String(minutes).padStart(2,"0")}m ${String(seconds).padStart(2,"0")}s`;
  }

  function updateCountdown(){
    if(!els.subscriptionCountdown) return;
    const e = entitlement();
    els.subscriptionCountdown.textContent = e.active && e.end
      ? formatRemaining(e.end.getTime() - Date.now())
      : "—";
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
    }else if(state.configured && cfg.requireActiveSubscription === true && state.user && !state.adminSession){
      const e = entitlement();
      if(!e.active){
        locked = true;
        title = "Activa o renueva tu acceso";
        text = "Elige una prueba disponible o un plan pagado para continuar.";
      }
    }

    document.body.classList.toggle("auth-locked", locked);
    els.gate.hidden = !locked;
    if(locked){
      els.gateTitle.textContent = title;
      els.gateText.textContent = text;
    }
  }

  function renderCurrentAccess(){
    const e = entitlement();
    const show = Boolean(e.active && e.end);
    const recurring = Boolean(
      state.subscription?.subscription_mode === "recurring" &&
      state.subscription?.auto_renew === true
    );

    if(els.subscriptionActiveState) els.subscriptionActiveState.hidden = !show;
    if(show){
      const planName = state.subscription?.plan_name
        || (e.kind === "trial" ? "Prueba gratis" : "Plan Meilan");
      if(els.currentPlanName) els.currentPlanName.textContent = planName;
      if(els.currentPlanEndsText){
        els.currentPlanEndsText.textContent = recurring
          ? "Próximo cobro: " + formatDate(e.end) + "."
          : "Tu acceso termina el " + formatDate(e.end) + ".";
      }
    }

    if(els.subscriptionCountdownLabel){
      els.subscriptionCountdownLabel.textContent = recurring
        ? "Tiempo hasta la próxima renovación"
        : "Tiempo restante";
    }
    if(els.recurringSubscriptionState){
      els.recurringSubscriptionState.hidden = !recurring;
    }
    if(els.cancelSubscriptionBtn){
      els.cancelSubscriptionBtn.disabled = state.busy || !recurring;
    }
    updateCountdown();
  }

  function priceText(plan){
    if(plan.type === "trial" || Number(plan.priceClp) === 0) return "$0";
    return "$" + Number(plan.priceClp || 0).toLocaleString("es-CL") + " CLP";
  }

  function renderPlanCatalog(){
    if(!els.planCatalog) return;
    els.planCatalog.innerHTML = "";

    const plans = state.plans.filter(plan => plan.active !== false);
    if(els.planCatalogEmpty) els.planCatalogEmpty.hidden = plans.length > 0;

    const hasAnySubscription = Boolean(state.subscription);
    const e = entitlement();

    plans.forEach(plan => {
      const card = document.createElement("article");
      card.className = "plan-offer " + (plan.type === "trial" ? "trial-offer" : "paid-offer");

      const kicker = document.createElement("span");
      kicker.className = "plan-kicker";
      kicker.textContent = plan.type === "trial" ? "PRUEBA GRATIS" : "PLAN";

      const title = document.createElement("strong");
      title.className = "plan-card-title";
      title.textContent = plan.name;

      const priceRow = document.createElement("div");
      priceRow.className = "plan-price-row";

      const price = document.createElement("strong");
      price.textContent = priceText(plan);

      const duration = document.createElement("span");
      duration.textContent = plan.type === "trial"
        ? Number(plan.days) + (Number(plan.days) === 1 ? " día" : " días")
        : "por mes";

      priceRow.append(price, duration);

      const description = document.createElement("p");
      description.textContent = plan.description || (plan.type === "trial"
        ? "Prueba gratuita de Meilan."
        : "Acceso a Meilan por " + plan.days + " días.");

      const button = document.createElement("button");
      button.type = "button";
      button.className = "btn primary wide";
      button.dataset.planAction = plan.type;
      button.dataset.planId = plan.id;

      if(plan.type === "trial"){
        const unavailable = hasAnySubscription;
        button.textContent = unavailable ? "Prueba ya utilizada o no disponible" : "Comenzar prueba gratis";
        button.dataset.permanentDisabled = unavailable ? "1" : "0";
        button.disabled = state.busy || unavailable;
        button.addEventListener("click", () => startTrial(plan.id));
      }else{
        const recurringActive = Boolean(
          state.subscription?.subscription_mode === "recurring" &&
          state.subscription?.auto_renew === true
        );
        button.textContent = recurringActive
          ? "Suscripción mensual activa"
          : "Suscribirme por " + priceText(plan) + "/mes";
        button.dataset.permanentDisabled = billing.mercadoPagoEnabled && !recurringActive ? "0" : "1";
        button.disabled = state.busy || !billing.mercadoPagoEnabled || recurringActive;
        button.addEventListener("click", () => buyPlan(plan.id));
      }

      const note = document.createElement("small");
      note.textContent = plan.type === "trial"
        ? "Una prueba gratis por cuenta."
        : "Renovación automática mensual. Puedes cancelar la renovación desde tu cuenta.";

      card.append(kicker, title, priceRow, description, button, note);
      els.planCatalog.appendChild(card);
    });
  }

  function renderAdminPlans(){
    if(!els.adminPlansList) return;
    els.adminPlansList.innerHTML = "";
    if(els.adminPlanCount) els.adminPlanCount.textContent = String(state.adminPlans.length);

    if(!state.adminPlans.length){
      els.adminPlansList.innerHTML = '<div class="history-empty">No hay planes configurados.</div>';
      return;
    }

    state.adminPlans.forEach(plan => {
      const row = document.createElement("div");
      row.className = "admin-plan-row";

      const info = document.createElement("div");
      info.className = "admin-plan-info";

      const name = document.createElement("strong");
      name.textContent = plan.name;

      const meta = document.createElement("small");
      meta.textContent = [
        plan.type === "trial" ? "Prueba" : "Suscripción mensual",
        plan.type === "trial" ? plan.days + " días" : "Renovación cada mes",
        priceText(plan),
        plan.active ? "Visible" : "Oculto"
      ].join(" · ");

      info.append(name, meta);

      const actions = document.createElement("div");
      actions.className = "admin-plan-actions";

      const edit = document.createElement("button");
      edit.type = "button";
      edit.className = "btn secondary small";
      edit.textContent = "Editar";
      edit.dataset.planAction = "admin-edit";
      edit.addEventListener("click", () => editPlan(plan));

      const del = document.createElement("button");
      del.type = "button";
      del.className = "btn ghost small danger-action";
      del.textContent = "Eliminar";
      del.dataset.planAction = "admin-delete";
      del.addEventListener("click", () => deletePlan(plan));

      actions.append(edit, del);
      row.append(info, actions);
      els.adminPlansList.appendChild(row);
    });
  }

  function render(){
    if(els.setupNotice) els.setupNotice.hidden = state.configured;
    if(els.authForms) els.authForms.hidden = !state.configured || Boolean(state.user);

    const showAdmin = Boolean(state.user && state.isAdmin && state.adminSession);
    if(els.adminPanel) els.adminPanel.hidden = !showAdmin;
    if(els.accountPanel) els.accountPanel.hidden = !state.user || showAdmin;

    if(els.openBtn){
      els.openBtn.textContent = state.user
        ? (showAdmin ? "Administrador" : "Mi cuenta")
        : "Acceder";
    }

    if(state.user && els.signedEmail) els.signedEmail.textContent = state.user.email || "Cuenta Meilan";
    if(state.user && els.adminSignedEmail) els.adminSignedEmail.textContent = state.user.email || "Administrador";

    const badge = subscriptionLabel();
    if(els.subscriptionStatus){
      els.subscriptionStatus.textContent = badge.text;
      els.subscriptionStatus.className = "status-badge " + badge.cls;
    }

    if(els.mpCredentialStatus){
      els.mpCredentialStatus.textContent = billing.adminCredentialSaveEnabled
        ? "Guardado seguro habilitado"
        : "Backend seguro pendiente";
      els.mpCredentialStatus.className = "status-badge " + (billing.adminCredentialSaveEnabled ? "ok" : "soon");
    }

    if(!showAdmin){
      renderCurrentAccess();
      renderPlanCatalog();
    }else{
      renderAdminPlans();
    }

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

  async function syncSubscriptionWithBackend(){
    if(!state.functions || !state.user || state.adminSession || !state.api) return null;
    try{
      const sync = state.api.httpsCallable(state.functions, "syncMeilanSubscription");
      const result = await sync({});
      return result?.data || null;
    }catch(error){
      console.warn("No se pudo sincronizar la suscripción mensual:", error);
      return null;
    }
  }

  async function loadPlans(){
    state.plans = [];
    if(!state.functions || !state.user || !state.api) return;

    try{
      const listPlans = state.api.httpsCallable(state.functions, "listMeilanPlans");
      const result = await listPlans({});
      state.plans = Array.isArray(result?.data?.plans) ? result.data.plans : [];
    }catch(error){
      console.error("No se pudieron cargar los planes:", error);
      setMessage(friendlyError(error, "No se pudieron cargar los planes."), "error");
    }
  }

  async function loadAdminPlans(){
    state.adminPlans = [];
    if(!state.functions || !state.user || !state.api || !state.adminSession) return;

    try{
      const listPlans = state.api.httpsCallable(state.functions, "listMeilanPlansAdmin");
      const result = await listPlans({});
      state.adminPlans = Array.isArray(result?.data?.plans) ? result.data.plans : [];
    }catch(error){
      console.error("No se pudieron cargar los planes de administración:", error);
      setMessage(friendlyError(error, "No se pudieron cargar los planes."), "error");
    }
  }

  async function handleUser(user){
    state.user = user || null;
    state.isAdmin = false;

    if(!state.user){
      state.subscription = null;
      state.plans = [];
      state.adminPlans = [];
      state.adminSession = false;
      render();
      return;
    }

    state.isAdmin = await checkAdminRole(state.user);

    if(state.loginMode === "admin"){
      if(!state.isAdmin){
        await state.api.signOut(state.auth);
        state.user = null;
        state.adminSession = false;
        render();
        setMessage("Esta cuenta no tiene acceso de administrador.", "error");
        openModal();
        return;
      }

      state.adminSession = true;
      await loadAdminPlans();
      setMessage("Acceso administrador correcto.", "success");
    }else{
      // Incluso una cuenta administradora entra como usuario si eligió Acceso usuario.
      state.adminSession = false;

      if(state.user && cfg.requireVerifiedEmail && !state.user.emailVerified){
        state.subscription = null;
        state.plans = [];
      }else{
        await syncSubscriptionWithBackend();
        await Promise.all([loadSubscription(), loadPlans()]);
      }
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

      // onAuthStateChanged termina de validar el rol y renderiza la vista correcta.
    }catch(error){
      setMessage(friendlyError(error, "No se pudo iniciar sesión."), "error");
    }finally{
      setBusy(false);
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
        setMessage("Cuenta creada. Ya puedes elegir una prueba o un plan.", "success");
      }
    }catch(error){
      setMessage(friendlyError(error, "No se pudo crear la cuenta."), "error");
    }finally{
      setBusy(false);
    }
  }

  async function logout(){
    if(!state.auth || state.busy || !state.api) return;
    setBusy(true);
    try{
      await state.api.signOut(state.auth);
      state.user = null;
      state.subscription = null;
      state.plans = [];
      state.adminPlans = [];
      state.isAdmin = false;
      state.adminSession = false;
      setLoginMode("user");
      render();
      setMessage("Sesión cerrada.", "success");
    }catch(error){
      setMessage(friendlyError(error, "No se pudo cerrar la sesión."), "error");
    }finally{
      setBusy(false);
    }
  }

  async function startTrial(planId){
    if(!state.user || !state.functions || state.busy || !state.api) return;

    setBusy(true);
    setMessage("Activando tu prueba gratis…");

    try{
      const start = state.api.httpsCallable(state.functions, "startMeilanTrial");
      await start({planId});
      await loadSubscription();
      render();
      setMessage("Prueba gratis activada correctamente.", "success");
    }catch(error){
      console.error("No se pudo activar la prueba:", error);
      setMessage(friendlyError(error, "No se pudo activar la prueba gratis."), "error");
    }finally{
      setBusy(false);
      render();
    }
  }

  async function buyPlan(planId){
    if(!state.user || !state.functions || state.busy || !state.api) return;

    if(!billing.mercadoPagoEnabled){
      setMessage("Mercado Pago todavía no está habilitado.", "warning");
      return;
    }

    let leavingForCheckout = false;
    setBusy(true);
    setMessage("Abriendo suscripción mensual en Mercado Pago…");

    try{
      const createCheckout = state.api.httpsCallable(state.functions, "createMeilanCheckout");
      const result = await createCheckout({planId});
      const checkoutUrl = result?.data?.checkoutUrl;

      if(!checkoutUrl) throw new Error("Mercado Pago no devolvió una URL de suscripción.");

      leavingForCheckout = true;
      sessionStorage.setItem("meilan_checkout_outbound", "1");
      window.location.assign(checkoutUrl);
    }catch(error){
      console.error("No se pudo abrir Mercado Pago:", error);
      sessionStorage.removeItem("meilan_checkout_outbound");
      setMessage(friendlyError(error, "No se pudo iniciar la suscripción con Mercado Pago."), "error");
    }finally{
      if(!leavingForCheckout){
        setBusy(false);
        renderPlanCatalog();
      }
    }
  }

  async function cancelMonthlySubscription(){
    if(!state.user || !state.functions || state.busy || !state.api) return;
    if(!window.confirm("¿Cancelar la renovación mensual automática? Mantendrás el acceso ya pagado hasta su fecha de término.")) return;

    setBusy(true);
    setMessage("Cancelando renovación mensual…");

    try{
      const cancel = state.api.httpsCallable(state.functions, "cancelMeilanSubscription");
      await cancel({});
      await syncSubscriptionWithBackend();
      await loadSubscription();
      render();
      setMessage("Renovación mensual cancelada. Tu acceso pagado se mantiene hasta su fecha de término.", "success");
    }catch(error){
      console.error("No se pudo cancelar la suscripción:", error);
      setMessage(friendlyError(error, "No se pudo cancelar la renovación."), "error");
    }finally{
      setBusy(false);
      render();
    }
  }

  function resetPlanEditor(){
    if(els.planId) els.planId.value = "";
    if(els.planName) els.planName.value = "";
    if(els.planType) els.planType.value = "paid";
    if(els.planDays) els.planDays.value = "30";
    if(els.planPrice) {
      els.planPrice.value = "3000";
      els.planPrice.disabled = false;
    }
    if(els.planSortOrder) els.planSortOrder.value = "20";
    if(els.planActive) els.planActive.checked = true;
    if(els.planDescription) els.planDescription.value = "";
    if(els.planEditorTitle) els.planEditorTitle.textContent = "Crear plan";
    if(els.cancelPlanEditBtn) els.cancelPlanEditBtn.hidden = true;
  }

  function syncPlanType(){
    const trial = els.planType?.value === "trial";
    if(els.planPrice){
      els.planPrice.disabled = trial;
      if(trial) els.planPrice.value = "0";
      else if(Number(els.planPrice.value) < 1) els.planPrice.value = "3000";
    }
    if(els.planDays){
      els.planDays.disabled = !trial;
      if(!trial) els.planDays.value = "30";
    }
    if(els.planDaysLabel){
      els.planDaysLabel.textContent = trial
        ? "Duración de prueba (días)"
        : "Ciclo mensual automático";
    }
  }

  function editPlan(plan){
    if(!state.adminSession) return;
    if(els.planId) els.planId.value = plan.id || "";
    if(els.planName) els.planName.value = plan.name || "";
    if(els.planType) els.planType.value = plan.type === "trial" ? "trial" : "paid";
    if(els.planDays) els.planDays.value = String(plan.days || 1);
    if(els.planPrice) els.planPrice.value = String(plan.priceClp || 0);
    if(els.planSortOrder) els.planSortOrder.value = String(plan.sortOrder || 0);
    if(els.planActive) els.planActive.checked = plan.active !== false;
    if(els.planDescription) els.planDescription.value = plan.description || "";
    if(els.planEditorTitle) els.planEditorTitle.textContent = "Editar plan";
    if(els.cancelPlanEditBtn) els.cancelPlanEditBtn.hidden = false;
    syncPlanType();
  }

  async function savePlan(){
    if(!state.adminSession || !state.isAdmin || !state.functions || state.busy || !state.api) return;

    const payload = {
      id: els.planId?.value.trim() || undefined,
      name: els.planName?.value.trim() || "",
      type: els.planType?.value === "trial" ? "trial" : "paid",
      days: Number(els.planDays?.value || 0),
      priceClp: Number(els.planPrice?.value || 0),
      sortOrder: Number(els.planSortOrder?.value || 0),
      active: Boolean(els.planActive?.checked),
      description: els.planDescription?.value.trim() || ""
    };

    if(!payload.name || !Number.isInteger(payload.days) || payload.days < 1){
      setMessage("Completa el nombre y una duración válida.", "error");
      return;
    }
    if(payload.type === "paid" && (!Number.isInteger(payload.priceClp) || payload.priceClp < 1)){
      setMessage("El plan pagado necesita un precio válido.", "error");
      return;
    }

    setBusy(true);
    setMessage(payload.id ? "Actualizando plan…" : "Creando plan…");

    try{
      const save = state.api.httpsCallable(state.functions, "saveMeilanPlan");
      await save(payload);
      resetPlanEditor();
      await loadAdminPlans();
      render();
      setMessage("Plan guardado correctamente.", "success");
    }catch(error){
      console.error("No se pudo guardar el plan:", error);
      setMessage(friendlyError(error, "No se pudo guardar el plan."), "error");
    }finally{
      setBusy(false);
      render();
    }
  }

  async function deletePlan(plan){
    if(!state.adminSession || !state.isAdmin || !state.functions || state.busy || !state.api) return;
    if(!window.confirm("¿Eliminar el plan “" + plan.name + "”?")) return;

    setBusy(true);
    setMessage("Eliminando plan…");

    try{
      const del = state.api.httpsCallable(state.functions, "deleteMeilanPlan");
      await del({planId: plan.id});
      if(els.planId?.value === plan.id) resetPlanEditor();
      await loadAdminPlans();
      render();
      setMessage("Plan eliminado.", "success");
    }catch(error){
      console.error("No se pudo eliminar el plan:", error);
      setMessage(friendlyError(error, "No se pudo eliminar el plan."), "error");
    }finally{
      setBusy(false);
      render();
    }
  }

  async function saveMercadoPagoCredentials(){
    if(!state.adminSession || !state.isAdmin || !state.functions || state.busy || !state.api){
      setMessage("Necesitas acceso administrador.", "error");
      return;
    }

    if(!billing.adminCredentialSaveEnabled){
      setMessage("El backend seguro todavía no está habilitado.", "warning");
      return;
    }

    const accessToken = els.mpAccessToken?.value.trim() || "";

    if(accessToken.length < 20){
      setMessage("Ingresa el Access Token de Mercado Pago.", "error");
      return;
    }

    setBusy(true);
    setMessage("Guardando Access Token de forma segura…");

    try{
      const saveToken = state.api.httpsCallable(state.functions, "saveMercadoPagoAccessToken");
      await saveToken({accessToken});

      if(els.mpAccessToken) els.mpAccessToken.value = "";
      setMessage("Access Token guardado de forma segura.", "success");
    }catch(error){
      console.error("No se pudo guardar el Access Token:", error);
      setMessage(friendlyError(error, "No se pudo guardar el Access Token."), "error");
    }finally{
      setBusy(false);
      render();
    }
  }

  async function resetCheckoutUiOnReturn(){
    const params = new URLSearchParams(window.location.search);
    if(params.get("payment")) return;

    const returningFromCheckout = sessionStorage.getItem("meilan_checkout_outbound") === "1";
    if(!returningFromCheckout) return;

    sessionStorage.removeItem("meilan_checkout_outbound");
    state.busy = false;

    if(els.message?.textContent?.includes("Abriendo Mercado Pago")){
      setMessage("");
    }

    if(state.user && !state.adminSession){
      await loadSubscription();
    }

    render();
  }

  function handlePaymentReturn(){
    const params = new URLSearchParams(window.location.search);
    const subscriptionReturn = params.get("subscription");
    const payment = params.get("payment");
    if(!subscriptionReturn && !payment) return;

    openModal();
    sessionStorage.removeItem("meilan_checkout_outbound");

    if(subscriptionReturn === "return"){
      setMessage("Verificando tu suscripción mensual con Mercado Pago…", "info");
      [500, 2000, 5000].forEach(delay => {
        setTimeout(async () => {
          if(!state.user || state.adminSession) return;
          const synced = await syncSubscriptionWithBackend();
          await loadSubscription();
          render();
          if(synced?.status === "authorized"){
            setMessage("Suscripción mensual activa. Mercado Pago renovará el cobro automáticamente cada mes.", "success");
          }else if(synced?.status === "pending"){
            setMessage("La suscripción todavía está pendiente de autorización en Mercado Pago.", "warning");
          }
        }, delay);
      });
      params.delete("subscription");
    }else if(payment === "success"){
      setMessage("Pago anterior recibido. Estamos confirmándolo con Mercado Pago.", "success");
      params.delete("payment");
    }else if(payment === "pending"){
      setMessage("El pago quedó pendiente.", "warning");
      params.delete("payment");
    }else if(payment === "failure"){
      setMessage("El pago no se completó.", "error");
      params.delete("payment");
    }

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
    els.saveMpCredentialsBtn?.addEventListener("click", saveMercadoPagoCredentials);
    els.cancelSubscriptionBtn?.addEventListener("click", cancelMonthlySubscription);
    els.savePlanBtn?.addEventListener("click", savePlan);
    els.cancelPlanEditBtn?.addEventListener("click", resetPlanEditor);
    els.planType?.addEventListener("change", syncPlanType);

    els.modal?.addEventListener("click", event => {
      if(event.target === els.modal) closeModal();
    });

    window.addEventListener("pageshow", () => {
      resetCheckoutUiOnReturn().catch(error => {
        console.warn("No se pudo limpiar el regreso desde Mercado Pago:", error);
      });
    });

    document.addEventListener("visibilitychange", () => {
      if(document.visibilityState !== "visible") return;
      resetCheckoutUiOnReturn().catch(error => {
        console.warn("No se pudo actualizar el regreso desde Mercado Pago:", error);
      });
    });

    setLoginMode("user");
    resetPlanEditor();
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

      setInterval(updateCountdown, 1000);
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
