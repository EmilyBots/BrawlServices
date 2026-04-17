// src/panels/coachingBooking.js
const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, AttachmentBuilder,
} = require('discord.js');
const { COLORS, getEmojis, PRICING } = require('../utils/constants');
const { base } = require('../utils/embeds');

const logo = () => new AttachmentBuilder('assets/logo.png', { name: 'logo.png' });

const TIME_SLOTS = [
  { label: '🌅 08:00', value: '08:00' },
  { label: '🌅 09:00', value: '09:00' },
  { label: '🌤️ 10:00', value: '10:00' },
  { label: '🌤️ 11:00', value: '11:00' },
  { label: '☀️ 12:00', value: '12:00' },
  { label: '☀️ 13:00', value: '13:00' },
  { label: '🌞 14:00', value: '14:00' },
  { label: '🌞 15:00', value: '15:00' },
  { label: '🌇 16:00', value: '16:00' },
  { label: '🌇 17:00', value: '17:00' },
  { label: '🌆 18:00', value: '18:00' },
  { label: '🌆 19:00', value: '19:00' },
  { label: '🌃 20:00', value: '20:00' },
  { label: '🌃 21:00', value: '21:00' },
  { label: '🌙 22:00', value: '22:00' },
];

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];
const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function getDaysInMonth(year, month) {
  const days = [];
  const total = new Date(year, month + 1, 0).getDate();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let d = 1; d <= total; d++) {
    const date = new Date(year, month, d);
    const isPast = date < today;
    const dateStr = `${year}-${String(month + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    days.push({ d, date, dateStr, isPast, dayName: DAY_NAMES[date.getDay()] });
  }
  return days;
}

function getMonthOptions() {
  const options = [];
  const now = new Date();
  for (let i = 0; i < 3; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const y = d.getFullYear();
    const m = d.getMonth();
    options.push({
      label: `${MONTH_NAMES[m]} ${y}`,
      value: `${y}-${m}`,
      description: i === 0 ? 'Current month' : i === 1 ? 'Next month' : 'Month after next',
    });
  }
  return options;
}

// ── MAIN PANEL (auto-sent, stays in channel) ──────────────────────────────────
function coachingMainPanel() {
  const em = getEmojis();

  const embed = base(COLORS.PRIMARY)
    .setTitle(`# ${em.COACHING} Book a Coaching Session`)
    .setDescription(
      `> Book a **1-on-1 coaching session** with one of our Pro players!\n\n` +
      `## 💰 Pricing\n` +
      `${em.STAR} **Basic — 1 hour** — \`€10\`\n` +
      `> Quick tips, brawler review & warm-up\n\n` +
      `${em.STAR}${em.STAR} **Advanced — 2 hours** — \`€18\`\n` +
      `> Deep playstyle coaching & rank strategy\n\n` +
      `${em.STAR}${em.STAR}${em.STAR} **Pro — 3 hours** — \`€25\`\n` +
      `> Replay analysis + live coaching + custom plan\n\n` +
      `## 📋 How to Book\n` +
      `**1.** Select your **session type** below\n` +
      `**2.** Select a **month**\n` +
      `**3.** Click a **day** on the calendar\n` +
      `**4.** Pick an **available time** slot\n` +
      `**5.** Confirm & pay!\n\n` +
      `> 🕐 *All times are CET — Sessions update live*`
    )
    .setThumbnail('attachment://logo.png')
    .setFooter({ text: `${em.CROWN} Brawl Services™ • Start by selecting a session type` });

  const typeSelect = new StringSelectMenuBuilder()
    .setCustomId('cbk_type')
    .setPlaceholder('🎓 Step 1 — Select session type...')
    .addOptions([
      { label: 'Basic – 1 hour',     description: '€10 — Quick tips & review',        value: 'basic',    emoji: '⭐' },
      { label: 'Advanced – 2 hours', description: '€18 — Deep coaching & strategy',   value: 'advanced', emoji: '🌟' },
      { label: 'Pro – 3 hours',      description: '€25 — Full pro coaching package',   value: 'pro',      emoji: '💫' },
    ]);

  const monthSelect = new StringSelectMenuBuilder()
    .setCustomId('cbk_month')
    .setPlaceholder('📅 Step 2 — Select a month...')
    .addOptions(getMonthOptions());

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(typeSelect),
      new ActionRowBuilder().addComponents(monthSelect),
    ],
    files: [logo()],
  };
}

// ── DAY PANEL (ephemeral reply after month select) ────────────────────────────
function coachingDayPanel(sessionType, yearMonth, bookedDateCounts = {}) {
  const em = getEmojis();
  const [year, month] = yearMonth.split('-').map(Number);
  const pricing = PRICING.coaching[sessionType];
  const days = getDaysInMonth(year, month);
  const futureDays = days.filter(d => !d.isPast);
  const now = new Date();

  const embed = base(COLORS.PRIMARY)
    .setTitle(`# 📅 ${MONTH_NAMES[month]} ${year}`)
    .setDescription(
      `**Session:** ${pricing.label} — **€${pricing.price}**\n\n` +
      `> Click a day to see available time slots.\n` +
      `> 🟢 **Available**  🔴 **Fully Booked**\n\n` +
      `*All times CET*`
    )
    .setThumbnail('attachment://logo.png');

  const rows = [];
  const chunks = [];
  for (let i = 0; i < futureDays.length; i += 5) chunks.push(futureDays.slice(i, i + 5));

  for (const chunk of chunks.slice(0, 4)) {
    const row = new ActionRowBuilder();
    for (const day of chunk) {
      const bookedCount = bookedDateCounts[day.dateStr] || 0;
      const fullyBooked = bookedCount >= TIME_SLOTS.length;
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`cbk_day_${sessionType}_${yearMonth}_${day.dateStr}`)
          .setLabel(`${day.dayName} ${day.d}`)
          .setStyle(fullyBooked ? ButtonStyle.Danger : ButtonStyle.Success)
          .setDisabled(fullyBooked)
      );
    }
    rows.push(row);
  }

  // Nav row
  const prevMonthDate = new Date(year, month - 1, 1);
  const nextMonthDate = new Date(year, month + 1, 1);
  const canGoPrev = prevMonthDate >= new Date(now.getFullYear(), now.getMonth(), 1);
  const canGoNext = nextMonthDate <= new Date(now.getFullYear(), now.getMonth() + 2, 1);

  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('cbk_back_main')
      .setLabel('Back')
      .setEmoji('◀️')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`cbk_prevmonth_${sessionType}_${year}-${month - 1}`)
      .setLabel('← Prev')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!canGoPrev),
    new ButtonBuilder()
      .setCustomId(`cbk_nextmonth_${sessionType}_${year}-${month + 1}`)
      .setLabel('Next →')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!canGoNext),
  ));

  return { embeds: [embed], components: rows, files: [logo()] };
}

// ── TIME PANEL (ephemeral reply after day click) ──────────────────────────────
function coachingTimePanel(sessionType, dateStr, bookedTimes = []) {
  const em = getEmojis();
  const pricing = PRICING.coaching[sessionType];
  const bookedSet = new Set(bookedTimes);
  const availableCount = TIME_SLOTS.filter(t => !bookedSet.has(t.value)).length;

  const displayDate = new Date(dateStr + 'T12:00:00').toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  const embed = base(COLORS.PRIMARY)
    .setTitle(`# 🕐 Pick a Time Slot`)
    .setDescription(
      `**Session:** ${pricing.label} — **€${pricing.price}**\n` +
      `**Date:** 📅 ${displayDate}\n` +
      `**Available:** 🟢 ${availableCount} of ${TIME_SLOTS.length} slots free\n\n` +
      `> Click a **green** time to book it.\n` +
      `> ⬛ = Already booked\n` +
      `> *Duration: ${pricing.label.match(/\d+ hour/)?.[0] || '1 hour'} from selected time*\n\n` +
      `*All times CET*`
    )
    .setThumbnail('attachment://logo.png');

  const rows = [];
  for (let i = 0; i < TIME_SLOTS.length; i += 5) {
    const chunk = TIME_SLOTS.slice(i, i + 5);
    const row = new ActionRowBuilder();
    for (const slot of chunk) {
      const isBooked = bookedSet.has(slot.value);
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`cbk_time_${sessionType}_${dateStr}_${slot.value}`)
          .setLabel(slot.label)
          .setStyle(isBooked ? ButtonStyle.Secondary : ButtonStyle.Success)
          .setDisabled(isBooked)
      );
    }
    rows.push(row);
  }

  // Parse yearMonth back for back button
  const parts = dateStr.split('-');
  const ym = `${parts[0]}-${parseInt(parts[1]) - 1}`;
  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`cbk_back_days_${sessionType}_${ym}`)
      .setLabel('Back to Calendar')
      .setEmoji('📅')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('cbk_back_main')
      .setLabel('Start Over')
      .setEmoji('🔄')
      .setStyle(ButtonStyle.Danger),
  ));

  return { embeds: [embed], components: rows, files: [logo()] };
}

// ── CONFIRM PANEL ─────────────────────────────────────────────────────────────
function coachingConfirmPanel(sessionType, dateStr, time) {
  const em = getEmojis();
  const pricing = PRICING.coaching[sessionType];
  const slot = TIME_SLOTS.find(t => t.value === time);

  const displayDate = new Date(dateStr + 'T12:00:00').toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  const embed = base(COLORS.PRIMARY)
    .setTitle(`# ${em.CHECK} Confirm Your Booking`)
    .setDescription(
      `> Review your details and confirm!\n\n` +
      `**📚 Session:** ${pricing.label}\n` +
      `**📅 Date:** ${displayDate}\n` +
      `**🕐 Time:** ${slot?.label || time} CET\n` +
      `**💰 Price:** **€${pricing.price}**\n\n` +
      `> ✅ A ticket will be opened & payment link sent.\n` +
      `> ⚡ A coach is assigned within **24 hours** after payment.`
    )
    .setThumbnail('attachment://logo.png');

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`cbk_confirm_${sessionType}_${dateStr}_${time}`)
      .setLabel('Confirm & Book')
      .setEmoji('✅')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`cbk_back_times_${sessionType}_${dateStr}`)
      .setLabel('Back to Times')
      .setEmoji('◀️')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('cbk_back_main')
      .setLabel('Start Over')
      .setEmoji('🔄')
      .setStyle(ButtonStyle.Danger),
  );

  return { embeds: [embed], components: [row], files: [logo()] };
}

module.exports = {
  coachingMainPanel,
  coachingDayPanel,
  coachingTimePanel,
  coachingConfirmPanel,
  TIME_SLOTS,
  MONTH_NAMES,
};
