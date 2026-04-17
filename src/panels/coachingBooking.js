// src/panels/coachingBooking.js
const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, AttachmentBuilder,
} = require('discord.js');
const { COLORS, getEmojis, PRICING } = require('../utils/constants');
const { base } = require('../utils/embeds');

const logo = () => new AttachmentBuilder('assets/logo.png', { name: 'logo.png' });

// ─── Helper: get next N days from today ──────────────────────────────────────
function getNextDays(count = 14) {
  const days = [];
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  for (let i = 1; i <= count; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    days.push({
      label: `${dayNames[d.getDay()]} ${d.getDate()} ${monthNames[d.getMonth()]}`,
      value: d.toISOString().split('T')[0], // YYYY-MM-DD
      description: `${d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}`,
    });
  }
  return days;
}

// ─── Time slots ───────────────────────────────────────────────────────────────
const TIME_SLOTS = [
  { label: '🌅 08:00 – 09:00', value: '08:00', description: 'Morning slot' },
  { label: '🌅 09:00 – 10:00', value: '09:00', description: 'Morning slot' },
  { label: '🌤️ 10:00 – 11:00', value: '10:00', description: 'Late morning' },
  { label: '🌤️ 11:00 – 12:00', value: '11:00', description: 'Late morning' },
  { label: '☀️ 12:00 – 13:00', value: '12:00', description: 'Midday slot' },
  { label: '☀️ 13:00 – 14:00', value: '13:00', description: 'Afternoon' },
  { label: '🌞 14:00 – 15:00', value: '14:00', description: 'Afternoon' },
  { label: '🌞 15:00 – 16:00', value: '15:00', description: 'Afternoon' },
  { label: '🌇 16:00 – 17:00', value: '16:00', description: 'Late afternoon' },
  { label: '🌇 17:00 – 18:00', value: '17:00', description: 'Late afternoon' },
  { label: '🌆 18:00 – 19:00', value: '18:00', description: 'Evening slot' },
  { label: '🌆 19:00 – 20:00', value: '19:00', description: 'Evening slot' },
  { label: '🌃 20:00 – 21:00', value: '20:00', description: 'Night slot' },
  { label: '🌃 21:00 – 22:00', value: '21:00', description: 'Night slot' },
  { label: '🌙 22:00 – 23:00', value: '22:00', description: 'Late night slot' },
];

// ─── STEP 1: Session type selector ───────────────────────────────────────────
function coachingStep1Panel() {
  const em = getEmojis();
  const embed = base(COLORS.PRIMARY)
    .setTitle(`# ${em.COACHING} Book a Coaching Session`)
    .setDescription(
      `> Choose the type of coaching session you'd like to book.\n\n` +
      `${em.STAR} **Basic (1h)** — €10\n` +
      `> Perfect for a quick review, specific tips, or a warm-up session.\n\n` +
      `${em.STAR}${em.STAR} **Advanced (2h)** — €18\n` +
      `> Deep dive into your playstyle, brawler mechanics & rank strategy.\n\n` +
      `${em.STAR}${em.STAR}${em.STAR} **Pro (3h)** — €25\n` +
      `> Full pro coaching: replay analysis, live coaching & custom plan.\n\n` +
      `*Select a session type below to continue* ${em.CROWN}`
    )
    .setThumbnail('attachment://logo.png');

  const select = new StringSelectMenuBuilder()
    .setCustomId('coaching_book_type')
    .setPlaceholder('🎓 Select session type...')
    .addOptions([
      {
        label: '🟢 Basic Session – 1 hour',
        description: '€10 — Quick tips & review',
        value: 'basic',
        emoji: '⭐',
      },
      {
        label: '🔵 Advanced Session – 2 hours',
        description: '€18 — Deep coaching & strategy',
        value: 'advanced',
        emoji: '🌟',
      },
      {
        label: '👑 Pro Session – 3 hours',
        description: '€25 — Full pro coaching package',
        value: 'pro',
        emoji: '💫',
      },
    ]);

  const row = new ActionRowBuilder().addComponents(select);
  return { embeds: [embed], components: [row], files: [logo()] };
}

// ─── STEP 2: Date selector ────────────────────────────────────────────────────
function coachingStep2Panel(sessionType) {
  const em = getEmojis();
  const pricing = PRICING.coaching[sessionType];
  const days = getNextDays(14);

  // Discord only allows 25 options per select — take first 25 (14 days is fine)
  const options = days.slice(0, 25);

  const embed = base(COLORS.PRIMARY)
    .setTitle(`# 📅 Choose a Date`)
    .setDescription(
      `**Session:** ${pricing.label}\n` +
      `**Price:** **€${pricing.price}**\n\n` +
      `> Select your preferred date for the coaching session.\n` +
      `> All times are in **CET (Central European Time)**.\n\n` +
      `*Showing the next 14 days* ${em.CLOCK}`
    )
    .setThumbnail('attachment://logo.png');

  const select = new StringSelectMenuBuilder()
    .setCustomId(`coaching_book_date_${sessionType}`)
    .setPlaceholder('📅 Select a date...')
    .addOptions(options);

  const backRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('coaching_book_back_step1')
      .setLabel('Back')
      .setEmoji('◀️')
      .setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [new ActionRowBuilder().addComponents(select), backRow], files: [logo()] };
}

// ─── STEP 3: Time slot selector ───────────────────────────────────────────────
function coachingStep3Panel(sessionType, date) {
  const em = getEmojis();
  const pricing = PRICING.coaching[sessionType];
  const displayDate = new Date(date + 'T12:00:00').toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  const embed = base(COLORS.PRIMARY)
    .setTitle(`# 🕐 Choose a Time`)
    .setDescription(
      `**Session:** ${pricing.label}\n` +
      `**Date:** 📅 ${displayDate}\n` +
      `**Price:** **€${pricing.price}**\n\n` +
      `> Select your preferred time slot.\n` +
      `> All times are **CET**. Duration: **${pricing.label.match(/\d+h/)?.[0] || '1h'}**\n\n` +
      `*Pick a slot that works for you* ${em.CLOCK}`
    )
    .setThumbnail('attachment://logo.png');

  const select = new StringSelectMenuBuilder()
    .setCustomId(`coaching_book_time_${sessionType}_${date}`)
    .setPlaceholder('🕐 Select a time slot...')
    .addOptions(TIME_SLOTS);

  const backRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`coaching_book_back_step2_${sessionType}`)
      .setLabel('Back')
      .setEmoji('◀️')
      .setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [new ActionRowBuilder().addComponents(select), backRow], files: [logo()] };
}

// ─── STEP 4: Confirm booking ──────────────────────────────────────────────────
function coachingStep4Panel(sessionType, date, time, goals = '', brawler = '') {
  const em = getEmojis();
  const pricing = PRICING.coaching[sessionType];
  const displayDate = new Date(date + 'T12:00:00').toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
  const timeSlot = TIME_SLOTS.find(t => t.value === time);

  const embed = base(COLORS.PRIMARY)
    .setTitle(`# ${em.CHECK} Confirm Your Booking`)
    .setDescription(
      `> Please review your booking details before confirming.\n\n` +
      `**📚 Session:** ${pricing.label}\n` +
      `**📅 Date:** ${displayDate}\n` +
      `**🕐 Time:** ${timeSlot?.label || time} CET\n` +
      `**💰 Price:** **€${pricing.price}**\n` +
      (goals   ? `**🎯 Goals:** ${goals}\n`           : '') +
      (brawler ? `**🎮 Brawler:** ${brawler}\n`        : '') +
      `\n> By confirming, a ticket will be opened and you'll be sent a payment link.\n` +
      `> A coach will be assigned within 24 hours.`
    )
    .setThumbnail('attachment://logo.png');

  const confirmKey = `coaching_book_confirm_${sessionType}_${date}_${time}`;

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(confirmKey)
      .setLabel('Confirm Booking')
      .setEmoji('✅')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`coaching_book_back_step3_${sessionType}_${date}`)
      .setLabel('Back')
      .setEmoji('◀️')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('coaching_book_back_step1')
      .setLabel('Start Over')
      .setEmoji('🔄')
      .setStyle(ButtonStyle.Danger),
  );

  return { embeds: [embed], components: [row], files: [logo()] };
}

// ─── Available sessions panel (public) ───────────────────────────────────────
function coachingAvailablePanel(bookedSlots = []) {
  const em = getEmojis();
  const days = getNextDays(7);

  const bookedSet = new Set(bookedSlots.map(b => `${b.date}_${b.time}`));

  const lines = days.map(day => {
    const available = TIME_SLOTS.filter(t => !bookedSet.has(`${day.value}_${t.value}`));
    const count = available.length;
    const indicator = count === 0 ? '🔴 Full' : count <= 3 ? `🟡 ${count} left` : `🟢 ${count} available`;
    return `**${day.label}** — ${indicator}`;
  }).join('\n');

  const embed = base(COLORS.PRIMARY)
    .setTitle(`# ${em.COACHING} Coaching Schedule`)
    .setDescription(
      `> See available coaching slots for the next 7 days.\n\n` +
      lines + `\n\n*Use \`/coaching book\` or click below to book a session!*`
    )
    .setThumbnail('attachment://logo.png')
    .setFooter({ text: `${em.CROWN} Brawl Services™ • All times CET` });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('coaching_open_booking')
      .setLabel('Book a Session')
      .setEmoji('🎓')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('coaching_view_pricing')
      .setLabel('View Pricing')
      .setEmoji('💰')
      .setStyle(ButtonStyle.Secondary),
  );

  return { embeds: [embed], components: [row], files: [logo()] };
}

module.exports = {
  coachingStep1Panel,
  coachingStep2Panel,
  coachingStep3Panel,
  coachingStep4Panel,
  coachingAvailablePanel,
  TIME_SLOTS,
};
