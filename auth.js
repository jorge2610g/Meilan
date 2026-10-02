(() => {
  const FIREBASE_VERSION = "12.19.0";
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
    firebaseApp: null,
    auth: null,
    db: null,
    user: null,
    subscription: null,
    configured: false,
    busy: false,
    api: null
  };

  function credentialsReady(){
    const f = cfg.firebaseConfig || {};
    return Boolean(
      f.apiKey &&
      f.authDomain &&
      f.projectId &&
      f.appId
    );
  }

  async function loadFirebase(){
    const base = "https://www.gstatic.com/firebasejs/" + FIREBASE_VERSION + "/";
    const [appApi, authApi, firestoreApi] = await Promise.all([
      import(base + "firebase-app.js"),
      import(base + "firebase-auth.js"),
      import(base + "firebase-firestore.js")
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
      serverTimestamp: firestoreApi.serverTimestamp
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
      "auth/network-request-failed": "No se pudo conectar con Firebase. Revisa tu conexión."
    };
    return map[code] || error?.message || fallback;
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
    if(!state.db || !state.user || !state.api) return;

    try{
      const ref = state.api.doc(state.db, "meilan_subscriptions", state.user.uid);
      const snap = await state.api.getDoc(ref);
      state.subscription = snap.exists() ? snap.data() : null;
    }catch(error){
      console.warn("No se pudo leer la suscripción de Meilan:", error);
      setMessage("La cuenta inició sesión, pero no se pudo leer el estado de suscripción.", "warning");
    }
  }

  async function handleUser(user){
    state.user = user || null;
    if(state.user && cfg.requireVerifiedEmail && !state.user.emailVerified){
      state.subscription = null;
    }else{
      await loadSubscription();
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
    setMessage("Ingresando…");
    try{
      const credential = await state.api.signInWithEmailAndPassword(state.auth, email, password);
      if(cfg.requireVerifiedEmail && !credential.user.emailVerified){
        await state.api.sendEmailVerification(credential.user);
        await state.api.signOut(state.auth);
        setMessage("Tu correo todavía no está verificado. Te enviamos un nuevo enlace de verificación.", "warning");
        return;
      }
      setMessage("Sesión iniciada correctamente.", "success");
      closeModal();
    }catch(error){
      setMessage(friendlyError(error, "No se pudo iniciar sesión."), "error");
    }finally{
      setBusy(false);
    }
  }

  async function register(){
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
        setMessage("Cuenta creada e iniciada.", "success");
        closeModal();
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
      render();
      setMessage("Sesión cerrada.", "success");
    }catch(error){
      setMessage(friendlyError(error, "No se pudo cerrar la sesión."), "error");
    }finally{
      setBusy(false);
    }
  }

  async function requestSubscription(){
    if(!state.db || !state.user || state.busy || !state.api) return;

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
      const ref = state.api.doc(state.db, "meilan_subscriptions", state.user.uid);
      const existing = await state.api.getDoc(ref);
      const payload = {
        user_id: state.user.uid,
        plan_code: planCode,
        status: "pending",
        updated_at: state.api.serverTimestamp()
      };

      if(!existing.exists()){
        payload.created_at = state.api.serverTimestamp();
      }

      await state.api.setDoc(ref, payload, { merge: true });
      await loadSubscription();
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
      setMessage("El panel ya está preparado para Firebase. Falta conectar el proyecto Firebase dedicado a Meilan.", "warning");
      return;
    }

    try{
      await loadFirebase();

      state.firebaseApp = state.api.initializeApp(cfg.firebaseConfig);
      state.auth = state.api.getAuth(state.firebaseApp);
      state.db = state.api.getFirestore(state.firebaseApp);

      await state.api.setPersistence(state.auth, state.api.browserLocalPersistence);

      state.api.onAuthStateChanged(state.auth, user => {
        handleUser(user).catch(error => {
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
