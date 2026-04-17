// src/commands/payment.js
const { SlashCommandBuilder } = require('discord.js');
const db = require('../database');
const { COLORS, getEmojis } = require('../utils/constants');
const { base, success, error } = require('../utils/embeds');
const { isStaff, isAdmin } = require('../utils/permissions');
const { paymentPanel } = require('../panels');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('payment')
    .setDescription('Payment management')

    .addSubcommand(s => s
      .setName('send')
      .setDescription('Send a payment panel for an order')
      .addStringOption(o => o.setName('order_id').setDescription('Order ID').setRequired(true))
      .addUserOption(o => o.setName('user').setDescription('DM to user (optional)').setRequired(false))
    )

    .addSubcommand(s => s
      .setName('confirm')
      .setDescription('[Staff] Manually confirm a payment')
      .addStringOption(o => o.setName('order_id').setDescription('Order ID').setRequired(true))
      .addStringOption(o => o.setName('method').setDescription('Payment method').setRequired(true)
        .addChoices(
          { name: '🍎 Apple Pay',  value: 'applepay' },
          { name: '🔵 Google Pay', value: 'googlepay' },
          { name: '💲 PayPal',     value: 'paypal' },
          { name: '💵 Manual',     value: 'manual' },
        ))
      .addStringOption(o => o.setName('reference').setDescription('Payment reference/ID').setRequired(false))
    )

    .addSubcommand(s => s
      .setName('refund')
      .setDescription('[Staff] Process a refund')
      .addStringOption(o => o.setName('order_id').setDescription('Order ID').setRequired(true))
      .addStringOption(o => o.setName('reason').setDescription('Refund reason').setRequired(true))
      .addNumberOption(o => o.setName('amount').setDescription('Amount to refund (default: full)').setRequired(false))
    )

    .addSubcommand(s => s
      .setName('history')
      .setDescription('View payment history')
      .addUserOption(o => o.setName('user').setDescription('User to lookup (staff only for others)').setRequired(false))
    )

    .addSubcommand(s => s
      .setName('status')
      .setDescription('Check payment status of an order')
      .addStringOption(o => o.setName('order_id').setDescription('Order ID').setRequired(true))
    )

    .addSubcommand(s => s
      .setName('stats')
      .setDescription('[Staff] Payment statistics')
      .addStringOption(o => o.setName('period').setDescription('Time period').setRequired(false)
        .addChoices(
          { name: 'Today',      value: 'today' },
          { name: 'This Week',  value: 'week' },
          { name: 'This Month', value: 'month' },
          { name: 'All Time',   value: 'all' },
        ))
    )

    .addSubcommand(s => s
      .setName('method')
      .setDescription('Update preferred payment method for an order')
      .addStringOption(o => o.setName('order_id').setDescription('Order ID').setRequired(true))
      .addStringOption(o => o.setName('method').setDescription('Method').setRequired(true)
        .addChoices(
          { name: '🍎 Apple Pay',  value: 'applepay' },
          { name: '🔵 Google Pay', value: 'googlepay' },
          { name: '💲 PayPal',     value: 'paypal' },
        ))
    )

    .addSubcommand(s => s
      .setName('pending')
      .setDescription('[Staff] List all pending/unpaid orders')
    )

    .addSubcommand(s => s
      .setName('log')
      .setDescription('[Staff] View recent payment log')
      .addIntegerOption(o => o.setName('limit').setDescription('How many entries').setRequired(false).setMinValue(1).setMaxValue(25))
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const em = getEmojis();
    await interaction.deferReply({ ephemeral: true });

    try {
      if (sub === 'send') {
        const id = interaction.options.getString('order_id');
        const targetUser = interaction.options.getUser('user');
        const { rows } = await db.query(`SELECT * FROM orders WHERE id=$1`, [id]);
        if (!rows.length) return interaction.editReply({ embeds: [error('Not Found', 'Order not found.')] });
        const o = rows[0];
        if (o.user_id !== interaction.user.id && !isStaff(interaction.member))
          return interaction.editReply({ embeds: [error('Access Denied', 'Not your order.')] });

        const panel = paymentPanel(id, o.price, `${o.service_type} – ${o.from_rank} → ${o.to_rank}`);
        if (targetUser) {
          try { await targetUser.send(panel); }
          catch { await interaction.channel.send(panel); }
          return interaction.editReply({ embeds: [success('Sent', `Payment panel sent.`)] });
        }
        return interaction.editReply(panel);
      }

      if (sub === 'confirm') {
        if (!isStaff(interaction.member)) return interaction.editReply({ embeds: [error('Access Denied', 'Staff only.')] });
        const id = interaction.options.getString('order_id');
        const method = interaction.options.getString('method');
        const ref = interaction.options.getString('reference') || '';

        await db.query(`UPDATE orders SET payment_status='paid', payment_method=$1, payment_id=$2, status=CASE WHEN status='pending' THEN 'paid' ELSE status END, updated_at=NOW() WHERE id=$3`, [method, ref, id]);
        await db.query(`INSERT INTO payments (order_id, user_id, method, amount, status, external_id) SELECT id, user_id, $1, price, 'completed', $2 FROM orders WHERE id=$3`, [method, ref, id]);

        // notify customer
        const { rows } = await db.query(`SELECT * FROM orders WHERE id=$1`, [id]);
        if (rows.length) {
          try {
            const user = await interaction.client.users.fetch(rows[0].user_id);
            await user.send({ embeds: [success('Payment Confirmed! ✅', `Your payment of **€${rows[0].price}** for order \`#${id.slice(0,8).toUpperCase()}\` has been confirmed!\n\nA booster will be assigned shortly.`)] });
          } catch {}
        }

        return interaction.editReply({ embeds: [success('Payment Confirmed', `Order \`#${id.slice(0,8).toUpperCase()}\` payment confirmed via **${method}**`)] });
      }

      if (sub === 'refund') {
        if (!isStaff(interaction.member)) return interaction.editReply({ embeds: [error('Access Denied', 'Staff only.')] });
        const id = interaction.options.getString('order_id');
        const reason = interaction.options.getString('reason');
        const amount = interaction.options.getNumber('amount');

        const { rows } = await db.query(`SELECT * FROM orders WHERE id=$1`, [id]);
        if (!rows.length) return interaction.editReply({ embeds: [error('Not Found', 'Order not found.')] });
        const o = rows[0];
        const refundAmount = amount || o.price;

        await db.query(`UPDATE orders SET payment_status='refunded', status='cancelled', updated_at=NOW() WHERE id=$1`, [id]);
        await db.query(`INSERT INTO payments (order_id, user_id, method, amount, status, external_id) VALUES ($1,$2,$3,$4,'refunded',$5)`,
          [id, o.user_id, o.payment_method || 'manual', -refundAmount, `refund-${id}`]);

        // log
        if (process.env.PAYMENT_LOG_CHANNEL_ID) {
          const ch = interaction.guild.channels.cache.get(process.env.PAYMENT_LOG_CHANNEL_ID);
          if (ch) ch.send({ embeds: [error('Refund Processed', `Order \`#${id.slice(0,8).toUpperCase()}\` | Amount: €${refundAmount} | Reason: ${reason} | By: ${interaction.user}`)] });
        }

        return interaction.editReply({ embeds: [success('Refund Processed', `Refund of **€${refundAmount}** processed for order \`#${id.slice(0,8).toUpperCase()}\`\n**Reason:** ${reason}`)] });
      }

      if (sub === 'history') {
        const target = interaction.options.getUser('user');
        if (target && target.id !== interaction.user.id && !isStaff(interaction.member))
          return interaction.editReply({ embeds: [error('Access Denied', 'Staff only for others.')] });
        const userId = target?.id || interaction.user.id;
        const { rows } = await db.query(`SELECT * FROM payments WHERE user_id=$1 ORDER BY created_at DESC LIMIT 15`, [userId]);
        const embed = base(COLORS.INFO).setTitle(`${em.PAYMENT} Payment History`)
          .setDescription(rows.length
            ? rows.map(p => `\`${p.id.slice(0,8).toUpperCase()}\` — **€${Math.abs(p.amount)}** | ${p.method} | ${p.status.toUpperCase()} | <t:${Math.floor(new Date(p.created_at).getTime()/1000)}:d>`).join('\n')
            : '*No payments found.*'
          );
        return interaction.editReply({ embeds: [embed] });
      }

      if (sub === 'status') {
        const id = interaction.options.getString('order_id');
        const { rows } = await db.query(`SELECT * FROM orders WHERE id=$1`, [id]);
        if (!rows.length) return interaction.editReply({ embeds: [error('Not Found', 'Order not found.')] });
        const o = rows[0];
        if (o.user_id !== interaction.user.id && !isStaff(interaction.member))
          return interaction.editReply({ embeds: [error('Access Denied', 'Not your order.')] });
        const emoji = { unpaid: '🔴', paid: '🟢', refunded: '🟡', failed: '⚫' }[o.payment_status] || '⚪';
        return interaction.editReply({ embeds: [base(COLORS.INFO)
          .setTitle(`${em.PAYMENT} Payment Status`)
          .setDescription(`**Order:** \`#${id.slice(0,8).toUpperCase()}\`\n**Status:** ${emoji} **${(o.payment_status||'unpaid').toUpperCase()}**\n**Method:** ${o.payment_method || '*Not selected*'}\n**Amount:** €${o.price}`)
        ] });
      }

      if (sub === 'stats') {
        if (!isStaff(interaction.member)) return interaction.editReply({ embeds: [error('Access Denied', 'Staff only.')] });
        const period = interaction.options.getString('period') || 'month';
        const intervals = { today: '1 day', week: '7 days', month: '30 days', all: '99999 days' };
        const { rows: [s] } = await db.query(
          `SELECT COUNT(*) as count, SUM(amount) as total, AVG(amount) as avg FROM payments WHERE status='completed' AND created_at > NOW() - INTERVAL '${intervals[period]}'`
        );
        const embed = base(COLORS.SUCCESS).setTitle(`${em.STATS} Payment Statistics (${period})`)
          .addFields(
            { name: 'Total Payments', value: s.count || '0', inline: true },
            { name: 'Total Revenue',  value: `€${parseFloat(s.total||0).toFixed(2)}`, inline: true },
            { name: 'Avg Payment',    value: `€${parseFloat(s.avg||0).toFixed(2)}`,   inline: true },
          );
        return interaction.editReply({ embeds: [embed] });
      }

      if (sub === 'method') {
        const id = interaction.options.getString('order_id');
        const method = interaction.options.getString('method');
        const { rows } = await db.query(`SELECT * FROM orders WHERE id=$1`, [id]);
        if (!rows.length) return interaction.editReply({ embeds: [error('Not Found', 'Order not found.')] });
        if (rows[0].user_id !== interaction.user.id) return interaction.editReply({ embeds: [error('Access Denied', 'Not your order.')] });
        await db.query(`UPDATE orders SET payment_method=$1 WHERE id=$2`, [method, id]);
        return interaction.editReply({ embeds: [success('Method Updated', `Payment method set to **${method}**`)] });
      }

      if (sub === 'pending') {
        if (!isStaff(interaction.member)) return interaction.editReply({ embeds: [error('Access Denied', 'Staff only.')] });
        const { rows } = await db.query(`SELECT * FROM orders WHERE payment_status='unpaid' AND status NOT IN ('cancelled','completed') ORDER BY created_at ASC LIMIT 20`);
        const embed = base(COLORS.WARNING).setTitle(`${em.PAYMENT} Pending Payments (${rows.length})`)
          .setDescription(rows.length
            ? rows.map(o => `\`#${o.id.slice(0,8).toUpperCase()}\` <@${o.user_id}> | €${o.price} | ${o.service_type} | <t:${Math.floor(new Date(o.created_at).getTime()/1000)}:R>`).join('\n')
            : '*No pending payments.*'
          );
        return interaction.editReply({ embeds: [embed] });
      }

      if (sub === 'log') {
        if (!isStaff(interaction.member)) return interaction.editReply({ embeds: [error('Access Denied', 'Staff only.')] });
        const limit = interaction.options.getInteger('limit') || 10;
        const { rows } = await db.query(`SELECT * FROM payments ORDER BY created_at DESC LIMIT $1`, [limit]);
        const embed = base(COLORS.INFO).setTitle(`${em.PAYMENT} Payment Log`)
          .setDescription(rows.length
            ? rows.map(p => `\`${p.id.slice(0,8)}\` <@${p.user_id}> | **€${Math.abs(p.amount)}** | ${p.method} | ${p.status.toUpperCase()} | <t:${Math.floor(new Date(p.created_at).getTime()/1000)}:R>`).join('\n')
            : '*No payments.*'
          );
        return interaction.editReply({ embeds: [embed] });
      }

    } catch (err) {
      console.error('[payment]', err);
      return interaction.editReply({ embeds: [error('Error', err.message)] });
    }
  },
};
