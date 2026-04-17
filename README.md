# 🏆 Brawl Services™ Discord Bot

> The ultimate Brawl Stars boosting service Discord bot — built with Node.js, Discord.js v14, and PostgreSQL on Railway.

---

## ✨ Features

- **🎫 Ticket System** — Auto ticket creation with categories, claiming, transcripts, priority levels
- **📦 Order System** — Full order lifecycle: create → pay → assign → boost → complete → vouch
- **💳 Payment Panel** — Click-button payments (Apple Pay, Google Pay, PayPal) sent via DM or channel
- **📣 Vouch System** — Submit, verify, and display vouches with leaderboard
- **🎓 Coaching Sessions** — Book, claim, schedule, and complete 1-on-1 coaching
- **🎮 Account Shop** — Browse, list, and purchase pre-leveled Brawl Stars accounts
- **⚡ Booster Tools** — Claim orders, post progress updates, track earnings
- **🛠️ Staff Panel** — Manage staff, ban/unban users, view logs, export data
- **📊 Full Statistics** — Server stats, revenue, order breakdowns, daily summaries
- **🌐 Web Health Check** — Express server for Railway hosting
- **🔒 Role Permissions** — Admin / Staff / Booster role hierarchy

---

## 📋 Commands (20 total, 10 subcommands each)

| Command     | Description                                      |
|-------------|--------------------------------------------------|
| `/order`    | Create, view, list, cancel, assign, complete orders |
| `/ticket`   | Open, close, claim, add users, transcripts       |
| `/vouch`    | Submit, verify, list, leaderboard, delete        |
| `/boost`    | Claim, update, complete, earnings, leaderboard   |
| `/coaching` | Book, claim, schedule, complete sessions         |
| `/account`  | Browse, add, sell, buy, stats                    |
| `/payment`  | Send panel, confirm, refund, history, stats      |
| `/panel`    | Send all panels (main, prices, order, ticket...) |
| `/staff`    | Add/remove staff, ban/unban, notes, lookup       |
| `/admin`    | Announce, purge, export, config, db query        |
| `/stats`    | Server, orders, revenue, vouches, daily          |
| `/prices`   | All prices, ranked, prestige, winstreak, calc    |
| `/user`     | Profile, orders, spending, badges, referral      |

---

## 💰 Pricing Built-In

### ⚔️ Ranked Boosts
| Route               | Boost | Carry |
|---------------------|-------|-------|
| Bronze → Silver     | €3    | €6    |
| Silver → Gold       | €6    | €12   |
| Gold → Diamond      | €8    | €16   |
| Diamond → Mythic    | €15   | €30   |
| Mythic → Legendary  | €18   | €36   |
| Legendary → Masters | €35   | €70   |
| Masters → Pro       | €210  | €210  |

### 🏆 Prestige Boosts
| Tier       | Boost | Carry |
|------------|-------|-------|
| Prestige 1 | €8    | €16   |
| Prestige 2 | €20   | €40   |
| Prestige 3 | €70   | €140  |

### 🔥 Win Streak Farm
| Wins | Boost | Carry |
|------|-------|-------|
| 50   | €20   | €40   |
| 100  | €33   | €66   |
| 150  | €50   | €100  |
| 200  | €90   | €180  |

---

## 🚀 Setup & Deployment

### 1. Prerequisites
- Node.js 18+
- A Discord bot application
- PostgreSQL database (Railway recommended)

### 2. Clone & Install
```bash
git clone <your-repo-url>
cd brawl-services-bot
npm install
```

### 3. Configure Environment
Copy `.env.example` to `.env` and fill in all values:
```bash
cp .env.example .env
```

**Required:**
- `DISCORD_TOKEN` — Your bot token from [Discord Developer Portal](https://discord.com/developers/applications)
- `CLIENT_ID` — Your bot's Application ID
- `DATABASE_URL` — PostgreSQL connection string (from Railway)

**Optional but recommended:**
- `GUILD_ID` — Your server ID (for instant command deployment)
- All channel/role IDs and emoji IDs

### 4. Configure Custom Emojis
In `.env`, set each emoji in the format `name:id`:
```
EMOJI_BRONZE1=bronze1:1234567890123456789
EMOJI_PAYPAL=paypal:1234567890123456789
```
Upload the rank images and other emojis to your server first, then right-click → Copy Emoji ID.

### 5. Run Database Migrations
```bash
npm run db:migrate
```

### 6. Deploy Slash Commands
```bash
npm run deploy
```

### 7. Start the Bot
```bash
npm start
# or for development:
npm run dev
```

---

## 🚂 Railway Deployment

1. Push your code to GitHub
2. Create a new Railway project → **Deploy from GitHub repo**
3. Add a **PostgreSQL** database in Railway
4. Copy the `DATABASE_URL` from Railway to your environment variables
5. Set all other environment variables in Railway dashboard
6. Run `npm run db:migrate` once (you can do this via Railway's shell or locally pointing at the Railway DB URL)
7. Run `npm run deploy` to register slash commands
8. Railway auto-deploys on push ✅

**The Express health check** at `/health` keeps Railway happy and the bot online.

---

## 🗂️ Project Structure

```
brawl-services-bot/
├── src/
│   ├── commands/          # One file per command group
│   │   ├── order.js
│   │   ├── ticket.js
│   │   ├── vouch.js
│   │   ├── boost.js
│   │   ├── coaching.js
│   │   ├── account.js
│   │   ├── payment.js
│   │   ├── panel.js
│   │   ├── staff.js
│   │   ├── admin.js
│   │   ├── stats.js
│   │   ├── prices.js
│   │   └── user.js
│   ├── events/
│   │   ├── ready.js
│   │   └── interactionCreate.js
│   ├── panels/
│   │   └── index.js       # All panel builders
│   ├── utils/
│   │   ├── constants.js   # Emojis, pricing, colors
│   │   ├── embeds.js      # Embed builders
│   │   ├── permissions.js # Role permission helpers
│   │   └── ticketManager.js
│   ├── database/
│   │   ├── index.js       # PostgreSQL pool
│   │   └── migrate.js     # Schema migrations
│   ├── index.js           # Entry point + Express server
│   └── deploy-commands.js # Command registration script
├── assets/
│   └── logo.png           # Bot logo (Brawl Services™)
├── .env.example
├── .gitignore
├── railway.json
├── package.json
├── LICENSE
└── README.md
```

---

## 🔧 Discord Bot Permissions

When inviting your bot, use this permission set:
- **Manage Channels** (for ticket creation/deletion)
- **Manage Roles** (optional, for auto-role assignment)
- **Send Messages**
- **Embed Links**
- **Attach Files**
- **Read Message History**
- **Add Reactions**
- **Use Slash Commands**
- **Manage Messages** (for ticket cleanup)

Or use Administrator for simplicity during setup.

---

## 📝 License

MIT © 2026 Brawl Services™
