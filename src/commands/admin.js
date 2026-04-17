// src/commands/admin.js
const { SlashCommandBuilder } = require('discord.js');
const db = require('../database');
const { COLORS, getEmojis } = require('../utils/constants');
const { base, success, error } = require('../utils/embeds');
const { isAdmin } = require('../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('admin')
    .setDescription('Admin-only management commands')

    .addSubcommand(s => s
      .setName('announce')
      .setDescription('Send an announcement embed')
      .addStringOption(o => o.setName('title').setDescription('Announcement title').setRequired(true))
      .addStringOption(o => o.setName('message').setDescription('Announcement content (supports Discord markdown)').setRequired(true))
      .addChannelOption(o => o.setName('channel').setDescription('Target channel').setRequired(false))
      .addStringOption(o => o.setName('ping').setDescription('Role to ping').setRequired(false))
    )

    .addSubcommand(s => s
      .setName('purge')
      .setDescription('Bulk delete messages')
      .addIntegerOption(o => o.setName('amount').setDescription('Number of messages (1-100)').setRequired(true).setMinValue(1).setMaxValue(100))
      .addChannelOption(o => o.setName('channel').setDescription('Target channel').setRequired(false))
    )

    .addSubcommand(s => s
      .setName('setprice')
      .setDescription('Override a pricing entry')
      .addStringOption(o => o.setName('category').setDescription('Category').setRequired(true)
        .addChoices(
          { name: 'Ranked Boost',    value: 'ranked_boost' },
          { name: 'Ranked Carry',    value: 'ranked_carry' },
          { name: 'Prestige Boost',  value: 'prestige_boost' },
          { name: 'Win Streak Boost',value: 'winstreak_boost' },
        ))
      .addStringOption(o => o.setName('tier').setDescription('Tier key (e.g. bronze_silver)').setRequired(true))
      .addNumberOption(o => o.setName('price').setDescription('New price in EUR').setRequired(true))
    )

    .addSubcommand(s => s
      .setName('db')
      .setDescription('Run a safe read-only DB query')
      .addStringOption(o => o.setName('query').setDescription('SELECT query only').setRequired(true))
    )

    .addSubcommand(s => s
      .setName('maintenance')
      .setDescription('Toggle maintenance mode message')
      .addBooleanOption(o => o.setName('enabled').setDescription('Enable or disable').setRequired(true))
    )

    .addSubcommand(s => s
      .setName('resetorder')
      .setDescription('Hard reset an order status and payment')
      .addStringOption(o => o.setName('order_id').setDescription('Order ID').setRequired(true))
    )

    .addSubcommand(s => s
      .setName('clearticketchannel')
      .setDescription('Force-close stale ticket channels (older than N days)')
      .addIntegerOption(o => o.setName('days').setDescription('Age in days').setRequired(true).setMinValue(1))
    )

    .addSubcommand(s => s
      .setName('exportorders')
      .setDescription('Export orders as CSV')
      .addStringOption(o => o.setName('status').setDescription('Filter status').setRequired(false))
    )

    .addSubcommand(s => s
      .setName('config')
      .setDescription('View current bot configuration')
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const em = getEmojis();
    await interaction.deferReply({ ephemeral: true });

    if (!isAdmin(interaction.member))
      return interaction.editReply({ embeds: [error('Access Denied', 'Admin only.')] });

    try {
      if (sub === 'announce') {
        const title = interaction.options.getString('title');
        const message = interaction.options.getString('message');
        const ch = interaction.options.getChannel('channel') || interaction.channel;
        const ping = interaction.options.getString('ping') || '';

        const embed = base(COLORS.PRIMARY)
          .setTitle(`📣 ${title}`)
          .setDescription(message)
          .setThumbnail('attachment://logo.png');

        await ch.send({
          content: ping || undefined,
          embeds: [embed],
          files: [{ attachment: 'assets/logo.png', name: 'logo.png' }],
        });
        return interaction.editReply({ embeds: [success('Announced', `Announcement sent to ${ch}`)] });
      }

      if (sub === 'purge') {
        const amount = interaction.options.getInteger('amount');
        const ch = interaction.options.getChannel('channel') || interaction.channel;
        const deleted = await ch.bulkDelete(amount, true);
        return interaction.editReply({ embeds: [success('Purged', `Deleted **${deleted.size}** messages from ${ch}`)] });
      }

      if (sub === 'setprice') {
        const category = interaction.options.getString('category');
        const tier = interaction.options.getString('tier');
        const price = interaction.options.getNumber('price');
        const { PRICING } = require('../utils/constants');
        const [cat, type] = category.includes('ranked') ? ['ranked', category.replace('ranked_', '')] :
                            category.includes('prestige') ? ['prestige', category.replace('prestige_', '')] :
                            ['winstreak', category.replace('winstreak_', '')];
        if (PRICING[cat]?.[type]?.[tier]) {
          PRICING[cat][type][tier].price = price;
          return interaction.editReply({ embeds: [success('Price Updated', `\`${category}/${tier}\` → **€${price}**\n\n> ⚠️ Note: This is runtime-only. Restart resets prices. Edit \`constants.js\` for permanent changes.`)] });
        }
        return interaction.editReply({ embeds: [error('Not Found', `Tier \`${tier}\` not found in \`${category}\``)] });
      }

      if (sub === 'db') {
        const query = interaction.options.getString('query').trim();
        if (!query.toLowerCase().startsWith('select'))
          return interaction.editReply({ embeds: [error('Forbidden', 'Only SELECT queries are allowed.')] });
        const { rows } = await db.query(query);
        const result = JSON.stringify(rows.slice(0, 5), null, 2).slice(0, 1800);
        return interaction.editReply({ embeds: [base(COLORS.INFO).setTitle(`${em.STATS} DB Result`).setDescription(`\`\`\`json\n${result}\n\`\`\``)] });
      }

      if (sub === 'maintenance') {
        const enabled = interaction.options.getBoolean('enabled');
        if (enabled) {
          await interaction.guild.channels.cache.forEach(ch => {
            if (ch.isTextBased?.()) {
              ch.send({ embeds: [base(COLORS.WARNING).setTitle('⚠️ Maintenance Mode').setDescription('**Brawl Services™** is currently undergoing maintenance. We\'ll be back soon!\n\n> *Thank you for your patience.*')] }).catch(() => {});
            }
          });
        }
        return interaction.editReply({ embeds: [success('Maintenance', `Maintenance mode **${enabled ? 'enabled' : 'disabled'}**.`)] });
      }

      if (sub === 'resetorder') {
        const id = interaction.options.getString('order_id');
        await db.query(`UPDATE orders SET status='pending', payment_status='unpaid', booster_id=NULL, payment_method=NULL, payment_id=NULL, updated_at=NOW() WHERE id=$1`, [id]);
        return interaction.editReply({ embeds: [success('Order Reset', `Order \`#${id.slice(0,8).toUpperCase()}\` has been reset to pending/unpaid.`)] });
      }

      if (sub === 'clearticketchannel') {
        const days = interaction.options.getInteger('days');
        const { rows } = await db.query(`SELECT * FROM tickets WHERE status='open' AND created_at < NOW() - INTERVAL '${days} days'`);
        let closed = 0;
        for (const ticket of rows) {
          const ch = interaction.guild.channels.cache.get(ticket.channel_id);
          if (ch) { await ch.delete().catch(() => {}); closed++; }
          await db.query(`UPDATE tickets SET status='closed', closed_at=NOW() WHERE channel_id=$1`, [ticket.channel_id]);
        }
        return interaction.editReply({ embeds: [success('Cleared', `Closed and deleted **${closed}** stale ticket channels older than ${days} days.`)] });
      }

      if (sub === 'exportorders') {
        const status = interaction.options.getString('status');
        const { rows } = await db.query(
          status ? `SELECT * FROM orders WHERE status=$1 ORDER BY created_at DESC` : `SELECT * FROM orders ORDER BY created_at DESC`,
          status ? [status] : []
        );
        if (!rows.length) return interaction.editReply({ embeds: [error('No Data', 'No orders found.')] });

        const headers = ['id', 'user_id', 'service_type', 'boost_type', 'from_rank', 'to_rank', 'price', 'status', 'payment_status', 'booster_id', 'created_at'];
        const csv = [headers.join(','), ...rows.map(r => headers.map(h => `"${r[h] || ''}"`).join(','))].join('\n');

        return interaction.editReply({
          embeds: [success('Export Ready', `Exported **${rows.length}** orders.`)],
          files: [{ attachment: Buffer.from(csv), name: `orders-export-${Date.now()}.csv` }],
        });
      }

      if (sub === 'config') {
        const embed = base(COLORS.INFO).setTitle(`${em.STAFF} Bot Configuration`)
          .addFields(
            { name: 'Guild ID',          value: process.env.GUILD_ID || '*Not set*',                  inline: true },
            { name: 'Client ID',         value: process.env.CLIENT_ID || '*Not set*',                 inline: true },
            { name: 'DB Connected',      value: '✅',                                                  inline: true },
            { name: 'Admin Role',        value: process.env.ADMIN_ROLE_ID ? `<@&${process.env.ADMIN_ROLE_ID}>` : '*Not set*', inline: true },
            { name: 'Staff Role',        value: process.env.STAFF_ROLE_ID ? `<@&${process.env.STAFF_ROLE_ID}>` : '*Not set*', inline: true },
            { name: 'Booster Role',      value: process.env.BOOSTER_ROLE_ID ? `<@&${process.env.BOOSTER_ROLE_ID}>` : '*Not set*', inline: true },
            { name: 'Ticket Category',   value: process.env.TICKET_CATEGORY_ID || '*Not set*',        inline: true },
            { name: 'Order Log Channel', value: process.env.ORDER_LOG_CHANNEL_ID ? `<#${process.env.ORDER_LOG_CHANNEL_ID}>` : '*Not set*', inline: true },
            { name: 'Vouch Channel',     value: process.env.VOUCH_CHANNEL_ID ? `<#${process.env.VOUCH_CHANNEL_ID}>` : '*Not set*', inline: true },
          );
        return interaction.editReply({ embeds: [embed] });
      }

    } catch (err) {
      console.error('[admin]', err);
      return interaction.editReply({ embeds: [error('Error', err.message)] });
    }
  },
};
