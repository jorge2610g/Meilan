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
const PLAN_PRICE_CLP = 3000;
const PLAN_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const ADMIN_EMAILS = new Set(["scuentas150@gmail.com"]);
const PRIVATE_CONFIG_PATH = "meilan_private/mercadopago";

async function requireAdmin(auth) {
  if (!auth?.uid) throw new HttpsError("unauthenticated", "Debes iniciar sesión.");

  const email = String(auth.token?.email || "").trim().toLowerCase();
  if (email && ADMIN_EMAILS.has(email)) return;

  const snap = await db.collection("meilan_admins").doc(auth.uid).get();
  if (!snap.exists || snap.data()?.active !== true) {
    throw new HttpsError("permission-denied", "No tienes acceso de administrador.");
  }
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

exports.createMeilanCheckout = onCall(
  { region: REGION },
  async request => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
    }

    const uid = request.auth.uid;
    const email = request.auth.token?.email || undefined;
    const externalReference = `meilan:${uid}:${Date.now()}`;

    try {
      const preference = new Preference(await mercadoPagoClient());

      const body = {
        items: [
          {
            id: "meilan-plan-30d",
            title: "Meilan · Plan 30 días",
            description: "30 días de acceso a Meilan",
            currency_id: "CLP",
            quantity: 1,
            unit_price: PLAN_PRICE_CLP
          }
        ],
        external_reference: externalReference,
        metadata: {
          firebase_uid: uid,
          plan_code: "monthly_30d",
          plan_days: PLAN_DAYS
        },
        back_urls: {
          success: SITE_URL + "?payment=success",
          pending: SITE_URL + "?payment=pending",
          failure: SITE_URL + "?payment=failure"
        },
        auto_return: "approved",
        notification_url: webhookUrl(),
        statement_descriptor: "MEILAN"
      };

      if (email) body.payer = { email };

      const result = await preference.create({ body });

      if (!result?.init_point) {
        throw new Error("Mercado Pago no devolvió init_point.");
      }

      return {
        checkoutUrl: result.init_point,
        preferenceId: result.id || null
      };
    } catch (error) {
      console.error("Error creando preferencia Mercado Pago:", error?.message || error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("internal", "No se pudo iniciar el pago.");
    }
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
      // No confiamos en el contenido de la notificación para activar acceso.
      // Usamos solamente su ID y consultamos el pago directamente a Mercado Pago.
      const paymentApi = new Payment(await mercadoPagoClient());
      const payment = await paymentApi.get({ id: dataId });

      if (payment?.status !== "approved") {
        res.status(200).send("not_approved");
        return;
      }

      const amount = Number(payment.transaction_amount);
      const currency = String(payment.currency_id || "").toUpperCase();
      const externalReference = String(payment.external_reference || "");
      const parts = externalReference.split(":");

      if (
        parts.length < 3 ||
        parts[0] !== "meilan" ||
        !parts[1] ||
        amount !== PLAN_PRICE_CLP ||
        currency !== "CLP"
      ) {
        console.warn("Pago Mercado Pago no coincide con el plan Meilan.", {
          paymentId: payment.id,
          amount,
          currency,
          externalReference
        });
        res.status(400).send("payment_mismatch");
        return;
      }

      const uid = parts[1];
      const paymentId = String(payment.id || dataId);
      const paymentRef = db.collection("meilan_payments").doc(paymentId);
      const subscriptionRef = db.collection("meilan_subscriptions").doc(uid);

      await db.runTransaction(async tx => {
        const [paymentSnap, subscriptionSnap] = await Promise.all([
          tx.get(paymentRef),
          tx.get(subscriptionRef)
        ]);

        if (paymentSnap.exists) return;

        const nowMs = Date.now();
        const current = subscriptionSnap.exists ? subscriptionSnap.data() : null;
        const currentEnd = current?.current_period_end?.toMillis
          ? current.current_period_end.toMillis()
          : 0;

        const baseMs = Math.max(nowMs, currentEnd);
        const newEnd = Timestamp.fromMillis(baseMs + PLAN_DAYS * DAY_MS);

        const subscriptionData = {
          user_id: uid,
          plan_code: "monthly_30d",
          status: "active",
          current_period_start: Timestamp.fromMillis(baseMs),
          current_period_end: newEnd,
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
          status: payment.status,
          amount,
          currency,
          external_reference: externalReference,
          approved_at: payment.date_approved || null,
          created_at: FieldValue.serverTimestamp()
        });
      });

      res.status(200).send("ok");
    } catch (error) {
      console.error("Error procesando webhook Mercado Pago:", error?.message || error);
      res.status(500).send("internal_error");
    }
  }
);
