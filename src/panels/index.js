// src/panels/index.js
const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, AttachmentBuilder,
} = require('discord.js');
const { COLORS, getEmojis, PRICING, RANK_EMOJIS } = require('../utils/constants');
const { base } = require('../utils/embeds');

const logo = () => new AttachmentBuilder('assets/logo.png', { name: 'logo.png' });

// ─── MAIN MENU PANEL ───────────────────────────────────────────────────────
function mainMenuPanel() {
  const em = getEmojis();
  const embed = base(COLORS.PRIMARY)
    .setTitle('# 🏆 Brawl Services™')
    .setDescription(
      `> **Welcome to the #1 Brawl Stars Boosting Service!**\n\n` +
      `We offer **fast**, **reliable** and **safe** services for all ranks.\n\n` +
      `${em.SWORD} **Ranked Boost** – We play on your account\n` +
      `${em.CARRY} **Carry** – We play *together* with you\n` +
      `${em.TROPHY} **Prestige Boost** – Unlock Prestige ranks\n` +
      `${em.FIRE} **Win Streak Farm** – Dominate the leaderboard\n` +
      `${em.COACHING} **Coaching** – Improve your skills\n` +
      `${em.ACCOUNT} **Buy Account** – Ready-to-play accounts\n\n` +
      `**Select a service below to get started!** ${em.CROWN}`
    )
    .setThumbnail('attachment://logo.png');

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('panel_order').setLabel('Place Order').setEmoji('📦').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('panel_prices').setLabel('Prices').setEmoji('💰').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('panel_ticket').setLabel('Open Ticket').setEmoji('🎫').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('panel_vouches').setLabel('Vouches').setEmoji('📣').setStyle(ButtonStyle.Secondary),
  );

  return { embeds: [embed], components: [row], files: [logo()] };
}

// ─── PRICES PANEL ──────────────────────────────────────────────────────────
function pricesPanel() {
  const em = getEmojis();
  const embed = base(COLORS.PRIMARY)
    .setTitle('# 💰 PRICES – Brawl Services™')
    .setDescription(
      `## ⚔️ Ranked Boosts\n` +
      `### 🕹️ Boost *(we play on your account)*\n` +
      `${em.BRONZE1}${em.BRONZE2}${em.BRONZE3} **Bronze → Silver** — \`3€\`\n` +
      `${em.SILVER1}${em.SILVER2}${em.SILVER3} **Silver → Gold** — \`6€\`\n` +
      `${em.GOLD1}${em.GOLD2}${em.GOLD3} **Gold → Diamond** — \`8€\`\n` +
      `${em.DIAMOND1}${em.DIAMOND2}${em.DIAMOND3} **Diamond → Mythic** — \`15€\`\n` +
      `${em.MYTHIC1}${em.MYTHIC2}${em.MYTHIC3} **Mythic → Legendary** — \`18€\`\n` +
      `${em.LEGENDARY1}${em.LEGENDARY2}${em.LEGENDARY3} **Legendary → Masters** — \`35€\`\n` +
      `${em.MASTERS1}${em.MASTERS2}${em.MASTERS3} **Masters → Pro** — \`210€\`\n\n` +
      `### 🤝 Carry *(we play together – 2× price)*\n` +
      `${em.BRONZE1} **Bronze → Silver** — \`6€\`\n` +
      `${em.SILVER1} **Silver → Gold** — \`12€\`\n` +
      `${em.GOLD1} **Gold → Diamond** — \`16€\`\n` +
      `${em.DIAMOND1} **Diamond → Mythic** — \`30€\`\n` +
      `${em.MYTHIC1} **Mythic → Legendary** — \`36€\`\n` +
      `${em.LEGENDARY1} **Legendary → Masters** — \`70€\`\n` +
      `${em.MASTERS1} **Masters → Pro** — \`210€\`\n` +
      `> *Only boost available after Masters*\n\n` +
      `## 🏆 Prestige Boosts\n` +
      `### 🕹️ Boost\n` +
      `${em.PRESTIGE1} **Prestige 1** — \`8€\`\n` +
      `${em.PRESTIGE2} **Prestige 2** — \`20€\`\n` +
      `${em.PRESTIGE3} **Prestige 3** — \`70€\`\n\n` +
      `### 🤝 Carry *(2× Boost)*\n` +
      `${em.PRESTIGE1} **Prestige 1** — \`16€\`\n` +
      `${em.PRESTIGE2} **Prestige 2** — \`40€\`\n` +
      `${em.PRESTIGE3} **Prestige 3** — \`140€\`\n\n` +
      `## 🔥 Win Streak Farm\n` +
      `### 🕹️ Boost\n` +
      `🔥 **50 Wins** — \`20€\` | **100 Wins** — \`33€\` | **150 Wins** — \`50€\` | **200 Wins** — \`90€\`\n\n` +
      `### 🤝 Carry *(2× Boost)*\n` +
      `🔥 **50 Wins** — \`40€\` | **100 Wins** — \`66€\` | **150 Wins** — \`100€\` | **200 Wins** — \`180€\``
    )
    .setThumbnail('attachment://logo.png');

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('panel_order').setLabel('Order Now').setEmoji('📦').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('panel_main').setLabel('Back').setEmoji('◀️').setStyle(ButtonStyle.Secondary),
  );

  return { embeds: [embed], components: [row], files: [logo()] };
}

// ─── ORDER PANEL ───────────────────────────────────────────────────────────
function orderPanel() {
  const em = getEmojis();
  const embed = base(COLORS.PRIMARY)
    .setTitle(`${em.ORDER} Place an Order`)
    .setDescription(
      `> Choose the type of service you'd like to order.\n\n` +
      `${em.SWORD} **Ranked Boost** — Climb the ranked ladder\n` +
      `${em.TROPHY} **Prestige Boost** — Get Prestige 1/2/3\n` +
      `${em.FIRE} **Win Streak Farm** — Farm wins fast\n` +
      `${em.COACHING} **Coaching** — Learn from a Pro player\n` +
      `${em.ACCOUNT} **Buy Account** — Pre-leveled accounts\n\n` +
      `*Select a service from the menu below* ${em.CROWN}`
    )
    .setThumbnail('attachment://logo.png');

  const select = new StringSelectMenuBuilder()
    .setCustomId('order_service_select')
    .setPlaceholder('📦 Select a service...')
    .addOptions([
      { label: 'Ranked Boost', description: 'We play on your account', value: 'ranked_boost', emoji: '⚔️' },
      { label: 'Ranked Carry', description: 'We play together with you', value: 'ranked_carry', emoji: '🤝' },
      { label: 'Prestige Boost', description: 'Reach Prestige 1, 2 or 3', value: 'prestige_boost', emoji: '🏆' },
      { label: 'Prestige Carry', description: 'Prestige carry (2× price)', value: 'prestige_carry', emoji: '👑' },
      { label: 'Win Streak Boost', description: '50/100/150/200 wins farmed', value: 'winstreak_boost', emoji: '🔥' },
      { label: 'Win Streak Carry', description: 'Win streak carry (2× price)', value: 'winstreak_carry', emoji: '🎯' },
      { label: 'Coaching Session', description: 'Get coached by a Pro', value: 'coaching', emoji: '🎓' },
      { label: 'Buy Account', description: 'Browse available accounts', value: 'buy_account', emoji: '🎮' },
    ]);

  const row1 = new ActionRowBuilder().addComponents(select);
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('panel_prices').setLabel('View Prices').setEmoji('💰').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('panel_main').setLabel('Back').setEmoji('◀️').setStyle(ButtonStyle.Secondary),
  );

  return { embeds: [embed], components: [row1, row2], files: [logo()] };
}

// ─── PAYMENT PANEL ─────────────────────────────────────────────────────────
function paymentPanel(orderId, amount, description) {
  const em = getEmojis();
  const embed = base(COLORS.PRIMARY)
    .setTitle(`${em.PAYMENT} Payment`)
    .setDescription(
      `> Complete your payment to start your order!\n\n` +
      `**Order:** \`#${orderId.slice(0,8).toUpperCase()}\`\n` +
      `**Service:** ${description}\n` +
      `**Amount:** **€${Number(amount).toFixed(2)}**\n\n` +
      `## 💳 Choose Payment Method\n\n` +
      `${em.APPLEPAY} **Apple Pay** — Instant, secure\n` +
      `${em.GOOGLEPAY} **Google Pay** — Instant, secure\n` +
      `${em.PAYPAL} **PayPal** — Trusted & protected\n\n` +
      `> ⚠️ *Payment is 100% secure. We never store card details.*`
    )
    .setThumbnail('attachment://logo.png');

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`pay_applepay_${orderId}`)
      .setLabel('Apple Pay')
      .setEmoji('🍎')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`pay_googlepay_${orderId}`)
      .setLabel('Google Pay')
      .setEmoji('🔵')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`pay_paypal_${orderId}`)
      .setLabel('PayPal')
      .setEmoji(em.PAYPAL.startsWith('<') ? { id: em.PAYPAL.match(/\d+/)?.[0] } : '💲')
      .setStyle(ButtonStyle.Secondary),
  );

  return { embeds: [embed], components: [row], files: [logo()] };
}

// ─── TICKET PANEL ──────────────────────────────────────────────────────────
function ticketPanel() {
  const em = getEmojis();
  const embed = base(COLORS.PRIMARY)
    .setTitle(`${em.TICKET} Support & Tickets`)
    .setDescription(
      `> Need help? Open a ticket and our team will assist you!\n\n` +
      `**📦 Order Support** — Question about your current order\n` +
      `**💳 Payment Issue** — Payment problem or question\n` +
      `**🎓 Coaching** — Book a coaching session\n` +
      `**🎮 Buy Account** — Enquire about accounts\n` +
      `**🛡️ Report** — Report a player or staff\n` +
      `**❓ General** — Any other question\n\n` +
      `*Select the appropriate category below* ${em.CROWN}`
    )
    .setThumbnail('attachment://logo.png');

  const select = new StringSelectMenuBuilder()
    .setCustomId('ticket_category_select')
    .setPlaceholder('🎫 Choose ticket category...')
    .addOptions([
      { label: 'Order Support',   description: 'Help with an existing order',   value: 'order',    emoji: '📦' },
      { label: 'Payment Issue',   description: 'Payment problem',               value: 'payment',  emoji: '💳' },
      { label: 'Coaching',        description: 'Book a coaching session',        value: 'coaching', emoji: '🎓' },
      { label: 'Buy Account',     description: 'Account purchase enquiry',       value: 'account',  emoji: '🎮' },
      { label: 'Report',          description: 'Report a player or staff',       value: 'report',   emoji: '🛡️' },
      { label: 'General Support', description: 'General question or support',    value: 'general',  emoji: '❓' },
    ]);

  const row = new ActionRowBuilder().addComponents(select);
  return { embeds: [embed], components: [row], files: [logo()] };
}

// ─── VOUCH PANEL ───────────────────────────────────────────────────────────
function vouchPanel() {
  const em = getEmojis();
  const embed = base(COLORS.PRIMARY)
    .setTitle(`${em.VOUCH} Leave a Vouch`)
    .setDescription(
      `> Share your experience with **Brawl Services™**!\n\n` +
      `Your vouch helps other players trust our service.\n\n` +
      `${em.STAR}${em.STAR}${em.STAR}${em.STAR}${em.STAR} *Rate us after your order is complete*\n\n` +
      `Click the button below to submit your vouch.`
    )
    .setThumbnail('attachment://logo.png');

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('vouch_submit')
      .setLabel('Leave Vouch')
      .setEmoji('📣')
      .setStyle(ButtonStyle.Primary),
  );

  return { embeds: [embed], components: [row], files: [logo()] };
}

// ─── CLAIM ORDER PANEL (STAFF) ─────────────────────────────────────────────
function claimOrderPanel(order) {
  const em = getEmojis();
  const price = parseFloat(order.price);

  // Determine boost vs carry from service_type or boost_type
  const isCarry = order.boost_type === 'carry'
    || order.service_type?.toLowerCase().includes('carry');
  const typeLabel  = isCarry ? '🤝 Carry'  : '⚡ Boost';
  const typeColor  = isCarry ? 0x5865F2    : 0xFEE75C;   // blurple vs yellow

  // Split breakdown – all booster tiers so staff can see their exact cut
  const splits = [
    { label: 'Booster',        pct: 60 },
    { label: 'Senior Booster', pct: 65 },
    { label: 'Global Booster', pct: 70 },
    { label: 'Co-Owner',       pct: 85 },
  ];

  const splitsText = splits
    .map(s => `> **${s.label}** (${s.pct}%) — **€${(price * s.pct / 100).toFixed(2)}**`)
    .join('\n');

  const embed = base(typeColor)
    .setTitle(`${isCarry ? '🤝' : '⚡'} New ${typeLabel} Order Available`)
    .setDescription(
      `> A new order is ready to be claimed!\n\n` +
      `**Order ID:** \`#${order.id.slice(0, 8).toUpperCase()}\`\n` +
      `**Customer:** <@${order.user_id}>\n` +
      `**Service:** ${order.service_type}\n` +
      `**Type:** ${typeLabel}\n` +
      `**Route:** ${order.from_rank || '—'} **→** ${order.to_rank || '—'}\n` +
      `**Order Total:** **€${price.toFixed(2)}**\n\n` +
      `💰 **Your Earnings by Role:**\n${splitsText}\n\n` +
      `*Click below to claim — first come, first served!*`
    )
    .setThumbnail('attachment://logo.png')
    .setFooter({ text: 'Brawl Services™ • Splits are final and non-negotiable' })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`claim_order_${order.id}`)
      .setLabel('Claim Order')
      .setEmoji(isCarry ? '🤝' : '⚡')
      .setStyle(ButtonStyle.Success),
  );

  return { embeds: [embed], components: [row], files: [logo()] };
}

// ─── CLAIM COACHING PANEL ──────────────────────────────────────────────────
function claimCoachingPanel(session) {
  const em = getEmojis();
  const price = parseFloat(session.price);

  // Split breakdown – coach tiers only
  const splits = [
    { label: 'Coach / Trainer', pct: 60 },
    { label: 'Trainer Expert',  pct: 65 },
    { label: 'Co-Owner',        pct: 85 },
  ];

  const splitsText = splits
    .map(s => `> **${s.label}** (${s.pct}%) — **€${(price * s.pct / 100).toFixed(2)}**`)
    .join('\n');

  const scheduledStr = session.scheduled_at
    ? new Date(session.scheduled_at).toLocaleString('en-GB', {
        weekday: 'long', day: 'numeric', month: 'long',
        year: 'numeric', hour: '2-digit', minute: '2-digit',
        timeZone: 'CET',
      }) + ' CET'
    : 'TBC';

  const embed = base(COLORS.INFO)
    .setTitle(`🎓 Coaching Session Available`)
    .setDescription(
      `> A coaching session is ready to be claimed!\n\n` +
      `**Session ID:** \`#${session.id.slice(0, 8).toUpperCase()}\`\n` +
      `**Student:** <@${session.user_id}>\n` +
      `**Type:** ${session.session_type}\n` +
      `**Duration:** ${session.duration_hours}h\n` +
      `**Scheduled:** ${scheduledStr}\n` +
      `**Order Total:** **€${price.toFixed(2)}**\n\n` +
      `💰 **Your Earnings by Role:**\n${splitsText}\n\n` +
      `*Click below to claim — first come, first served!*`
    )
    .setThumbnail('attachment://logo.png')
    .setFooter({ text: 'Brawl Services™ • Splits are final and non-negotiable' })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`claim_coaching_${session.id}`)
      .setLabel('Claim Session')
      .setEmoji('🎓')
      .setStyle(ButtonStyle.Success),
  );

  return { embeds: [embed], components: [row], files: [logo()] };
}

// ─── BUY ACCOUNT PANEL ─────────────────────────────────────────────────────
function buyAccountPanel(accounts = []) {
  const em = getEmojis();
  const embed = base(COLORS.PRIMARY)
    .setTitle(`${em.ACCOUNT} Account Shop`)
    .setDescription(
      `> Browse and purchase pre-leveled Brawl Stars accounts!\n\n` +
      (accounts.length === 0
        ? `*No accounts available right now. Check back soon!*`
        : accounts.map((a, i) =>
          `**${i+1}.** ${em.CROWN} **${a.current_rank || 'Unknown'}** | ${a.brawler_count} brawlers | ${a.max_trophies?.toLocaleString()} trophies | **€${Number(a.price).toFixed(2)}**`
        ).join('\n')
      ) + `\n\n*To purchase, open a ticket or click a button below.*`
    )
    .setThumbnail('attachment://logo.png');

  const rows = [];

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('account_browse').setLabel('Browse Accounts').setEmoji('🎮').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('account_ticket').setLabel('Enquire').setEmoji('🎫').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('panel_main').setLabel('Back').setEmoji('◀️').setStyle(ButtonStyle.Secondary),
  );
  rows.push(row1);

  return { embeds: [embed], components: rows, files: [logo()] };
}

// ─── STAFF PANEL ───────────────────────────────────────────────────────────
function staffPanel() {
  const em = getEmojis();
  const embed = base(COLORS.INFO)
    .setTitle(`${em.STAFF} Staff Control Panel`)
    .setDescription(
      `> **Staff-only tools and actions**\n\n` +
      `${em.ORDER} **Orders** — View, assign, complete orders\n` +
      `${em.TICKET} **Tickets** — Manage open tickets\n` +
      `${em.BOOST} **Boosters** — Manage booster roster\n` +
      `${em.STATS} **Statistics** — View bot stats\n` +
      `${em.BANNED} **Blacklist** — Manage banned users\n` +
      `${em.PAYMENT} **Payments** — Review payment history\n\n` +
      `*Use slash commands for advanced staff actions*`
    )
    .setThumbnail('attachment://logo.png');

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('staff_orders').setLabel('Orders').setEmoji('📦').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('staff_tickets').setLabel('Tickets').setEmoji('🎫').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('staff_stats').setLabel('Stats').setEmoji('📊').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('staff_blacklist').setLabel('Blacklist').setEmoji('🚫').setStyle(ButtonStyle.Danger),
  );

  return { embeds: [embed], components: [row], files: [logo()] };
}

module.exports = {
  mainMenuPanel, pricesPanel, orderPanel, paymentPanel,
  ticketPanel, vouchPanel, claimOrderPanel, claimCoachingPanel,
  buyAccountPanel, staffPanel,
};
