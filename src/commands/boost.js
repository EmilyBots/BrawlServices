// src/commands/boost.js
const { SlashCommandBuilder } = require('discord.js');
const db = require('../database');
const { COLORS, getEmojis, PRICING } = require('../utils/constants');
const { base, success, error } = require('../utils/embeds');
const { isStaff, isBooster } = require('../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('boost')
    .setDescription('Boost tracking and management')

    .addSubcommand(s => s
      .setName('claim')
      .setDescription('[Booster] Claim an available order')
      .addStringOption(o => o.setName('order_id').setDescription('Order ID to claim').setRequired(true))
    )

    .addSubcommand(s => s
      .setName('unclaim')
      .setDescription('[Booster] Unclaim an order you no longer can do')
      .addStringOption(o => o.setName('order_id').setDescription('Order ID').setRequired(true))
      .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(false))
    )

    .addSubcommand(s => s
      .setName('update')
      .setDescription('[Booster] Post a progress update on an order')
      .addStringOption(o => o.setName('order_id').setDescription('Order ID').setRequired(true))
      .addStringOption(o => o.setName('progress').setDescription('Current progress (e.g. Gold 2 → Diamond 1)').setRequired(true))
      .addStringOption(o => o.setName('screenshot').setDescription('Screenshot URL').setRequired(false))
    )

    .addSubcommand(s => s
      .setName('complete')
      .setDescription('[Booster] Mark a boost as complete')
      .addStringOption(o => o.setName('order_id').setDescription('Order ID').setRequired(true))
      .addStringOption(o => o.setName('proof').setDescription('Proof screenshot URL').setRequired(false))
    )

    .addSubcommand(s => s
      .setName('myorders')
      .setDescription('[Booster] View your claimed orders')
      .addStringOption(o => o.setName('status').setDescription('Filter by status').setRequired(false)
        .addChoices(
          { name: 'In Progress', value: 'in_progress' },
          { name: 'Completed',   value: 'completed' },
        ))
    )

    .addSubcommand(s => s
      .setName('available')
      .setDescription('[Booster] View unclaimed paid orders')
    )

    .addSubcommand(s => s
      .setName('earnings')
      .setDescription('[Booster] View your earnings summary')
      .addStringOption(o => o.setName('period').setDescription('Period').setRequired(false)
        .addChoices(
          { name: 'This Week',  value: 'week' },
          { name: 'This Month', value: 'month' },
          { name: 'All Time',   value: 'all' },
        ))
    )

    .addSubcommand(s => s
      .setName('price')
      .setDescription('Calculate price for a boost')
      .addStringOption(o => o.setName('service').setDescription('Service type').setRequired(true)
        .addChoices(
          { name: '⚔️ Ranked Boost', value: 'ranked_boost' },
          { name: '🤝 Ranked Carry', value: 'ranked_carry' },
          { name: '🏆 Prestige Boost', value: 'prestige_boost' },
          { name: '🔥 Win Streak', value: 'winstreak_boost' },
        ))
      .addStringOption(o => o.setName('tier').setDescription('Tier key (e.g. bronze_silver, prestige_1, wins_50)').setRequired(true))
    )

    .addSubcommand(s => s
      .setName('leaderboard')
      .setDescription('Top boosters by completed orders')
    )

    .addSubcommand(s => s
      .setName('history')
      .setDescription('[Staff] Full boost history')
      .addUserOption(o => o.setName('booster').setDescription('Booster to filter').setRequired(false))
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const em = getEmojis();
    await interaction.deferReply({ ephemeral: true });

    try {
      if (sub === 'claim') {
        if (!isBooster(interaction.member))
          return interaction.editReply({ embeds: [error('Access Denied', 'Boosters only.')] });
        const id = interaction.options.getString('order_id');
        const { rows } = await db.query(`SELECT * FROM orders WHERE id=$1`, [id]);
        if (!rows.length) return interaction.editReply({ embeds: [error('Not Found', 'Order not found.')] });
        const o = rows[0];
        if (o.booster_id) return interaction.editReply({ embeds: [error('Already Claimed', `Already claimed by <@${o.booster_id}>`)] });
        if (o.payment_status !== 'paid') return interaction.editReply({ embeds: [error('Unpaid', 'This order has not been paid yet.')] });

        await db.query(`UPDATE orders SET booster_id=$1, status='in_progress', updated_at=NOW() WHERE id=$2`, [interaction.user.id, id]);

        // notify customer
        try {
          const user = await interaction.client.users.fetch(o.user_id);
          await user.send({ embeds: [success('Booster Assigned! ⚡',
            `A booster has been assigned to your order \`#${id.slice(0,8).toUpperCase()}\`!\n` +
            `**Booster:** <@${interaction.user.id}>\n**Service:** ${o.service_type}\n\nYour boost will begin shortly!`
          )] });
        } catch {}

        // notify in ticket if exists
        if (o.ticket_channel_id) {
          const ch = interaction.guild.channels.cache.get(o.ticket_channel_id);
          if (ch) ch.send(`⚡ **${interaction.user}** has claimed this order and will begin shortly!`);
        }

        return interaction.editReply({ embeds: [success('Order Claimed!', `You have claimed order \`#${id.slice(0,8).toUpperCase()}\`!\n**Service:** ${o.service_type}\n**Customer:** <@${o.user_id}>`)] });
      }

      if (sub === 'unclaim') {
        if (!isBooster(interaction.member))
          return interaction.editReply({ embeds: [error('Access Denied', 'Boosters only.')] });
        const id = interaction.options.getString('order_id');
        const reason = interaction.options.getString('reason') || 'No reason given';
        const { rows } = await db.query(`SELECT * FROM orders WHERE id=$1`, [id]);
        if (!rows.length) return interaction.editReply({ embeds: [error('Not Found', 'Order not found.')] });
        if (rows[0].booster_id !== interaction.user.id && !isStaff(interaction.member))
          return interaction.editReply({ embeds: [error('Access Denied', 'Not your order.')] });

        await db.query(`UPDATE orders SET booster_id=NULL, status='paid', updated_at=NOW() WHERE id=$1`, [id]);

        if (process.env.ORDER_LOG_CHANNEL_ID) {
          const ch = interaction.guild.channels.cache.get(process.env.ORDER_LOG_CHANNEL_ID);
          const { claimOrderPanel } = require('../panels');
          if (ch) ch.send({ content: `⚠️ Order unclaimed by <@${interaction.user.id}>. Reason: ${reason}`, ...claimOrderPanel(rows[0]) });
        }

        return interaction.editReply({ embeds: [success('Unclaimed', `Order \`#${id.slice(0,8).toUpperCase()}\` has been unclaimed and is available again.`)] });
      }

      if (sub === 'update') {
        if (!isBooster(interaction.member))
          return interaction.editReply({ embeds: [error('Access Denied', 'Boosters only.')] });
        const id = interaction.options.getString('order_id');
        const progress = interaction.options.getString('progress');
        const screenshot = interaction.options.getString('screenshot') || '';
        const { rows } = await db.query(`SELECT * FROM orders WHERE id=$1`, [id]);
        if (!rows.length) return interaction.editReply({ embeds: [error('Not Found', 'Order not found.')] });
        const o = rows[0];

        const updateEmbed = base(COLORS.INFO)
          .setTitle(`${em.REFRESH} Boost Progress Update`)
          .setDescription(
            `**Order:** \`#${id.slice(0,8).toUpperCase()}\`\n` +
            `**Customer:** <@${o.user_id}>\n` +
            `**Booster:** <@${interaction.user.id}>\n` +
            `**Progress:** ${progress}\n` +
            (screenshot ? `**Screenshot:** [Click here](${screenshot})` : '')
          );

        if (o.ticket_channel_id) {
          const ch = interaction.guild.channels.cache.get(o.ticket_channel_id);
          if (ch) await ch.send({ embeds: [updateEmbed] });
        }

        try {
          const user = await interaction.client.users.fetch(o.user_id);
          await user.send({ embeds: [updateEmbed] });
        } catch {}

        return interaction.editReply({ embeds: [success('Update Posted', 'Progress update sent to customer!')] });
      }

      if (sub === 'complete') {
        if (!isBooster(interaction.member))
          return interaction.editReply({ embeds: [error('Access Denied', 'Boosters only.')] });
        const id = interaction.options.getString('order_id');
        const proof = interaction.options.getString('proof') || '';
        const { rows } = await db.query(`SELECT * FROM orders WHERE id=$1`, [id]);
        if (!rows.length) return interaction.editReply({ embeds: [error('Not Found', 'Order not found.')] });
        const o = rows[0];
        if (o.booster_id !== interaction.user.id && !isStaff(interaction.member))
          return interaction.editReply({ embeds: [error('Access Denied', 'Not your order.')] });

        await db.query(`UPDATE orders SET status='completed', updated_at=NOW() WHERE id=$1`, [id]);

        const completedEmbed = base(COLORS.SUCCESS)
          .setTitle(`${em.CHECK} Boost Completed! 🎉`)
          .setDescription(
            `**Order:** \`#${id.slice(0,8).toUpperCase()}\`\n` +
            `**Service:** ${o.service_type}\n` +
            `**Route:** ${o.from_rank} **→** ${o.to_rank}\n` +
            (proof ? `**Proof:** [Click here](${proof})\n` : '') +
            `\nThank you for using **Brawl Services™**!\nPlease leave a vouch with \`/vouch submit\` ⭐`
          );

        if (o.ticket_channel_id) {
          const ch = interaction.guild.channels.cache.get(o.ticket_channel_id);
          if (ch) await ch.send({ embeds: [completedEmbed] });
        }

        try {
          const user = await interaction.client.users.fetch(o.user_id);
          await user.send({ embeds: [completedEmbed] });
        } catch {}

        if (process.env.ORDER_LOG_CHANNEL_ID) {
          const ch = interaction.guild.channels.cache.get(process.env.ORDER_LOG_CHANNEL_ID);
          if (ch) ch.send({ embeds: [base(COLORS.SUCCESS).setTitle(`✅ Order Completed`).setDescription(`\`#${id.slice(0,8).toUpperCase()}\` completed by <@${interaction.user.id}>`)] });
        }

        return interaction.editReply({ embeds: [success('Marked Complete!', `Order \`#${id.slice(0,8).toUpperCase()}\` completed!`)] });
      }

      if (sub === 'myorders') {
        if (!isBooster(interaction.member))
          return interaction.editReply({ embeds: [error('Access Denied', 'Boosters only.')] });
        const status = interaction.options.getString('status') || 'in_progress';
        const { rows } = await db.query(`SELECT * FROM orders WHERE booster_id=$1 AND status=$2 ORDER BY created_at DESC LIMIT 15`, [interaction.user.id, status]);
        const embed = base(COLORS.INFO).setTitle(`${em.BOOST} My Orders`)
          .setDescription(rows.length
            ? rows.map(o => `\`#${o.id.slice(0,8).toUpperCase()}\` <@${o.user_id}> | ${o.service_type} | ${o.from_rank}→${o.to_rank} | **€${o.price}**`).join('\n')
            : '*No orders found.*'
          );
        return interaction.editReply({ embeds: [embed] });
      }

      if (sub === 'available') {
        if (!isBooster(interaction.member))
          return interaction.editReply({ embeds: [error('Access Denied', 'Boosters only.')] });
        const { rows } = await db.query(`SELECT * FROM orders WHERE booster_id IS NULL AND payment_status='paid' AND status='paid' ORDER BY created_at ASC LIMIT 15`);
        const embed = base(COLORS.WARNING).setTitle(`${em.BOOST} Available Orders`)
          .setDescription(rows.length
            ? rows.map(o => `\`#${o.id.slice(0,8).toUpperCase()}\` | ${o.service_type} | ${o.from_rank}→${o.to_rank} | **€${o.price}** | <t:${Math.floor(new Date(o.created_at).getTime()/1000)}:R>`).join('\n')
            : '*No available orders right now.*'
          );
        return interaction.editReply({ embeds: [embed] });
      }

      if (sub === 'earnings') {
        if (!isBooster(interaction.member))
          return interaction.editReply({ embeds: [error('Access Denied', 'Boosters only.')] });
        const period = interaction.options.getString('period') || 'month';
        const intervals = { week: '7 days', month: '30 days', all: '99999 days' };
        const { rows: [s] } = await db.query(
          `SELECT COUNT(*) as orders, SUM(price) as total FROM orders WHERE booster_id=$1 AND status='completed' AND updated_at > NOW() - INTERVAL '${intervals[period]}'`,
          [interaction.user.id]
        );
        const embed = base(COLORS.SUCCESS).setTitle(`${em.MONEY} My Earnings (${period})`)
          .addFields(
            { name: 'Orders Completed', value: s.orders || '0',                                    inline: true },
            { name: 'Total Earnings',   value: `€${parseFloat(s.total || 0).toFixed(2)}`,           inline: true },
          )
          .setDescription(`> *Contact an admin for payout requests.*`);
        return interaction.editReply({ embeds: [embed] });
      }

      if (sub === 'price') {
        const service = interaction.options.getString('service');
        const tier = interaction.options.getString('tier');
        const [cat, type] = service.includes('ranked') ? ['ranked', service.replace('ranked_', '')] :
                            service.includes('prestige') ? ['prestige', service.replace('prestige_', '')] :
                            ['winstreak', service.replace('winstreak_', '')];
        const entry = PRICING[cat]?.[type]?.[tier];
        if (!entry) return interaction.editReply({ embeds: [error('Not Found', `No pricing found for \`${service} / ${tier}\``)] });

        const embed = base(COLORS.PRIMARY).setTitle(`${em.MONEY} Price Calculator`)
          .setDescription(`**Service:** ${service}\n**Tier:** ${entry.label}\n**Price:** **€${entry.price}**`);
        return interaction.editReply({ embeds: [embed] });
      }

      if (sub === 'leaderboard') {
        const { rows } = await db.query(
          `SELECT booster_id, COUNT(*) as completed, SUM(price) as total FROM orders WHERE status='completed' AND booster_id IS NOT NULL GROUP BY booster_id ORDER BY completed DESC LIMIT 10`
        );
        const embed = base(COLORS.PRIMARY).setTitle(`${em.CROWN} Booster Leaderboard`)
          .setDescription(rows.length
            ? rows.map((r, i) => `**${i + 1}.** <@${r.booster_id}> — **${r.completed}** orders | €${parseFloat(r.total).toFixed(2)}`).join('\n')
            : '*No data yet.*'
          );
        return interaction.editReply({ embeds: [embed] });
      }

      if (sub === 'history') {
        if (!isStaff(interaction.member)) return interaction.editReply({ embeds: [error('Access Denied', 'Staff only.')] });
        const booster = interaction.options.getUser('booster');
        const { rows } = await db.query(
          booster
            ? `SELECT * FROM orders WHERE booster_id=$1 ORDER BY created_at DESC LIMIT 20`
            : `SELECT * FROM orders WHERE booster_id IS NOT NULL ORDER BY created_at DESC LIMIT 20`,
          booster ? [booster.id] : []
        );
        const embed = base(COLORS.INFO).setTitle(`${em.STATS} Boost History`)
          .setDescription(rows.length
            ? rows.map(o => `\`#${o.id.slice(0,8).toUpperCase()}\` <@${o.booster_id}> → <@${o.user_id}> | ${o.service_type} | ${o.status.toUpperCase()}`).join('\n')
            : '*No history.*'
          );
        return interaction.editReply({ embeds: [embed] });
      }

    } catch (err) {
      console.error('[boost]', err);
      return interaction.editReply({ embeds: [error('Error', err.message)] });
    }
  },
};
