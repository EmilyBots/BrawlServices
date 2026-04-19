// src/panels/orderFlow.js
//
// Handles the full step-by-step order placement flow triggered by the
// "Place Order" button. No slash command required.
//
// Flow:
//   1. panel_order         → service type select
//   2. oflow_service_<t>   → from-rank select
//   3. oflow_from_<t>_<f>  → to-rank select
//   4. oflow_to_<t>_<f>_<r>→ boost or carry buttons
//   5. oflow_type_<t>_<f>_<r>_<bt> → confirm summary + confirm button
//   6. oflow_confirm_<...> → create order + ticket + claim panel

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  AttachmentBuilder,
} = require('discord.js');
const { COLORS, getEmojis } = require('../utils/constants');
const { base, success, error } = require('../utils/embeds');

const logo = () => new AttachmentBuilder('assets/logo.png', { name: 'logo.png' });

// ─── RANK DEFINITIONS ────────────────────────────────────────────────────────

const RANKED_RANKS = [
  { label: 'Bronze I',      value: 'Bronze_I',      emoji: '🥉' },
  { label: 'Bronze II',     value: 'Bronze_II',     emoji: '🥉' },
  { label: 'Bronze III',    value: 'Bronze_III',    emoji: '🥉' },
  { label: 'Silver I',      value: 'Silver_I',      emoji: '🥈' },
  { label: 'Silver II',     value: 'Silver_II',     emoji: '🥈' },
  { label: 'Silver III',    value: 'Silver_III',    emoji: '🥈' },
  { label: 'Gold I',        value: 'Gold_I',        emoji: '🥇' },
  { label: 'Gold II',       value: 'Gold_II',       emoji: '🥇' },
  { label: 'Gold III',      value: 'Gold_III',      emoji: '🥇' },
  { label: 'Diamond I',     value: 'Diamond_I',     emoji: '💎' },
  { label: 'Diamond II',    value: 'Diamond_II',    emoji: '💎' },
  { label: 'Diamond III',   value: 'Diamond_III',   emoji: '💎' },
  { label: 'Mythic I',      value: 'Mythic_I',      emoji: '🔮' },
  { label: 'Mythic II',     value: 'Mythic_II',     emoji: '🔮' },
  { label: 'Mythic III',    value: 'Mythic_III',    emoji: '🔮' },
  { label: 'Legendary I',   value: 'Legendary_I',   emoji: '👑' },
  { label: 'Legendary II',  value: 'Legendary_II',  emoji: '👑' },
  { label: 'Legendary III', value: 'Legendary_III', emoji: '👑' },
  { label: 'Masters I',     value: 'Masters_I',     emoji: '🏆' },
  { label: 'Masters II',    value: 'Masters_II',    emoji: '🏆' },
  { label: 'Masters III',   value: 'Masters_III',   emoji: '🏆' },
  { label: 'Pro',           value: 'Pro',           emoji: '⭐' },
];

const PRESTIGE_RANKS = [
  { label: 'Prestige 1', value: 'Prestige_1', emoji: '🏅' },
  { label: 'Prestige 2', value: 'Prestige_2', emoji: '🎖️' },
  { label: 'Prestige 3', value: 'Prestige_3', emoji: '🎗️' },
];

const WINSTREAK_OPTIONS = [
  { label: '50 Wins',  value: '50',  emoji: '🔥' },
  { label: '100 Wins', value: '100', emoji: '🔥' },
  { label: '150 Wins', value: '150', emoji: '🔥' },
  { label: '200 Wins', value: '200', emoji: '🔥' },
];

// ─── PRICING ─────────────────────────────────────────────────────────────────

// Returns price in € for a given service, from→to, boost type
// Returns null if the route is invalid
function getPrice(serviceType, fromVal, toVal, boostType) {
  const multiplier = boostType === 'carry' ? 2 : 1;

  if (serviceType === 'ranked') {
    const TIER_PRICES = {
      Bronze:    3,
      Silver:    6,
      Gold:      8,
      Diamond:   15,
      Mythic:    18,
      Legendary: 35,
      Masters:   210,
    };
    // Masters → Pro is boost only
    if (fromVal.startsWith('Masters') && toVal === 'Pro') {
      return boostType === 'carry' ? null : 210;
    }
    const fromTier = fromVal.split('_')[0];
    const toTier   = toVal.split('_')[0];
    const price    = TIER_PRICES[fromTier];
    if (!price || fromTier === toTier) return null;
    return price * multiplier;
  }

  if (serviceType === 'prestige') {
    const PRESTIGE_PRICES = { Prestige_1: 8, Prestige_2: 20, Prestige_3: 70 };
    const price = PRESTIGE_PRICES[toVal];
    if (!price) return null;
    return price * multiplier;
  }

  if (serviceType === 'winstreak') {
    const WS_PRICES = { '50': 20, '100': 33, '150': 50, '200': 90 };
    const price = WS_PRICES[toVal];
    if (!price) return null;
    return price * multiplier;
  }

  return null;
}

// ─── STEP 1: Service type select ─────────────────────────────────────────────
function orderFlowServicePanel() {
  const em = getEmojis();
  const embed = base(COLORS.PRIMARY)
    .setTitle(`📦 Place an Order`)
    .setDescription(
      `> Select the **type of service** you'd like.\n\n` +
      `⚔️ **Ranked Boost** — Climb the ranked ladder\n` +
      `🏆 **Prestige Boost** — Reach Prestige 1, 2 or 3\n` +
      `🔥 **Win Streak Farm** — Farm wins fast\n\n` +
      `*Choose below to get started!* ${em.CROWN}`
    )
    .setThumbnail('attachment://logo.png');

  const select = new StringSelectMenuBuilder()
    .setCustomId('oflow_service')
    .setPlaceholder('📦 Select service type...')
    .addOptions([
      { label: 'Ranked Boost',     description: 'Bronze all the way to Pro',    value: 'ranked',     emoji: '⚔️' },
      { label: 'Prestige Boost',   description: 'Prestige 1, 2 or 3',           value: 'prestige',   emoji: '🏆' },
      { label: 'Win Streak Farm',  description: '50 / 100 / 150 / 200 wins',    value: 'winstreak',  emoji: '🔥' },
    ]);

  return {
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(select)],
    files: [logo()],
    ephemeral: true,
  };
}

// ─── STEP 2: From rank select ────────────────────────────────────────────────
function orderFlowFromPanel(serviceType) {
  const em = getEmojis();

  let options, title, desc;

  if (serviceType === 'ranked') {
    // Exclude Pro (can't start from Pro)
    options = RANKED_RANKS.filter(r => r.value !== 'Pro').map(r => ({
      label: r.label, value: r.value, emoji: r.emoji,
    }));
    title = '⚔️ Ranked Boost — Starting Rank';
    desc  = `> What is your **current rank**?`;
  } else if (serviceType === 'prestige') {
    // Prestige: "from" is just for context — we show current prestige (0 = none)
    options = [
      { label: 'None (not prestige yet)', value: 'None',       emoji: '🎮' },
      { label: 'Prestige 1',              value: 'Prestige_1', emoji: '🏅' },
      { label: 'Prestige 2',              value: 'Prestige_2', emoji: '🎖️' },
    ];
    title = '🏆 Prestige Boost — Current Prestige';
    desc  = `> What is your **current prestige**?`;
  } else {
    // Win streak: no "from" concept — skip straight to amount
    // We re-use this step to pick how many wins
    options = WINSTREAK_OPTIONS.map(o => ({ label: o.label, value: o.value, emoji: o.emoji }));
    title = '🔥 Win Streak Farm — Amount';
    desc  = `> How many wins do you want farmed?`;
  }

  const embed = base(COLORS.PRIMARY)
    .setTitle(title)
    .setDescription(desc)
    .setThumbnail('attachment://logo.png');

  // Discord select menu max 25 options — ranked has 21 so we're fine
  const select = new StringSelectMenuBuilder()
    .setCustomId(`oflow_from_${serviceType}`)
    .setPlaceholder('Select...')
    .addOptions(options);

  return {
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(select)],
    files: [logo()],
    ephemeral: true,
  };
}

// ─── STEP 3: To rank select ──────────────────────────────────────────────────
function orderFlowToPanel(serviceType, fromVal) {
  const embed = base(COLORS.PRIMARY).setThumbnail('attachment://logo.png');
  let options;

  if (serviceType === 'ranked') {
    // Only show ranks higher than the selected from rank
    const fromIdx = RANKED_RANKS.findIndex(r => r.value === fromVal);
    const higher  = RANKED_RANKS.slice(fromIdx + 1);
    if (higher.length === 0) {
      // Already at Pro — shouldn't happen but guard anyway
      return null;
    }
    options = higher.map(r => ({ label: r.label, value: r.value, emoji: r.emoji }));
    embed
      .setTitle('⚔️ Ranked Boost — Target Rank')
      .setDescription(`> You're at **${fromVal.replace('_', ' ')}**. Where do you want to go?`);

  } else if (serviceType === 'prestige') {
    // Only show prestiges higher than current
    const fromIdx  = ['None', 'Prestige_1', 'Prestige_2'].indexOf(fromVal);
    const higher   = PRESTIGE_RANKS.slice(fromIdx);
    options = higher.map(r => ({ label: r.label, value: r.value, emoji: r.emoji }));
    embed
      .setTitle('🏆 Prestige Boost — Target Prestige')
      .setDescription(`> Which prestige do you want to reach?`);

  } else {
    // Win streak — fromVal IS the amount; skip to boost type directly
    return null; // signal to jump straight to boost type step
  }

  const select = new StringSelectMenuBuilder()
    .setCustomId(`oflow_to_${serviceType}_${fromVal}`)
    .setPlaceholder('Select target...')
    .addOptions(options);

  return {
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(select)],
    files: [logo()],
    ephemeral: true,
  };
}

// ─── STEP 4: Boost or Carry ──────────────────────────────────────────────────
function orderFlowTypePanel(serviceType, fromVal, toVal) {
  const em = getEmojis();

  // Masters→Pro is boost only
  const boostOnly = serviceType === 'ranked' && fromVal.startsWith('Masters') && toVal === 'Pro';

  const boostPrice = getPrice(serviceType, fromVal, toVal, 'boost');
  const carryPrice = getPrice(serviceType, fromVal, toVal, 'carry');

  const fromLabel = fromVal.replace(/_/g, ' ');
  const toLabel   = toVal.replace(/_/g, ' ');

  let routeText;
  if (serviceType === 'winstreak') {
    routeText = `**${toVal} Wins farmed**`;
  } else if (serviceType === 'prestige') {
    routeText = `**${fromLabel === 'None' ? 'No prestige' : fromLabel} → ${toLabel}**`;
  } else {
    routeText = `**${fromLabel} → ${toLabel}**`;
  }

  const embed = base(COLORS.PRIMARY)
    .setTitle('⚡ Boost or Carry?')
    .setDescription(
      `> Almost done! Choose your service type.\n\n` +
      `📍 **Route:** ${routeText}\n\n` +
      `⚡ **Boost** — We play *on your account*\n` +
      `${boostPrice != null ? `> Price: **€${boostPrice.toFixed(2)}**` : ``}\n\n` +
      (!boostOnly
        ? `🤝 **Carry** — We play *together with you* (2× price)\n` +
          `${carryPrice != null ? `> Price: **€${carryPrice.toFixed(2)}**` : ``}`
        : `> ⚠️ *Carry is not available for Masters → Pro*`
      )
    )
    .setThumbnail('attachment://logo.png');

  const id = `${serviceType}_${fromVal}_${toVal}`;

  const buttons = [
    new ButtonBuilder()
      .setCustomId(`oflow_type_${id}_boost`)
      .setLabel(`Boost — €${boostPrice?.toFixed(2) ?? '?'}`)
      .setEmoji('⚡')
      .setStyle(ButtonStyle.Primary),
  ];

  if (!boostOnly && carryPrice != null) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(`oflow_type_${id}_carry`)
        .setLabel(`Carry — €${carryPrice?.toFixed(2) ?? '?'}`)
        .setEmoji('🤝')
        .setStyle(ButtonStyle.Secondary),
    );
  }

  return {
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(...buttons)],
    files: [logo()],
    ephemeral: true,
  };
}

// ─── STEP 5: Confirm summary ──────────────────────────────────────────────────
function orderFlowConfirmPanel(serviceType, fromVal, toVal, boostType) {
  const em = getEmojis();
  const price = getPrice(serviceType, fromVal, toVal, boostType);

  const fromLabel = fromVal.replace(/_/g, ' ');
  const toLabel   = toVal.replace(/_/g, ' ');
  const typeLabel = boostType === 'carry' ? '🤝 Carry' : '⚡ Boost';

  let serviceLabel, routeText;
  if (serviceType === 'ranked') {
    serviceLabel = 'Ranked Boost';
    routeText    = `${fromLabel} → ${toLabel}`;
  } else if (serviceType === 'prestige') {
    serviceLabel = 'Prestige Boost';
    routeText    = `${fromLabel === 'None' ? 'No prestige' : fromLabel} → ${toLabel}`;
  } else {
    serviceLabel = 'Win Streak Farm';
    routeText    = `${toVal} Wins`;
  }

  const embed = base(COLORS.SUCCESS)
    .setTitle(`${em.ORDER || '📦'} Order Summary`)
    .setDescription(
      `> Please confirm your order details below.\n\n` +
      `**Service:** ${serviceLabel}\n` +
      `**Route:** ${routeText}\n` +
      `**Type:** ${typeLabel}\n` +
      `**Price:** **€${price?.toFixed(2) ?? '?'}**\n\n` +
      `*By confirming, a ticket will be opened and payment instructions sent.*`
    )
    .setThumbnail('attachment://logo.png')
    .setFooter({ text: 'Brawl Services™ • Secure & Fast' });

  const id = `${serviceType}_${fromVal}_${toVal}_${boostType}`;

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`oflow_confirm_${id}`)
      .setLabel('Confirm Order')
      .setEmoji('✅')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('panel_order')
      .setLabel('Start Over')
      .setEmoji('🔄')
      .setStyle(ButtonStyle.Danger),
  );

  return {
    embeds: [embed],
    components: [row],
    files: [logo()],
    ephemeral: true,
  };
}

module.exports = {
  orderFlowServicePanel,
  orderFlowFromPanel,
  orderFlowToPanel,
  orderFlowTypePanel,
  orderFlowConfirmPanel,
  getPrice,
};
