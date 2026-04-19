// src/commands/split.js
const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const db = require('../database');
const { COLORS, getEmojis } = require('../utils/constants');
const { base, success, error } = require('../utils/embeds');
const { isStaff, isAdmin } = require('../utils/permissions');

// Split percentages
const SPLITS = {
  booster:        { label: 'Booster',        worker: 60, owner: 40 },
  senior_booster: { label: 'Senior Booster',  worker: 65, owner: 35 },
  global_booster: { label: 'Global Booster',  worker: 70, owner: 30 },
  coach:          { label: 'Coach / Trainer', worker: 60, owner: 40 },
  trainer_expert: { label: 'Trainer Expert',  worker: 65, owner: 35 },
  coowner:        { label: 'Co-Owner',         worker: 85, owner: 15 },
  owner:          { label: 'Owner',            worker: 100, owner: 0 },
};

function formatEur(amount) {
  return `€${parseFloat(amount).toFixed(2)}`;
}

function calcSplit(price, role) {
  const split = SPLITS[role];
  if (!split) return null;
  const workerCut = (price * split.worker) / 100;
  const ownerCut  = (price * split.owner)  / 100;
  return { workerCut, ownerCut, split };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('split')
    .setDescription('Payment split calculator')

    .addSubcommand(s => s
      .setName('calculate')
      .setDescription('Calculate payment split for an order')
      .addNumberOption(o => o.setName('amount').setDescription('Order amount in EUR').setRequired(true).setMinValue(0.01))
      .addStringOption(o => o.setName('role').setDescription('Role of the worker').setRequired(true)
        .addChoices(
          { name: '⚡ Booster (60%)',         value: 'booster' },
          { name: '⚡ Senior Booster (65%)',   value: 'senior_booster' },
          { name: '⚡ Global Booster (70%)',   value: 'global_booster' },
          { name: '🎓 Coach / Trainer (60%)', value: 'coach' },
          { name: '🎓 Trainer Expert (65%)',  value: 'trainer_expert' },
          { name: '👑 Co-Owner (85%)',         value: 'coowner' },
          { name: '👑 Owner (100%)',           value: 'owner' },
        ))
      .addStringOption(o => o.setName('order_id').setDescription('Order ID to auto-fill amount').setRequired(false))
    )

    .addSubcommand(s => s
      .setName('order')
      .setDescription('Calculate split for a specific order by ID')
      .addStringOption(o => o.setName('order_id').setDescription('Order ID').setRequired(true))
      .addStringOption(o => o.setName('role').setDescription('Role of the worker').setRequired(true)
        .addChoices(
          { name: '⚡ Booster (60%)',         value: 'booster' },
          { name: '⚡ Senior Booster (65%)',   value: 'senior_booster' },
          { name: '⚡ Global Booster (70%)',   value: 'global_booster' },
          { name: '🎓 Coach / Trainer (60%)', value: 'coach' },
          { name: '🎓 Trainer Expert (65%)',  value: 'trainer_expert' },
          { name: '👑 Co-Owner (85%)',         value: 'coowner' },
          { name: '👑 Owner (100%)',           value: 'owner' },
        ))
    )

    .addSubcommand(s => s
      .setName('panel')
      .setDescription('[Admin] Send the official split structure panel')
      .addChannelOption(o => o.setName('channel').setDescription('Channel to send to').setRequired(false))
    )

    .addSubcommand(s => s
      .setName('earnings')
      .setDescription('[Staff] Calculate total earnings for a worker over a period')
      .addUserOption(o => o.setName('user').setDescription('Worker to calculate for').setRequired(true))
      .addStringOption(o => o.setName('role').setDescription('Their role').setRequired(true)
        .addChoices(
          { name: '⚡ Booster (60%)',         value: 'booster' },
          { name: '⚡ Senior Booster (65%)',   value: 'senior_booster' },
          { name: '⚡ Global Booster (70%)',   value: 'global_booster' },
          { name: '🎓 Coach / Trainer (60%)', value: 'coach' },
          { name: '🎓 Trainer Expert (65%)',  value: 'trainer_expert' },
          { name: '👑 Co-Owner (85%)',         value: 'coowner' },
        ))
      .addStringOption(o => o.setName('period').setDescription('Time period').setRequired(false)
        .addChoices(
          { name: 'This Week',  value: 'week' },
          { name: 'This Month', value: 'month' },
          { name: 'All Time',   value: 'all' },
        ))
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const em = getEmojis();
    await interaction.deferReply({ ephemeral: sub !== 'panel' });

    try {
      if (sub === 'calculate') {
        let amount = interaction.options.getNumber('amount');
        const role = interaction.options.getString('role');
        const orderId = interaction.options.getString('order_id');

        if (orderId) {
          const { rows } = await db.query(`SELECT * FROM orders WHERE id=$1`, [orderId]);
          if (rows.length) amount = parseFloat(rows[0].price);
        }

        const result = calcSplit(amount, role);
        if (!result) return interaction.editReply({ embeds: [error('Error', 'Invalid role.')] });

        const { workerCut, ownerCut, split } = result;
        const embed = base(COLORS.PRIMARY)
          .setTitle(`💰 Payment Split Calculator`)
          .setDescription(
            `**Order Amount:** **${formatEur(amount)}**\n` +
            `**Role:** ${split.label}\n\n` +
            `**Split Breakdown:**`
          )
          .addFields(
            { name: `${split.label} (${split.worker}%)`, value: `**${formatEur(workerCut)}**`, inline: true },
            { name: `Owner Cut (${split.owner}%)`,        value: `**${formatEur(ownerCut)}**`,  inline: true },
            { name: 'Total',                               value: `**${formatEur(amount)}**`,   inline: true },
          )
          .setFooter({ text: 'Brawl Services™ • Splits are final and non-negotiable' });

        return interaction.editReply({ embeds: [embed] });
      }

      if (sub === 'order') {
        const orderId = interaction.options.getString('order_id');
        const role = interaction.options.getString('role');
        const { rows } = await db.query(`SELECT * FROM orders WHERE id=$1`, [orderId]);
        if (!rows.length) return interaction.editReply({ embeds: [error('Not Found', 'Order not found.')] });
        const o = rows[0];
        const amount = parseFloat(o.price);
        const result = calcSplit(amount, role);
        const { workerCut, ownerCut, split } = result;

        const embed = base(COLORS.PRIMARY)
          .setTitle(`💰 Split — Order #${orderId.slice(0,8).toUpperCase()}`)
          .setDescription(
            `**Customer:** <@${o.user_id}>\n` +
            `**Service:** ${o.service_type}\n` +
            `**Route:** ${o.from_rank} → ${o.to_rank}\n` +
            `**Order Total:** **${formatEur(amount)}**\n` +
            `**Role:** ${split.label}\n`
          )
          .addFields(
            { name: `${split.label} (${split.worker}%)`, value: `**${formatEur(workerCut)}**`, inline: true },
            { name: `Owner Cut (${split.owner}%)`,        value: `**${formatEur(ownerCut)}**`,  inline: true },
          )
          .setFooter({ text: 'Splits are final and non-negotiable • Brawl Services™' });

        return interaction.editReply({ embeds: [embed] });
      }

      if (sub === 'panel') {
        if (!isAdmin(interaction.member)) return interaction.editReply({ embeds: [error('Access Denied', 'Admin only.')] });
        const ch = interaction.options.getChannel('channel') || interaction.channel;

        const embed = base(COLORS.PRIMARY)
          .setTitle(`💳 Payment Split Structure — Brawl Services™`)
          .setDescription(
            `> Official payment split structure for all completed orders.\n` +
            `> All staff, boosters, and coaches must follow this.\n\n` +
            `⚡ **Boosting Orders**\n` +
            `> **Booster** — 60% of order value\n` +
            `> **Senior Booster** — 65% of order value\n` +
            `> **Global Booster** — 70% of order value\n` +
            `> Owner cut — minimum **30%** from every order\n\n` +
            `🎓 **Coaching Orders**\n` +
            `> **Coach / Trainer** — 60% of order value\n` +
            `> **Trainer Expert** — 65% of order value\n` +
            `> Owner cut — minimum **30%** from every order\n\n` +
            `👑 **Owner & Co-Owner Orders**\n` +
            `> **Owner** completes — **100%** of order value\n` +
            `> **Co-Owner** completes — **85%** to Co-Owner, **15%** to Owner\n\n` +
            `📋 **Rules**\n` +
            `> Payment splits are **final and non-negotiable**\n` +
            `> Do not discuss splits publicly outside staff channels\n` +
            `> Raise concerns **before** an order is marked complete\n` +
            `> All disputes go directly to the **Owner**\n\n` +
            `> ⚠️ *Splits are reviewed and may be updated by the Owner at any time. Changes will be announced in staff announcements.*`
          )
          .setThumbnail('attachment://logo.png')
          .setFooter({ text: 'Brawl Services™ • Use /split calculate to compute splits' });

        await ch.send({ embeds: [embed], files: [{ attachment: 'assets/logo.png', name: 'logo.png' }] });
        return interaction.editReply({ embeds: [success('Sent', `Split structure panel sent to ${ch}`)] });
      }

      if (sub === 'earnings') {
        if (!isStaff(interaction.member)) return interaction.editReply({ embeds: [error('Access Denied', 'Staff only.')] });
        const user = interaction.options.getUser('user');
        const role = interaction.options.getString('role');
        const period = interaction.options.getString('period') || 'month';
        const intervals = { week: '7 days', month: '30 days', all: '9999 days' };

        const { rows } = await db.query(
          `SELECT * FROM orders WHERE booster_id=$1 AND status='completed' AND updated_at > NOW() - INTERVAL '${intervals[period]}'`,
          [user.id]
        );

        const split = SPLITS[role];
        if (!split) return interaction.editReply({ embeds: [error('Error', 'Invalid role.')] });

        const totalRevenue = rows.reduce((sum, o) => sum + parseFloat(o.price), 0);
        const workerTotal  = rows.reduce((sum, o) => sum + (parseFloat(o.price) * split.worker / 100), 0);
        const ownerTotal   = rows.reduce((sum, o) => sum + (parseFloat(o.price) * split.owner  / 100), 0);

        const embed = base(COLORS.SUCCESS)
          .setTitle(`💰 Earnings Summary — ${user.username}`)
          .setDescription(`**Role:** ${split.label}\n**Period:** ${period}\n**Orders Completed:** ${rows.length}`)
          .addFields(
            { name: 'Total Revenue',      value: formatEur(totalRevenue), inline: true },
            { name: `${user.username}'s Cut (${split.worker}%)`, value: `**${formatEur(workerTotal)}**`, inline: true },
            { name: `Owner Cut (${split.owner}%)`, value: formatEur(ownerTotal), inline: true },
          );

        if (rows.length > 0) {
          embed.addFields({
            name: 'Order Breakdown',
            value: rows.slice(0, 8).map(o =>
              `\`#${o.id.slice(0,8).toUpperCase()}\` ${o.service_type} | ${formatEur(o.price)} → **${formatEur(parseFloat(o.price) * split.worker / 100)}**`
            ).join('\n') + (rows.length > 8 ? `\n*...and ${rows.length - 8} more*` : ''),
            inline: false,
          });
        }

        return interaction.editReply({ embeds: [embed] });
      }

    } catch (err) {
      console.error('[split]', err);
      return interaction.editReply({ embeds: [error('Error', err.message)] });
    }
  },
};
