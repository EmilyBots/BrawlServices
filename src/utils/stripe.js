// src/utils/stripe.js
const Stripe = require('stripe');

function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY is not set.');
  return Stripe(process.env.STRIPE_SECRET_KEY);
}

// ─── Create a Stripe Checkout Session (supports Apple Pay + Google Pay) ──────
async function createCheckoutSession({ orderId, amount, description, customerEmail, returnUrl, cancelUrl }) {
  const stripe = getStripe();

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'], // Apple Pay & Google Pay show automatically on supported devices
    line_items: [{
      price_data: {
        currency: 'eur',
        product_data: {
          name: 'Brawl Services™',
          description: description.slice(0, 500),
          images: [], // add your logo URL here if you have one public
        },
        unit_amount: Math.round(parseFloat(amount) * 100), // Stripe uses cents
      },
      quantity: 1,
    }],
    metadata: { orderId },
    customer_email: customerEmail || undefined,
    success_url: `${returnUrl}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: cancelUrl,
    payment_intent_data: {
      metadata: { orderId },
      description: `Brawl Services™ Order #${orderId.slice(0, 8).toUpperCase()}`,
    },
  });

  return { sessionId: session.id, checkoutUrl: session.url };
}

// ─── Retrieve a completed session ────────────────────────────────────────────
async function getSession(sessionId) {
  const stripe = getStripe();
  return stripe.checkout.sessions.retrieve(sessionId, {
    expand: ['payment_intent'],
  });
}

// ─── Refund a payment intent ─────────────────────────────────────────────────
async function refundPayment(paymentIntentId, amount) {
  const stripe = getStripe();
  const params = { payment_intent: paymentIntentId };
  if (amount) params.amount = Math.round(parseFloat(amount) * 100);
  return stripe.refunds.create(params);
}

// ─── Verify Stripe webhook signature ─────────────────────────────────────────
function verifyWebhook(rawBody, signature) {
  const stripe = getStripe();
  return stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);
}

module.exports = { createCheckoutSession, getSession, refundPayment, verifyWebhook };
