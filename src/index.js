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

// ─── Express health check (Railway requirement) ─────────────────────────────
const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

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
