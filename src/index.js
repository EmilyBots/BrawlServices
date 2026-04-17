// src/index.js
require('dotenv').config();

const {
  Client, GatewayIntentBits, Partials, Collection,
} = require('discord.js');
const fs   = require('fs');
const path = require('path');
const express = require('express');

// ─── Validate critical env vars ────────────────────────────────────────────
const required = ['DISCORD_TOKEN', 'CLIENT_ID', 'DATABASE_URL'];
for (const key of required) {
  if (!process.env[key]) {
    console.error(`❌  Missing required env var: ${key}`);
    process.exit(1);
  }
}

// ─── Discord client ─────────────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel, Partials.Message],
});

client.commands = new Collection();

// ─── Load commands ──────────────────────────────────────────────────────────
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));
  if (command.data && command.execute) {
    client.commands.set(command.data.name, command);
    console.log(`  📦  Loaded command: ${command.data.name}`);
  }
}

// ─── Load events ────────────────────────────────────────────────────────────
const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter(f => f.endsWith('.js'));

for (const file of eventFiles) {
  const event = require(path.join(eventsPath, file));
  if (event.once) {
    client.once(event.name, (...args) => event.execute(...args, client));
  } else {
    client.on(event.name, (...args) => event.execute(...args, client));
  }
  console.log(`  🔔  Loaded event: ${event.name}`);
}

// ─── Express server ──────────────────────────────────────────────────────────
const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'web')));

app.get('/', (req, res) => {
  res.json({
    status: 'online',
    bot: client.user?.tag || 'starting...',
    uptime: Math.floor(process.uptime()),
    guilds: client.guilds?.cache.size || 0,
    timestamp: new Date().toISOString(),
  });
});

app.get('/health', (req, res) => res.json({ healthy: true }));

app.get('/stats', async (req, res) => {
  try {
    const db = require('./database');
    const [orders, vouches] = await Promise.all([
      db.query(`SELECT COUNT(*) as total, COUNT(*) FILTER(WHERE status='completed') as done FROM orders`),
      db.query(`SELECT COUNT(*) as total, AVG(rating) as avg FROM vouches`),
    ]);
    res.json({
      orders: orders.rows[0],
      vouches: { total: vouches.rows[0].total, avgRating: parseFloat(vouches.rows[0].avg || 0).toFixed(2) },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── PayPal return URL – buyer approved payment ───────────────────────────────
app.get('/payment/success', async (req, res) => {
  // PayPal appends ?token=PAYPAL_ORDER_ID to the return URL
  // We also stored our internal orderId as the `token` query param when creating the order
  const paypalOrderId = req.query.token; // PayPal puts its order ID here as ?token=
  const internalOrderId = req.query.paypal_order_id === 'PAYPAL_ORDER_ID'
    ? null
    : req.query.paypal_order_id; // fallback if we stored it differently

  if (!paypalOrderId) {
    return res.sendFile(path.join(__dirname, 'web', 'cancel.html'));
  }

  try {
    const db = require('./database');
    const paypal = require('./utils/paypal');

    // Find order by PayPal order ID stored in payment_id
    const { rows } = await db.query(
      `SELECT * FROM orders WHERE payment_id=$1`,
      [paypalOrderId]
    );

    if (!rows.length) {
      console.error('[PayPal success] Order not found for paypal_order_id:', paypalOrderId);
      return res.sendFile(path.join(__dirname, 'web', 'cancel.html'));
    }

    const order = rows[0];

    // Capture the payment
    const capture = await paypal.captureOrder(paypalOrderId);

    if (capture.status !== 'COMPLETED') {
      console.error('[PayPal capture] Status not COMPLETED:', capture.status);
      return res.sendFile(path.join(__dirname, 'web', 'cancel.html'));
    }

    // Mark order as paid
    await db.query(
      `UPDATE orders SET payment_status='paid', status='paid', updated_at=NOW() WHERE id=$1`,
      [order.id]
    );

    // Update payment record
    await db.query(
      `UPDATE payments SET status='completed', external_id=$1, metadata=$2, completed_at=NOW()
       WHERE order_id=$3 AND method='paypal'`,
      [capture.captureId, JSON.stringify(capture), order.id]
    );

    const shortId = order.id.slice(0, 8).toUpperCase();
    console.log(`✅ PayPal payment captured: ${shortId} — €${capture.amount}`);

    // ── Notify in Discord ──────────────────────────────────────────────────
    try {
      // DM customer
      const user = await client.users.fetch(order.user_id);
      const { EmbedBuilder } = require('discord.js');
      const embed = new EmbedBuilder()
        .setColor(0x57F287)
        .setTitle('✅ Payment Confirmed!')
        .setDescription(
          `Your PayPal payment of **€${capture.amount}** for order \`#${shortId}\` has been confirmed!\n\n` +
          `⚡ A booster will be assigned shortly.\n` +
          `📣 Please leave a vouch after your order is complete!`
        )
        .setTimestamp();
      await user.send({ embeds: [embed] });

      // Log to payment channel
      if (process.env.PAYMENT_LOG_CHANNEL_ID) {
        const guild = client.guilds.cache.get(process.env.GUILD_ID);
        const logCh = guild?.channels.cache.get(process.env.PAYMENT_LOG_CHANNEL_ID);
        if (logCh) {
          const logEmbed = new EmbedBuilder()
            .setColor(0x57F287)
            .setTitle('💳 PayPal Payment Captured')
            .setDescription(
              `**Order:** \`#${shortId}\`\n` +
              `**Customer:** <@${order.user_id}>\n` +
              `**Amount:** €${capture.amount}\n` +
              `**PayPal Capture ID:** \`${capture.captureId}\`\n` +
              `**Payer Email:** ${capture.payerEmail || 'N/A'}`
            )
            .setTimestamp();
          await logCh.send({ embeds: [logEmbed] });
        }
      }

      // Post claimable order to order log
      if (process.env.ORDER_LOG_CHANNEL_ID) {
        const guild = client.guilds.cache.get(process.env.GUILD_ID);
        const logCh = guild?.channels.cache.get(process.env.ORDER_LOG_CHANNEL_ID);
        if (logCh) {
          const { claimOrderPanel } = require('./panels');
          const updated = await db.query(`SELECT * FROM orders WHERE id=$1`, [order.id]);
          if (updated.rows.length) await logCh.send(claimOrderPanel(updated.rows[0]));
        }
      }

      // Notify ticket channel
      if (order.ticket_channel_id) {
        const guild = client.guilds.cache.get(process.env.GUILD_ID);
        const ticketCh = guild?.channels.cache.get(order.ticket_channel_id);
        if (ticketCh) {
          await ticketCh.send(`✅ **Payment confirmed!** Order \`#${shortId}\` is now paid. A booster will be assigned shortly.`);
        }
      }
    } catch (notifyErr) {
      console.error('[PayPal success notify]', notifyErr.message);
    }

    // Serve success page
    res.redirect(`/success.html?order=${shortId}`);

  } catch (err) {
    console.error('[PayPal capture error]', err?.response?.data || err.message);
    res.sendFile(path.join(__dirname, 'web', 'cancel.html'));
  }
});

// ─── PayPal cancel URL ────────────────────────────────────────────────────────
app.get('/payment/cancel', (req, res) => {
  res.sendFile(path.join(__dirname, 'web', 'cancel.html'));
});

// ─── Stripe success URL – after buyer completes checkout ─────────────────────
app.get('/payment/stripe/success', async (req, res) => {
  const sessionId = req.query.session_id;
  if (!sessionId) return res.sendFile(path.join(__dirname, 'web', 'cancel.html'));

  try {
    const db = require('./database');
    const stripeUtil = require('./utils/stripe');

    const session = await stripeUtil.getSession(sessionId);

    if (session.payment_status !== 'paid') {
      console.error('[Stripe success] Payment not completed:', session.payment_status);
      return res.sendFile(path.join(__dirname, 'web', 'cancel.html'));
    }

    // Find order by Stripe session ID stored in payment_id
    const { rows } = await db.query(`SELECT * FROM orders WHERE payment_id=$1`, [sessionId]);
    if (!rows.length) {
      console.error('[Stripe success] Order not found for session:', sessionId);
      return res.sendFile(path.join(__dirname, 'web', 'cancel.html'));
    }

    const order = rows[0];
    const shortId = order.id.slice(0, 8).toUpperCase();
    const paymentIntentId = session.payment_intent?.id || session.payment_intent;
    const method = order.payment_method || 'stripe';

    // Mark as paid
    await db.query(
      `UPDATE orders SET payment_status='paid', status='paid', updated_at=NOW() WHERE id=$1`,
      [order.id]
    );
    await db.query(
      `UPDATE payments SET status='completed', external_id=$1, metadata=$2, completed_at=NOW()
       WHERE order_id=$3 AND method=$4`,
      [paymentIntentId, JSON.stringify({ sessionId, paymentIntentId, amount: session.amount_total / 100 }), order.id, method]
    );

    console.log(`✅ Stripe payment captured: ${shortId} — €${session.amount_total / 100} via ${method}`);

    // ── Notify Discord ─────────────────────────────────────────────────────
    try {
      const { EmbedBuilder } = require('discord.js');
      const methodLabel = method === 'applepay' ? '🍎 Apple Pay' : method === 'googlepay' ? '🔵 Google Pay' : '💳 Card';

      // DM customer
      const user = await client.users.fetch(order.user_id);
      await user.send({ embeds: [new EmbedBuilder()
        .setColor(0x57F287)
        .setTitle('✅ Payment Confirmed!')
        .setDescription(
          `Your **${methodLabel}** payment of **€${session.amount_total / 100}** for order \`#${shortId}\` has been confirmed!\n\n` +
          `⚡ A booster will be assigned shortly.\n` +
          `📣 Please leave a vouch after your order is complete!`
        )
        .setTimestamp()
      ]});

      // Payment log
      if (process.env.PAYMENT_LOG_CHANNEL_ID) {
        const guild = client.guilds.cache.get(process.env.GUILD_ID);
        const logCh = guild?.channels.cache.get(process.env.PAYMENT_LOG_CHANNEL_ID);
        if (logCh) await logCh.send({ embeds: [new EmbedBuilder()
          .setColor(0x57F287)
          .setTitle(`💳 ${methodLabel} Payment Captured`)
          .setDescription(
            `**Order:** \`#${shortId}\`\n` +
            `**Customer:** <@${order.user_id}>\n` +
            `**Amount:** €${session.amount_total / 100}\n` +
            `**Method:** ${methodLabel}\n` +
            `**Stripe PI:** \`${paymentIntentId || 'N/A'}\``
          )
          .setTimestamp()
        ]});
      }

      // Post claimable order
      if (process.env.ORDER_LOG_CHANNEL_ID) {
        const guild = client.guilds.cache.get(process.env.GUILD_ID);
        const logCh = guild?.channels.cache.get(process.env.ORDER_LOG_CHANNEL_ID);
        if (logCh) {
          const { claimOrderPanel } = require('./panels');
          const updated = await db.query(`SELECT * FROM orders WHERE id=$1`, [order.id]);
          if (updated.rows.length) await logCh.send(claimOrderPanel(updated.rows[0]));
        }
      }

      // Notify ticket
      if (order.ticket_channel_id) {
        const guild = client.guilds.cache.get(process.env.GUILD_ID);
        const ch = guild?.channels.cache.get(order.ticket_channel_id);
        if (ch) await ch.send(`✅ **${methodLabel} payment confirmed!** Order \`#${shortId}\` is now paid. A booster will be assigned shortly.`);
      }
    } catch (notifyErr) {
      console.error('[Stripe notify]', notifyErr.message);
    }

    res.redirect(`/success.html?order=${shortId}&method=stripe`);

  } catch (err) {
    console.error('[Stripe success error]', err.message);
    res.sendFile(path.join(__dirname, 'web', 'cancel.html'));
  }
});

app.listen(PORT, () => {
  console.log(`\n🌐  Web server running on port ${PORT}`);
});

// ─── Login ──────────────────────────────────────────────────────────────────
client.login(process.env.DISCORD_TOKEN).then(() => {
  console.log('🔐  Logged in to Discord');
}).catch(err => {
  console.error('❌  Failed to login:', err);
  process.exit(1);
});

// ─── Graceful shutdown ───────────────────────────────────────────────────────
process.on('SIGINT',  () => { client.destroy(); process.exit(0); });
process.on('SIGTERM', () => { client.destroy(); process.exit(0); });
process.on('unhandledRejection', (err) => console.error('Unhandled promise rejection:', err));
