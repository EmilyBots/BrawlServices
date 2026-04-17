// src/utils/constants.js

// ─── Colours ───────────────────────────────────────────────────────────────
const COLORS = {
  PRIMARY:   0xFFB800,  // Brawl gold
  SUCCESS:   0x57F287,
  ERROR:     0xED4245,
  WARNING:   0xFEE75C,
  INFO:      0x5865F2,
  DARK:      0x1A1A1A,
  PRESTIGE:  0xFF6B35,
};

// ─── Emoji helpers ─────────────────────────────────────────────────────────
function e(envKey) {
  const val = process.env[envKey];
  if (!val || val.includes('000000000000000000')) return '🎮'; // fallback
  const [name, id] = val.split(':');
  return `<:${name}:${id}>`;
}

function getEmojis() {
  return {
    // Ranks
    BRONZE1:    e('EMOJI_BRONZE1'),
    BRONZE2:    e('EMOJI_BRONZE2'),
    BRONZE3:    e('EMOJI_BRONZE3'),
    SILVER1:    e('EMOJI_SILVER1'),
    SILVER2:    e('EMOJI_SILVER2'),
    SILVER3:    e('EMOJI_SILVER3'),
    GOLD1:      e('EMOJI_GOLD1'),
    GOLD2:      e('EMOJI_GOLD2'),
    GOLD3:      e('EMOJI_GOLD3'),
    DIAMOND1:   e('EMOJI_DIAMOND1'),
    DIAMOND2:   e('EMOJI_DIAMOND2'),
    DIAMOND3:   e('EMOJI_DIAMOND3'),
    MYTHIC1:    e('EMOJI_MYTHIC1'),
    MYTHIC2:    e('EMOJI_MYTHIC2'),
    MYTHIC3:    e('EMOJI_MYTHIC3'),
    LEGENDARY1: e('EMOJI_LEGENDARY1'),
    LEGENDARY2: e('EMOJI_LEGENDARY2'),
    LEGENDARY3: e('EMOJI_LEGENDARY3'),
    MASTERS1:   e('EMOJI_MASTERS1'),
    MASTERS2:   e('EMOJI_MASTERS2'),
    MASTERS3:   e('EMOJI_MASTERS3'),
    PRO1:       e('EMOJI_PRO1'),
    PRESTIGE1:  e('EMOJI_PRESTIGE1'),
    PRESTIGE2:  e('EMOJI_PRESTIGE2'),
    PRESTIGE3:  e('EMOJI_PRESTIGE3'),
    PAYPAL:     e('EMOJI_PAYPAL'),
    // UI
    TICKET:    '🎫',
    ORDER:     '📦',
    BOOST:     '⚡',
    CARRY:     '🤝',
    STAR:      '⭐',
    MONEY:     '💰',
    CHECK:     '✅',
    CROSS:     '❌',
    CLOCK:     '🕐',
    SWORD:     '⚔️',
    TROPHY:    '🏆',
    FIRE:      '🔥',
    CROWN:     '👑',
    SHIELD:    '🛡️',
    PENCIL:    '✏️',
    LOCK:      '🔒',
    UNLOCK:    '🔓',
    PERSON:    '👤',
    STAFF:     '🛠️',
    VOUCH:     '📣',
    COACHING:  '🎓',
    ACCOUNT:   '🎮',
    PAYMENT:   '💳',
    APPLEPAY:  '🍎',
    GOOGLEPAY: '🔵',
    BANNED:    '🚫',
    STATS:     '📊',
    REFRESH:   '🔄',
    ARROW:     '→',
    BULLET:    '•',
  };
}

// ─── Pricing ───────────────────────────────────────────────────────────────
const PRICING = {
  ranked: {
    boost: {
      'bronze_silver':     { label: 'Bronze → Silver',     price: 3   },
      'silver_gold':       { label: 'Silver → Gold',       price: 6   },
      'gold_diamond':      { label: 'Gold → Diamond',      price: 8   },
      'diamond_mythic':    { label: 'Diamond → Mythic',    price: 15  },
      'mythic_legendary':  { label: 'Mythic → Legendary',  price: 18  },
      'legendary_masters': { label: 'Legendary → Masters', price: 35  },
      'masters_pro':       { label: 'Masters → Pro',       price: 210 },
    },
    carry: {
      'bronze_silver':     { label: 'Bronze → Silver',     price: 6   },
      'silver_gold':       { label: 'Silver → Gold',       price: 12  },
      'gold_diamond':      { label: 'Gold → Diamond',      price: 16  },
      'diamond_mythic':    { label: 'Diamond → Mythic',    price: 30  },
      'mythic_legendary':  { label: 'Mythic → Legendary',  price: 36  },
      'legendary_masters': { label: 'Legendary → Masters', price: 70  },
      'masters_pro':       { label: 'Masters → Pro',       price: 210 },
    },
  },
  prestige: {
    boost: {
      'prestige_1': { label: 'Prestige 1', price: 8  },
      'prestige_2': { label: 'Prestige 2', price: 20 },
      'prestige_3': { label: 'Prestige 3', price: 70 },
    },
    carry: {
      'prestige_1': { label: 'Prestige 1', price: 16  },
      'prestige_2': { label: 'Prestige 2', price: 40  },
      'prestige_3': { label: 'Prestige 3', price: 140 },
    },
  },
  winstreak: {
    boost: {
      'wins_50':  { label: '50 Wins',  price: 20 },
      'wins_100': { label: '100 Wins', price: 33 },
      'wins_150': { label: '150 Wins', price: 50 },
      'wins_200': { label: '200 Wins', price: 90 },
    },
    carry: {
      'wins_50':  { label: '50 Wins',  price: 40  },
      'wins_100': { label: '100 Wins', price: 66  },
      'wins_150': { label: '150 Wins', price: 100 },
      'wins_200': { label: '200 Wins', price: 180 },
    },
  },
  coaching: {
    basic:    { label: 'Basic Session (1h)',   price: 10 },
    advanced: { label: 'Advanced Session (2h)',price: 18 },
    pro:      { label: 'Pro Session (3h)',      price: 25 },
  },
};

// ─── Rank labels with emoji keys ───────────────────────────────────────────
const RANK_EMOJIS = {
  'Bronze 1': 'BRONZE1', 'Bronze 2': 'BRONZE2', 'Bronze 3': 'BRONZE3',
  'Silver 1': 'SILVER1', 'Silver 2': 'SILVER2', 'Silver 3': 'SILVER3',
  'Gold 1':   'GOLD1',   'Gold 2':   'GOLD2',   'Gold 3':   'GOLD3',
  'Diamond 1':'DIAMOND1','Diamond 2':'DIAMOND2','Diamond 3':'DIAMOND3',
  'Mythic 1': 'MYTHIC1', 'Mythic 2': 'MYTHIC2', 'Mythic 3': 'MYTHIC3',
  'Legendary 1':'LEGENDARY1','Legendary 2':'LEGENDARY2','Legendary 3':'LEGENDARY3',
  'Masters 1':'MASTERS1','Masters 2':'MASTERS2','Masters 3':'MASTERS3',
  'Pro 1':    'PRO1',
};

const ORDER_STATUS = {
  PENDING:    'pending',
  PAID:       'paid',
  IN_PROGRESS:'in_progress',
  COMPLETED:  'completed',
  CANCELLED:  'cancelled',
  DISPUTED:   'disputed',
};

const TICKET_CATEGORIES = {
  GENERAL:   'general',
  ORDER:     'order',
  PAYMENT:   'payment',
  COACHING:  'coaching',
  ACCOUNT:   'account',
  SUPPORT:   'support',
  REPORT:    'report',
};

module.exports = { COLORS, getEmojis, PRICING, RANK_EMOJIS, ORDER_STATUS, TICKET_CATEGORIES };
