const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const {
  getFirestore,
  Timestamp,
  FieldValue
} = require("firebase-admin/firestore");
const {
  MercadoPagoConfig,
  Preference,
  Payment
} = require("mercadopago");

initializeApp();

const db = getFirestore();
const REGION = "southamerica-west1";
const PROJECT_ID = "meilan-95042";
const SITE_URL = "https://meilan.online/";
const DAY_MS = 24 * 60 * 60 * 1000;
const ADMIN_EMAILS = new Set(["scuentas150@gmail.com"]);
const PRIVATE_CONFIG_PATH = "meilan_private/mercadopago";
const PRIVATE_PLANS_PATH = "meilan_private/plans";

async function isAdminAuth(auth) {
  if (!auth?.uid) return false;

  const email = String(auth.token?.email || "").trim().toLowerCase();
  if (email && ADMIN_EMAILS.has(email)) return true;

  const snap = await db.collection("meilan_admins").doc(auth.uid).get();
  return snap.exists && snap.data()?.active === true;
}

async function requireAdmin(auth) {
  if (!auth?.uid) throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  if (!(await isAdminAuth(auth))) {
    throw new HttpsError("permission-denied", "No tienes acceso de administrador.");
  }
}

function cleanText(value, max = 160) {
  return String(value || "").trim().slice(0, max);
}

function normalizePlanInput(data) {
  const name = cleanText(data?.name, 80);
  const description = cleanText(data?.description, 240);
  const type = data?.type === "trial" ? "trial" : "paid";
  const days = Math.max(1, Math.min(3650, Math.trunc(Number(data?.days || 0))));
  const rawPrice = Math.trunc(Number(data?.priceClp || 0));
  const priceClp = type === "trial" ? 0 : Math.max(1, Math.min(100000000, rawPrice));
  const sortOrder = Math.max(-100000, Math.min(100000, Math.trunc(Number(data?.sortOrder || 0))));
  const active = data?.active !== false;

  if (!name) throw new HttpsError("invalid-argument", "El plan necesita un nombre.");
  if (!Number.isFinite(days) || days < 1) {
    throw new HttpsError("invalid-argument", "La duración del plan no es válida.");
  }
  if (type === "paid" && (!Number.isFinite(priceClp) || priceClp < 1)) {
    throw new HttpsError("invalid-argument", "El precio del plan no es válido.");
  }

  return { name, description, type, days, priceClp, sortOrder, active };
}

async function ensureDefaultPlans() {
  const markerRef = db.doc(PRIVATE_PLANS_PATH);
  const marker = await markerRef.get();
  if (marker.exists && marker.data()?.initialized === true) return;

  const batch = db.batch();
  const now = FieldValue.serverTimestamp();

  batch.set(db.collection("meilan_plans").doc("trial_7d"), {
    name: "Prueba gratis",
    description: "Prueba todas las funciones de Meilan sin costo.",
    type: "trial",
    days: 7,
    price_clp: 0,
    active: true,
    sort_order: 10,
    created_at: now,
    updated_at: now
  }, { merge: true });

  batch.set(db.collection("meilan_plans").doc("monthly_30d"), {
    name: "Plan 30 días",
    description: "Pago único por 30 días de acceso. No se renueva automáticamente.",
    type: "paid",
    days: 30,
    price_clp: 3000,
    active: true,
    sort_order: 20,
    created_at: now,
    updated_at: now
  }, { merge: true });

  batch.set(markerRef, {
    initialized: true,
    initialized_at: now
  }, { merge: true });

  await batch.commit();
}

function serializePlan(doc) {
  const data = doc.data() || {};
  return {
    id: doc.id,
    name: cleanText(data.name, 80),
    description: cleanText(data.description, 240),
    type: data.type === "trial" ? "trial" : "paid",
    days: Number(data.days || 0),
    priceClp: Number(data.price_clp || 0),
    active: data.active !== false,
    sortOrder: Number(data.sort_order || 0)
  };
}

async function readPlans(includeInactive = false) {
  await ensureDefaultPlans();
  const snap = await db.collection("meilan_plans").get();
  return snap.docs
    .map(serializePlan)
    .filter(plan => includeInactive || plan.active)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "es"));
}

async function readAccessToken() {
  const snap = await db.doc(PRIVATE_CONFIG_PATH).get();
  const token = String(snap.data()?.access_token || "").trim();

  if (token.length < 20) {
    throw new HttpsError("failed-precondition", "Mercado Pago todavía no está configurado.");
  }
  return token;
}

async function mercadoPagoClient() {
  return new MercadoPagoConfig({
    accessToken: await readAccessToken(),
    options: { timeout: 10000 }
  });
}

async function mercadoPagoRequest(path, options = {}) {
  const accessToken = await readAccessToken();
  const response = await fetch("https://api.mercadopago.com" + path, {
    method: options.method || "GET",
    headers: {
      Authorization: "Bearer " + accessToken,
      "Content-Type": "application/json"
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    console.error("Mercado Pago API error", response.status, data);
    throw new HttpsError("internal", "Mercado Pago rechazó la operación.");
  }

  return data;
}

function webhookUrl() {
  return `https://${REGION}-${PROJECT_ID}.cloudfunctions.net/mercadoPagoWebhook`;
}

exports.saveMercadoPagoAccessToken = onCall(
  { region: REGION },
  async request => {
    await requireAdmin(request.auth);

    const accessToken = String(request.data?.accessToken || "").trim();
    if (accessToken.length < 20) {
      throw new HttpsError("invalid-argument", "Access Token inválido.");
    }

    await db.doc(PRIVATE_CONFIG_PATH).set({
      access_token: accessToken,
      updated_at: FieldValue.serverTimestamp(),
      updated_by: request.auth.uid
    }, { merge: true });

    return { ok: true };
  }
);

exports.listMeilanPlans = onCall(
  { region: REGION },
  async request => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
    }
    return { plans: await readPlans(false) };
  }
);

exports.listMeilanPlansAdmin = onCall(
  { region: REGION },
  async request => {
    await requireAdmin(request.auth);
    return { plans: await readPlans(true) };
  }
);

exports.saveMeilanPlan = onCall(
  { region: REGION },
  async request => {
    await requireAdmin(request.auth);
    await ensureDefaultPlans();

    const plan = normalizePlanInput(request.data || {});
    const requestedId = cleanText(request.data?.id, 100);
    const ref = requestedId
      ? db.collection("meilan_plans").doc(requestedId)
      : db.collection("meilan_plans").doc();

    const existing = await ref.get();
    const payload = {
      name: plan.name,
      description: plan.description,
      type: plan.type,
      days: plan.days,
      price_clp: plan.priceClp,
      active: plan.active,
      sort_order: plan.sortOrder,
      updated_at: FieldValue.serverTimestamp(),
      updated_by: request.auth.uid
    };

    if (!existing.exists) payload.created_at = FieldValue.serverTimestamp();

    await ref.set(payload, { merge: true });
    return { ok: true, planId: ref.id };
  }
);

exports.deleteMeilanPlan = onCall(
  { region: REGION },
  async request => {
    await requireAdmin(request.auth);
    const planId = cleanText(request.data?.planId, 100);
    if (!planId) throw new HttpsError("invalid-argument", "Falta el plan.");
    await db.collection("meilan_plans").doc(planId).delete();
    return { ok: true };
  }
);

exports.startMeilanTrial = onCall(
  { region: REGION },
  async request => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
    }

    await ensureDefaultPlans();

    const uid = request.auth.uid;
    const planId = cleanText(request.data?.planId, 100);
    const planRef = db.collection("meilan_plans").doc(planId);
    const subscriptionRef = db.collection("meilan_subscriptions").doc(uid);

    await db.runTransaction(async tx => {
      const [planSnap, subscriptionSnap] = await Promise.all([
        tx.get(planRef),
        tx.get(subscriptionRef)
      ]);

      if (!planSnap.exists) {
        throw new HttpsError("not-found", "Ese plan ya no existe.");
      }

      const plan = serializePlan(planSnap);
      if (!plan.active || plan.type !== "trial") {
        throw new HttpsError("failed-precondition", "La prueba seleccionada no está disponible.");
      }

      if (subscriptionSnap.exists) {
        throw new HttpsError("failed-precondition", "Esta cuenta ya utilizó o tiene configurado un período de acceso.");
      }

      const now = Timestamp.now();
      const end = Timestamp.fromMillis(now.toMillis() + plan.days * DAY_MS);

      tx.set(subscriptionRef, {
        user_id: uid,
        plan_code: plan.id,
        plan_name: plan.name,
        status: "trial",
        trial_used: true,
        trial_started_at: now,
        trial_end: end,
        trial_days_snapshot: plan.days,
        created_at: FieldValue.serverTimestamp(),
        updated_at: FieldValue.serverTimestamp()
      });
    });

    return { ok: true };
  }
);

exports.createMeilanCheckout = onCall(
  { region: REGION },
  async request => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
    }

    await ensureDefaultPlans();

    const uid = request.auth.uid;
    const email = String(request.auth.token?.email || "").trim();
    const planId = cleanText(request.data?.planId, 100);

    if (!email) {
      throw new HttpsError("failed-precondition", "Tu cuenta necesita un correo para crear la suscripción.");
    }

    const planSnap = await db.collection("meilan_plans").doc(planId).get();
    if (!planSnap.exists) {
      throw new HttpsError("not-found", "Ese plan ya no existe.");
    }

    const plan = serializePlan(planSnap);
    if (!plan.active || plan.type !== "paid") {
      throw new HttpsError("failed-precondition", "Ese plan no está disponible para suscripción.");
    }

    const linkRef = db.collection("meilan_subscription_links").doc(uid);
    const existingLink = await linkRef.get();

    if (existingLink.exists && existingLink.data()?.preapproval_id) {
      const existing = existingLink.data();
      try {
        const remote = await mercadoPagoRequest("/preapproval/" + encodeURIComponent(existing.preapproval_id));
        if (remote?.status === "authorized") {
          throw new HttpsError("failed-precondition", "Ya tienes una suscripción mensual activa.");
        }
        if (remote?.status === "pending" && existing.init_point) {
          return {
            checkoutUrl: existing.init_point,
            subscriptionId: existing.preapproval_id,
            reused: true
          };
        }
      } catch (error) {
        if (error instanceof HttpsError && error.code === "failed-precondition") throw error;
        console.warn("No se pudo reutilizar la suscripción anterior:", error?.message || error);
      }
    }

    const requestRef = db.collection("meilan_subscription_requests").doc();
    const externalReference = `meilan-sub:${requestRef.id}`;

    await requestRef.set({
      request_id: requestRef.id,
      user_id: uid,
      plan_id: plan.id,
      plan_name: plan.name,
      amount: plan.priceClp,
      currency: "CLP",
      frequency: 1,
      frequency_type: "months",
      status: "creating",
      external_reference: externalReference,
      created_at: FieldValue.serverTimestamp()
    });

    try {
      const result = await mercadoPagoRequest("/preapproval", {
        method: "POST",
        body: {
          reason: `Meilan · ${plan.name}`,
          external_reference: externalReference,
          payer_email: email,
          auto_recurring: {
            frequency: 1,
            frequency_type: "months",
            transaction_amount: plan.priceClp,
            currency_id: "CLP"
          },
          back_url: SITE_URL + "?subscription=return",
          status: "pending"
        }
      });

      if (!result?.id || !result?.init_point) {
        throw new Error("Mercado Pago no devolvió una suscripción utilizable.");
      }

      await Promise.all([
        requestRef.set({
          status: result.status || "pending",
          preapproval_id: result.id,
          init_point: result.init_point,
          updated_at: FieldValue.serverTimestamp()
        }, { merge: true }),
        linkRef.set({
          user_id: uid,
          plan_id: plan.id,
          plan_name: plan.name,
          amount: plan.priceClp,
          currency: "CLP",
          external_reference: externalReference,
          preapproval_id: result.id,
          init_point: result.init_point,
          mp_status: result.status || "pending",
          auto_renew: false,
          updated_at: FieldValue.serverTimestamp()
        }, { merge: true })
      ]);

      return {
        checkoutUrl: result.init_point,
        subscriptionId: result.id
      };
    } catch (error) {
      await requestRef.set({
        status: "error",
        updated_at: FieldValue.serverTimestamp()
      }, { merge: true });

      console.error("Error creando suscripción Mercado Pago:", error?.message || error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("internal", "No se pudo iniciar la suscripción.");
    }
  }
);

exports.syncMeilanSubscription = onCall(
  { region: REGION },
  async request => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
    }

    const uid = request.auth.uid;
    const linkRef = db.collection("meilan_subscription_links").doc(uid);
    const subscriptionRef = db.collection("meilan_subscriptions").doc(uid);
    const linkSnap = await linkRef.get();

    if (!linkSnap.exists || !linkSnap.data()?.preapproval_id) {
      return { ok: true, status: "none", autoRenew: false };
    }

    const link = linkSnap.data();
    const remote = await mercadoPagoRequest(
      "/preapproval/" + encodeURIComponent(link.preapproval_id)
    );

    if (remote?.external_reference && remote.external_reference !== link.external_reference) {
      throw new HttpsError("permission-denied", "La suscripción no coincide con esta cuenta.");
    }

    const mpStatus = String(remote?.status || "unknown");
    const nextPayment = remote?.next_payment_date
      ? Timestamp.fromDate(new Date(remote.next_payment_date))
      : null;

    await linkRef.set({
      mp_status: mpStatus,
      next_payment_date: nextPayment,
      auto_renew: mpStatus === "authorized",
      updated_at: FieldValue.serverTimestamp()
    }, { merge: true });

    const currentSnap = await subscriptionRef.get();
    const current = currentSnap.exists ? currentSnap.data() : null;
    const nowMs = Date.now();
    const currentEndMs = current?.current_period_end?.toMillis
      ? current.current_period_end.toMillis()
      : 0;

    if (mpStatus === "authorized") {
      const update = {
        user_id: uid,
        plan_code: link.plan_id,
        plan_name: link.plan_name || "Suscripción mensual",
        status: "active",
        subscription_mode: "recurring",
        auto_renew: true,
        mercado_pago_preapproval_id: link.preapproval_id,
        mercado_pago_status: mpStatus,
        updated_at: FieldValue.serverTimestamp()
      };

      if (nextPayment) {
        update.current_period_end = nextPayment;
      }
      if (!currentSnap.exists) {
        update.created_at = FieldValue.serverTimestamp();
        update.current_period_start = FieldValue.serverTimestamp();
      }

      await subscriptionRef.set(update, { merge: true });
    } else if (["canceled", "paused"].includes(mpStatus)) {
      const keepActive = currentEndMs > nowMs;
      await subscriptionRef.set({
        auto_renew: false,
        mercado_pago_status: mpStatus,
        status: keepActive ? "active" : mpStatus,
        updated_at: FieldValue.serverTimestamp()
      }, { merge: true });
    } else if (mpStatus === "pending") {
      await subscriptionRef.set({
        mercado_pago_status: mpStatus,
        auto_renew: false,
        updated_at: FieldValue.serverTimestamp()
      }, { merge: true });
    }

    return {
      ok: true,
      status: mpStatus,
      autoRenew: mpStatus === "authorized",
      nextPaymentDate: remote?.next_payment_date || null
    };
  }
);

exports.cancelMeilanSubscription = onCall(
  { region: REGION },
  async request => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
    }

    const uid = request.auth.uid;
    const linkRef = db.collection("meilan_subscription_links").doc(uid);
    const subscriptionRef = db.collection("meilan_subscriptions").doc(uid);
    const linkSnap = await linkRef.get();

    if (!linkSnap.exists || !linkSnap.data()?.preapproval_id) {
      throw new HttpsError("failed-precondition", "No hay una suscripción para cancelar.");
    }

    const preapprovalId = linkSnap.data().preapproval_id;
    const remote = await mercadoPagoRequest(
      "/preapproval/" + encodeURIComponent(preapprovalId),
      {
        method: "PUT",
        body: { status: "canceled" }
      }
    );

    await Promise.all([
      linkRef.set({
        mp_status: remote?.status || "canceled",
        auto_renew: false,
        updated_at: FieldValue.serverTimestamp()
      }, { merge: true }),
      subscriptionRef.set({
        auto_renew: false,
        mercado_pago_status: remote?.status || "canceled",
        updated_at: FieldValue.serverTimestamp()
      }, { merge: true })
    ]);

    return { ok: true, status: remote?.status || "canceled" };
  }
);

exports.mercadoPagoWebhook = onRequest(
  { region: REGION },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).send("method_not_allowed");
      return;
    }

    const dataId = String(
      req.query["data.id"] ||
      req.body?.data?.id ||
      req.query.id ||
      req.body?.id ||
      ""
    );

    if (!dataId) {
      res.status(200).send("ignored");
      return;
    }

    try {
      const paymentApi = new Payment(await mercadoPagoClient());
      const payment = await paymentApi.get({ id: dataId });

      if (payment?.status !== "approved") {
        res.status(200).send("not_approved");
        return;
      }

      const amount = Number(payment.transaction_amount);
      const currency = String(payment.currency_id || "").toUpperCase();
      const externalReference = String(payment.external_reference || "");
      const match = /^meilan:([A-Za-z0-9_-]+)$/.exec(externalReference);

      if (!match) {
        res.status(400).send("payment_mismatch");
        return;
      }

      const checkoutId = match[1];
      const checkoutRef = db.collection("meilan_checkouts").doc(checkoutId);
      const checkoutSnap = await checkoutRef.get();

      if (!checkoutSnap.exists) {
        res.status(400).send("checkout_not_found");
        return;
      }

      const checkout = checkoutSnap.data() || {};
      if (
        checkout.external_reference !== externalReference ||
        amount !== Number(checkout.amount) ||
        currency !== String(checkout.currency || "").toUpperCase() ||
        !checkout.user_id ||
        !checkout.plan_id ||
        Number(checkout.plan_days) < 1
      ) {
        console.warn("Pago Mercado Pago no coincide con el checkout Meilan.", {
          paymentId: payment.id,
          amount,
          currency,
          externalReference,
          checkoutId
        });
        res.status(400).send("payment_mismatch");
        return;
      }

      const uid = checkout.user_id;
      const planDays = Number(checkout.plan_days);
      const paymentId = String(payment.id || dataId);
      const paymentRef = db.collection("meilan_payments").doc(paymentId);
      const subscriptionRef = db.collection("meilan_subscriptions").doc(uid);

      await db.runTransaction(async tx => {
        const [paymentSnap, subscriptionSnap, currentCheckoutSnap] = await Promise.all([
          tx.get(paymentRef),
          tx.get(subscriptionRef),
          tx.get(checkoutRef)
        ]);

        if (paymentSnap.exists) return;

        const currentCheckout = currentCheckoutSnap.data() || {};
        if (currentCheckout.status === "paid") return;

        const nowMs = Date.now();
        const current = subscriptionSnap.exists ? subscriptionSnap.data() : null;
        const currentEnd = current?.current_period_end?.toMillis
          ? current.current_period_end.toMillis()
          : 0;
        const trialEnd = current?.trial_end?.toMillis
          ? current.trial_end.toMillis()
          : 0;

        const baseMs = Math.max(nowMs, currentEnd, trialEnd);
        const newEnd = Timestamp.fromMillis(baseMs + planDays * DAY_MS);
        const existingStart = current?.status === "active" && current?.current_period_start
          ? current.current_period_start
          : Timestamp.fromMillis(nowMs);

        const subscriptionData = {
          user_id: uid,
          plan_code: checkout.plan_id,
          plan_name: checkout.plan_name || "Plan Meilan",
          status: "active",
          trial_used: current?.trial_used === true || Boolean(current?.trial_started_at),
          current_period_start: existingStart,
          current_period_end: newEnd,
          plan_days_snapshot: planDays,
          last_payment_id: paymentId,
          updated_at: FieldValue.serverTimestamp()
        };

        if (!subscriptionSnap.exists) {
          subscriptionData.created_at = FieldValue.serverTimestamp();
        }

        tx.set(subscriptionRef, subscriptionData, { merge: true });
        tx.set(paymentRef, {
          user_id: uid,
          payment_id: paymentId,
          plan_id: checkout.plan_id,
          plan_name: checkout.plan_name || null,
          plan_days: planDays,
          status: payment.status,
          amount,
          currency,
          external_reference: externalReference,
          approved_at: payment.date_approved || null,
          created_at: FieldValue.serverTimestamp()
        });
        tx.set(checkoutRef, {
          status: "paid",
          payment_id: paymentId,
          paid_at: FieldValue.serverTimestamp(),
          updated_at: FieldValue.serverTimestamp()
        }, { merge: true });
      });

      res.status(200).send("ok");
    } catch (error) {
      console.error("Error procesando webhook Mercado Pago:", error?.message || error);
      res.status(500).send("internal_error");
    }
  }
);
