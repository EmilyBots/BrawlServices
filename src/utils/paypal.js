// src/utils/paypal.js
const axios = require('axios');

const BASE = process.env.PAYPAL_MODE === 'live'
  ? 'https://api-m.paypal.com'
  : 'https://api-m.sandbox.paypal.com';

let _token = null;
let _tokenExpiry = 0;

// ─── Get OAuth2 access token (cached) ──────────────────────────────────────
async function getAccessToken() {
  if (_token && Date.now() < _tokenExpiry) return _token;

  const res = await axios.post(
    `${BASE}/v1/oauth2/token`,
    'grant_type=client_credentials',
    {
      auth: {
        username: process.env.PAYPAL_CLIENT_ID,
        password: process.env.PAYPAL_CLIENT_SECRET,
      },
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    }
  );

  _token = res.data.access_token;
  _tokenExpiry = Date.now() + (res.data.expires_in - 60) * 1000;
  return _token;
}

function authHeader() {
  return getAccessToken().then(t => ({ Authorization: `Bearer ${t}` }));
}

// ─── Create a PayPal order → returns { id, approveUrl } ────────────────────
async function createOrder({ orderId, amount, description, returnUrl, cancelUrl }) {
  const headers = await authHeader();

  const res = await axios.post(
    `${BASE}/v2/checkout/orders`,
    {
      intent: 'CAPTURE',
      purchase_units: [{
        reference_id: orderId,
        description: description.slice(0, 127),
        amount: {
          currency_code: 'EUR',
          value: parseFloat(amount).toFixed(2),
        },
      }],
      application_context: {
        brand_name: 'Brawl Services™',
        landing_page: 'NO_PREFERENCE',
        user_action: 'PAY_NOW',
        return_url: returnUrl,
        cancel_url: cancelUrl,
      },
    },
    { headers }
  );

  const approveLink = res.data.links.find(l => l.rel === 'approve');
  return {
    paypalOrderId: res.data.id,
    approveUrl: approveLink.href,
  };
}

// ─── Capture a PayPal order (after buyer approval) ──────────────────────────
async function captureOrder(paypalOrderId) {
  const headers = await authHeader();

  const res = await axios.post(
    `${BASE}/v2/checkout/orders/${paypalOrderId}/capture`,
    {},
    { headers }
  );

  const capture = res.data.purchase_units?.[0]?.payments?.captures?.[0];
  return {
    status: res.data.status,           // 'COMPLETED'
    captureId: capture?.id,
    amount: capture?.amount?.value,
    currency: capture?.amount?.currency_code,
    payerEmail: res.data.payer?.email_address,
    payerId: res.data.payer?.payer_id,
  };
}

// ─── Get order details ────────────────────────────────────────────────────────
async function getOrder(paypalOrderId) {
  const headers = await authHeader();
  const res = await axios.get(`${BASE}/v2/checkout/orders/${paypalOrderId}`, { headers });
  return res.data;
}

// ─── Refund a capture ─────────────────────────────────────────────────────────
async function refundCapture(captureId, amount, currency = 'EUR') {
  const headers = await authHeader();
  const body = amount ? { amount: { value: parseFloat(amount).toFixed(2), currency_code: currency } } : {};
  const res = await axios.post(`${BASE}/v2/payments/captures/${captureId}/refund`, body, { headers });
  return res.data;
}

module.exports = { createOrder, captureOrder, getOrder, refundCapture };
