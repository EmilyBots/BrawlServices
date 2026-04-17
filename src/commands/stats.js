// src/commands/stats.js
const { SlashCommandBuilder } = require('discord.js');
const db = require('../database');
const { COLORS, getEmojis } = require('../utils/constants');
const { base, error } = require('../utils/embeds');
const { isStaff } = require('../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stats')
    .setDescription('View Brawl Services statistics')

    .addSubcommand(s => s.setName('server').setDescription('Overall server/service statistics'))
    .addSubcommand(s => s.setName('orders').setDescription('Order statistics breakdown'))
    .addSubcommand(s => s.setName('revenue').setDescription('[Staff] Revenue statistics'))
    .addSubcommand(s => s.setName('vouches').setDescription('Vouch statistics'))
    .addSubcommand(s => s.setName('tickets').setDescription('[Staff] Ticket statistics'))
    .addSubcommand(s => s.setName('boosters').setDescription('[Staff] Booster performance stats'))
    .addSubcommand(s => s.setName('accounts').setDescription('[Staff] Account shop stats'))
    .addSubcommand(s => s.setName('coaching').setDescription('Coaching statistics'))
    .addSubcommand(s => s.setName('daily').setDescription('[Staff] Daily summary'))
    .addSubcommand(s => s.setName('uptime').setDescription('Bot uptime and status')),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const em = getEmojis();
    await interaction.deferReply({ ephemeral: false });

    try {
      if (sub === 'server') {
        const [orders, vouches, accounts, coaching] = await Promise.all([
          db.query(`SELECT COUNT(*) as total, COUNT(*) FILTER(WHERE status='completed') as done, SUM(price) FILTER(WHERE status='completed') as rev FROM orders`),
          db.query(`SELECT COUNT(*) as total, AVG(rating) as avg FROM vouches`),
          db.query(`SELECT COUNT(*) FILTER(WHERE status='sold') as sold FROM accounts`),
          db.query(`SELECT COUNT(*) FILTER(WHERE status='completed') as done FROM coaching_sessions`),
        ]);
        const embed = base(COLORS.PRIMARY)
          .setTitle(`${em.STATS} Brawl Services™ — Server Stats`)
          .setThumbnail('attachment://logo.png')
          .addFields(
            { name: `${em.ORDER} Total Orders`,     value: orders.rows[0].total || '0',   inline: true },
            { name: `${em.CHECK} Completed`,        value: orders.rows[0].done || '0',    inline: true },
            { name: `${em.MONEY} Revenue`,          value: `€${parseFloat(orders.rows[0].rev || 0).toFixed(2)}`, inline: true },
            { name: `${em.VOUCH} Total Vouches`,    value: vouches.rows[0].total || '0',  inline: true },
            { name: `${em.STAR} Avg Rating`,        value: vouches.rows[0].avg ? `${parseFloat(vouches.rows[0].avg).toFixed(2)}/5` : 'N/A', inline: true },
            { name: `${em.ACCOUNT} Accounts Sold`,  value: accounts.rows[0].sold || '0',  inline: true },
            { name: `${em.COACHING} Sessions Done`, value: coaching.rows[0].done || '0',  inline: true },
          );
        return interaction.editReply({ embeds: [embed], files: [{ attachment: 'assets/logo.png', name: 'logo.png' }] });
      }

      if (sub === 'orders') {
        const { rows: [s] } = await db.query(`
          SELECT
            COUNT(*) as total,
            COUNT(*) FILTER(WHERE status='pending') as pending,
            COUNT(*) FILTER(WHERE status='paid') as paid,
            COUNT(*) FILTER(WHERE status='in_progress') as in_progress,
            COUNT(*) FILTER(WHERE status='completed') as completed,
            COUNT(*) FILTER(WHERE status='cancelled') as cancelled,
            COUNT(*) FILTER(WHERE status='disputed') as disputed
          FROM orders WHERE guild_id=$1
        `, [interaction.guild.id]);
        const embed = base(COLORS.INFO).setTitle(`${em.ORDER} Order Statistics`)
          .addFields(
            { name: 'Total',       value: s.total || '0',       inline: true },
            { name: '🟡 Pending',  value: s.pending || '0',     inline: true },
            { name: '🟢 Paid',     value: s.paid || '0',        inline: true },
            { name: '🔵 Active',   value: s.in_progress || '0', inline: true },
            { name: '✅ Done',     value: s.completed || '0',   inline: true },
            { name: '🔴 Cancelled',value: s.cancelled || '0',   inline: true },
            { name: '🟠 Disputed', value: s.disputed || '0',    inline: true },
          );
        return interaction.editReply({ embeds: [embed] });
      }

      if (sub === 'revenue') {
        if (!isStaff(interaction.member)) return interaction.editReply({ embeds: [error('Access Denied', 'Staff only.')] });
        const { rows: [s] } = await db.query(`
          SELECT
            SUM(price) FILTER(WHERE status='completed') as total,
            SUM(price) FILTER(WHERE status='completed' AND created_at > NOW() - INTERVAL '7 days') as week,
            SUM(price) FILTER(WHERE status='completed' AND created_at > NOW() - INTERVAL '30 days') as month,
            AVG(price) FILTER(WHERE status='completed') as avg
          FROM orders WHERE guild_id=$1
        `, [interaction.guild.id]);
        const embed = base(COLORS.SUCCESS).setTitle(`${em.MONEY} Revenue Statistics`)
          .addFields(
            { name: 'All Time',   value: `€${parseFloat(s.total || 0).toFixed(2)}`,  inline: true },
            { name: 'This Month', value: `€${parseFloat(s.month || 0).toFixed(2)}`,  inline: true },
            { name: 'This Week',  value: `€${parseFloat(s.week || 0).toFixed(2)}`,   inline: true },
            { name: 'Avg Order',  value: `€${parseFloat(s.avg || 0).toFixed(2)}`,    inline: true },
          );
        return interaction.editReply({ embeds: [embed] });
      }

      if (sub === 'vouches') {
        const { rows: [s] } = await db.query(`SELECT COUNT(*) as total, AVG(rating) as avg, COUNT(*) FILTER(WHERE rating=5) as five_star FROM vouches WHERE guild_id=$1`, [interaction.guild.id]);
        const embed = base(COLORS.PRIMARY).setTitle(`${em.VOUCH} Vouch Statistics`)
          .addFields(
            { name: 'Total Vouches', value: s.total || '0',   inline: true },
            { name: 'Average Rating', value: s.avg ? `${parseFloat(s.avg).toFixed(2)}/5 ⭐` : 'N/A', inline: true },
            { name: '5-Star Vouches', value: s.five_star || '0', inline: true },
          );
        return interaction.editReply({ embeds: [embed] });
      }

      if (sub === 'tickets') {
        if (!isStaff(interaction.member)) return interaction.editReply({ embeds: [error('Access Denied', 'Staff only.')] });
        const { rows: [s] } = await db.query(`SELECT COUNT(*) FILTER(WHERE status='open') as open, COUNT(*) FILTER(WHERE status='closed') as closed FROM tickets WHERE guild_id=$1`, [interaction.guild.id]);
        const embed = base(COLORS.INFO).setTitle(`${em.TICKET} Ticket Statistics`)
          .addFields(
            { name: 'Open Tickets',   value: s.open || '0',   inline: true },
            { name: 'Closed Tickets', value: s.closed || '0', inline: true },
          );
        return interaction.editReply({ embeds: [embed] });
      }

      if (sub === 'boosters') {
        if (!isStaff(interaction.member)) return interaction.editReply({ embeds: [error('Access Denied', 'Staff only.')] });
        const { rows } = await db.query(`SELECT booster_id, COUNT(*) as orders, SUM(price) as rev FROM orders WHERE status='completed' AND booster_id IS NOT NULL GROUP BY booster_id ORDER BY orders DESC LIMIT 10`);
        const embed = base(COLORS.INFO).setTitle(`${em.BOOST} Booster Performance`)
          .setDescription(rows.length ? rows.map((r, i) => `**${i+1}.** <@${r.booster_id}> — **${r.orders}** orders | €${parseFloat(r.rev).toFixed(2)}`).join('\n') : '*No data.*');
        return interaction.editReply({ embeds: [embed] });
      }

      if (sub === 'accounts') {
        if (!isStaff(interaction.member)) return interaction.editReply({ embeds: [error('Access Denied', 'Staff only.')] });
        const { rows: [s] } = await db.query(`SELECT COUNT(*) FILTER(WHERE status='available') as avail, COUNT(*) FILTER(WHERE status='sold') as sold, SUM(price) FILTER(WHERE status='sold') as rev FROM accounts`);
        const embed = base(COLORS.INFO).setTitle(`${em.ACCOUNT} Account Shop Stats`)
          .addFields(
            { name: 'Available', value: s.avail || '0', inline: true },
            { name: 'Sold',      value: s.sold || '0',  inline: true },
            { name: 'Revenue',   value: `€${parseFloat(s.rev || 0).toFixed(2)}`, inline: true },
          );
        return interaction.editReply({ embeds: [embed] });
      }

      if (sub === 'coaching') {
        const { rows: [s] } = await db.query(`SELECT COUNT(*) as total, COUNT(*) FILTER(WHERE status='completed') as done, SUM(price) FILTER(WHERE status='completed') as rev FROM coaching_sessions WHERE guild_id=$1`, [interaction.guild.id]);
        const embed = base(COLORS.INFO).setTitle(`${em.COACHING} Coaching Stats`)
          .addFields(
            { name: 'Total Sessions',     value: s.total || '0', inline: true },
            { name: 'Completed',          value: s.done || '0',  inline: true },
            { name: 'Revenue',            value: `€${parseFloat(s.rev || 0).toFixed(2)}`, inline: true },
          );
        return interaction.editReply({ embeds: [embed] });
      }

      if (sub === 'daily') {
        if (!isStaff(interaction.member)) return interaction.editReply({ embeds: [error('Access Denied', 'Staff only.')] });
        const today = `created_at > NOW() - INTERVAL '24 hours'`;
        const [o, p, t] = await Promise.all([
          db.query(`SELECT COUNT(*) as new, COUNT(*) FILTER(WHERE status='completed') as done, SUM(price) FILTER(WHERE status='completed') as rev FROM orders WHERE ${today}`),
          db.query(`SELECT COUNT(*) as paid, SUM(amount) as total FROM payments WHERE status='completed' AND ${today}`),
          db.query(`SELECT COUNT(*) as opened, COUNT(*) FILTER(WHERE status='closed') as closed FROM tickets WHERE ${today}`),
        ]);
        const embed = base(COLORS.PRIMARY).setTitle(`${em.STATS} Daily Summary`)
          .setDescription(`**Last 24 hours**`)
          .addFields(
            { name: `${em.ORDER} New Orders`,     value: o.rows[0].new || '0',   inline: true },
            { name: `${em.CHECK} Completed`,      value: o.rows[0].done || '0',  inline: true },
            { name: `${em.MONEY} Revenue`,        value: `€${parseFloat(o.rows[0].rev || 0).toFixed(2)}`, inline: true },
            { name: `${em.PAYMENT} Payments`,     value: p.rows[0].paid || '0',  inline: true },
            { name: `${em.TICKET} Tickets`,       value: `${t.rows[0].opened || 0} opened / ${t.rows[0].closed || 0} closed`, inline: true },
          );
        return interaction.editReply({ embeds: [embed] });
      }

      if (sub === 'uptime') {
        const uptimeSeconds = Math.floor(process.uptime());
        const d = Math.floor(uptimeSeconds / 86400);
        const h = Math.floor((uptimeSeconds % 86400) / 3600);
        const m = Math.floor((uptimeSeconds % 3600) / 60);
        const embed = base(COLORS.SUCCESS).setTitle(`${em.CHECK} Bot Status`)
          .addFields(
            { name: 'Uptime',    value: `${d}d ${h}h ${m}m`,                          inline: true },
            { name: 'Ping',      value: `${interaction.client.ws.ping}ms`,             inline: true },
            { name: 'Guilds',    value: String(interaction.client.guilds.cache.size),  inline: true },
            { name: 'Memory',    value: `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1)} MB`, inline: true },
          );
        return interaction.editReply({ embeds: [embed] });
      }

    } catch (err) {
      console.error('[stats]', err);
      return interaction.editReply({ embeds: [error('Error', err.message)] });
    }
  },
};
