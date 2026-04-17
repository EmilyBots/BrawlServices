// src/commands/order.js
const {
  SlashCommandBuilder, PermissionFlagsBits,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');
const db = require('../database');
const { PRICING, COLORS, getEmojis, ORDER_STATUS } = require('../utils/constants');
const { base, success, error, orderEmbed } = require('../utils/embeds');
const { isStaff, isBooster } = require('../utils/permissions');
const { createTicket } = require('../utils/ticketManager');
const { paymentPanel, claimOrderPanel } = require('../panels');
const { v4: uuidv4 } = require('uuid');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('order')
    .setDescription('Manage Brawl Services orders')

    .addSubcommand(s => s
      .setName('create')
      .setDescription('Create a new boost order')
      .addStringOption(o => o.setName('service').setDescription('Service type').setRequired(true)
        .addChoices(
          { name: '⚔️ Ranked Boost', value: 'ranked_boost' },
          { name: '🤝 Ranked Carry', value: 'ranked_carry' },
          { name: '🏆 Prestige Boost', value: 'prestige_boost' },
          { name: '👑 Prestige Carry', value: 'prestige_carry' },
          { name: '🔥 Win Streak Boost', value: 'winstreak_boost' },
          { name: '🎯 Win Streak Carry', value: 'winstreak_carry' },
        ))
      .addStringOption(o => o.setName('tier').setDescription('Rank tier / win count').setRequired(true))
      .addStringOption(o => o.setName('notes').setDescription('Any extra notes').setRequired(false))
    )

    .addSubcommand(s => s
      .setName('view')
      .setDescription('View an order by ID')
      .addStringOption(o => o.setName('order_id').setDescription('Order UUID or short ID').setRequired(true))
    )

    .addSubcommand(s => s
      .setName('list')
      .setDescription('List your orders (staff: list all)')
      .addStringOption(o => o.setName('status').setDescription('Filter by status').setRequired(false)
        .addChoices(
          { name: 'Pending',      value: 'pending' },
          { name: 'Paid',         value: 'paid' },
          { name: 'In Progress',  value: 'in_progress' },
          { name: 'Completed',    value: 'completed' },
          { name: 'Cancelled',    value: 'cancelled' },
        ))
    )

    .addSubcommand(s => s
      .setName('cancel')
      .setDescription('Cancel an order')
      .addStringOption(o => o.setName('order_id').setDescription('Order ID to cancel').setRequired(true))
      .addStringOption(o => o.setName('reason').setDescription('Reason for cancellation').setRequired(false))
    )

    .addSubcommand(s => s
      .setName('assign')
      .setDescription('[Staff] Assign a booster to an order')
      .addStringOption(o => o.setName('order_id').setDescription('Order ID').setRequired(true))
      .addUserOption(o => o.setName('booster').setDescription('Booster to assign').setRequired(true))
    )

    .addSubcommand(s => s
      .setName('complete')
      .setDescription('[Staff/Booster] Mark order as complete')
      .addStringOption(o => o.setName('order_id').setDescription('Order ID').setRequired(true))
      .addStringOption(o => o.setName('proof').setDescription('Screenshot URL or notes').setRequired(false))
    )

    .addSubcommand(s => s
      .setName('dispute')
      .setDescription('Open a dispute for an order')
      .addStringOption(o => o.setName('order_id').setDescription('Order ID').setRequired(true))
      .addStringOption(o => o.setName('reason').setDescription('Dispute reason').setRequired(true))
    )

    .addSubcommand(s => s
      .setName('status')
      .setDescription('[Staff] Update order status manually')
      .addStringOption(o => o.setName('order_id').setDescription('Order ID').setRequired(true))
      .addStringOption(o => o.setName('status').setDescription('New status').setRequired(true)
        .addChoices(
          { name: 'Pending',      value: 'pending' },
          { name: 'Paid',         value: 'paid' },
          { name: 'In Progress',  value: 'in_progress' },
          { name: 'Completed',    value: 'completed' },
          { name: 'Cancelled',    value: 'cancelled' },
          { name: 'Disputed',     value: 'disputed' },
        ))
    )

    .addSubcommand(s => s
      .setName('pay')
      .setDescription('Send payment panel for an order')
      .addStringOption(o => o.setName('order_id').setDescription('Order ID').setRequired(true))
    )

    .addSubcommand(s => s
      .setName('history')
      .setDescription('View full order history for a user')
      .addUserOption(o => o.setName('user').setDescription('User to lookup (staff only for others)').setRequired(false))
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const em = getEmojis();
    await interaction.deferReply({ ephemeral: true });

    try {
      // ── create ─────────────────────────────────────────────────────────
      if (sub === 'create') {
        const service = interaction.options.getString('service');
        const tier = interaction.options.getString('tier');
        const notes = interaction.options.getString('notes') || '';

        // resolve price
        const [cat, type] = service.includes('ranked') ? ['ranked', service.replace('ranked_','')] :
                             service.includes('prestige') ? ['prestige', service.replace('prestige_','')] :
                             ['winstreak', service.replace('winstreak_','')];

        const pricingMap = PRICING[cat]?.[type] || PRICING[cat]?.boost;
        const entry = pricingMap?.[tier] || Object.values(pricingMap || {})[0];
        const price = entry?.price || 0;
        const label = entry?.label || tier;

        const [fromRank, toRank] = label.includes('→') ? label.split('→').map(s => s.trim()) : [label, label];

        const orderId = uuidv4();
        await db.query(
          `INSERT INTO orders (id, user_id, guild_id, service_type, boost_type, from_rank, to_rank, price, notes)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [orderId, interaction.user.id, interaction.guild.id, service, type, fromRank, toRank, price, notes]
        );

        // open ticket
        const ticketChannel = await createTicket(interaction.guild, interaction.user, 'order', orderId);

        await db.query(`UPDATE orders SET ticket_channel_id=$1 WHERE id=$2`, [ticketChannel.id, orderId]);

        const embed = success('Order Created!',
          `Your order has been created successfully!\n\n` +
          `**Order ID:** \`#${orderId.slice(0,8).toUpperCase()}\`\n` +
          `**Service:** ${service}\n` +
          `**Route:** ${fromRank} **→** ${toRank}\n` +
          `**Price:** **€${price.toFixed(2)}**\n\n` +
          `${em.TICKET} Your ticket: ${ticketChannel}\n\n` +
          `Please proceed to payment in the ticket!`
        );

        // send payment panel inside ticket
        await ticketChannel.send(paymentPanel(orderId, price, `${service} – ${fromRank} → ${toRank}`));

        // notify boosters
        if (process.env.ORDER_LOG_CHANNEL_ID) {
          const logCh = interaction.guild.channels.cache.get(process.env.ORDER_LOG_CHANNEL_ID);
          if (logCh) {
            const orderRow = await db.query(`SELECT * FROM orders WHERE id=$1`, [orderId]);
            logCh.send({ ...claimOrderPanel(orderRow.rows[0]) });
          }
        }

        return interaction.editReply({ embeds: [embed] });
      }

      // ── view ───────────────────────────────────────────────────────────
      if (sub === 'view') {
        const id = interaction.options.getString('order_id');
        const { rows } = await db.query(
          `SELECT * FROM orders WHERE id=$1 OR id::text LIKE $2`,
          [id.length === 36 ? id : '00000000-0000-0000-0000-000000000000', `%${id.toUpperCase()}%`]
        );
        if (!rows.length) return interaction.editReply({ embeds: [error('Not Found', 'No order found with that ID.')] });
        const order = rows[0];
        if (order.user_id !== interaction.user.id && !isStaff(interaction.member))
          return interaction.editReply({ embeds: [error('Access Denied', 'You can only view your own orders.')] });
        return interaction.editReply({ embeds: [orderEmbed(order)] });
      }

      // ── list ───────────────────────────────────────────────────────────
      if (sub === 'list') {
        const statusFilter = interaction.options.getString('status');
        const staff = isStaff(interaction.member);
        let query, params;
        if (staff) {
          query = statusFilter
            ? `SELECT * FROM orders WHERE status=$1 ORDER BY created_at DESC LIMIT 15`
            : `SELECT * FROM orders ORDER BY created_at DESC LIMIT 15`;
          params = statusFilter ? [statusFilter] : [];
        } else {
          query = statusFilter
            ? `SELECT * FROM orders WHERE user_id=$1 AND status=$2 ORDER BY created_at DESC LIMIT 10`
            : `SELECT * FROM orders WHERE user_id=$1 ORDER BY created_at DESC LIMIT 10`;
          params = statusFilter ? [interaction.user.id, statusFilter] : [interaction.user.id];
        }
        const { rows } = await db.query(query, params);
        if (!rows.length) return interaction.editReply({ embeds: [error('No Orders', 'No orders found.')] });

        const embed = base(COLORS.PRIMARY)
          .setTitle(`${em.ORDER} Orders`)
          .setDescription(rows.map(o =>
            `**#${o.id.slice(0,8).toUpperCase()}** — ${o.service_type} | €${o.price} | ${o.status.toUpperCase()} | <@${o.user_id}>`
          ).join('\n'));
        return interaction.editReply({ embeds: [embed] });
      }

      // ── cancel ─────────────────────────────────────────────────────────
      if (sub === 'cancel') {
        const id = interaction.options.getString('order_id');
        const reason = interaction.options.getString('reason') || 'No reason';
        const { rows } = await db.query(`SELECT * FROM orders WHERE id=$1`, [id]);
        if (!rows.length) return interaction.editReply({ embeds: [error('Not Found', 'Order not found.')] });
        const o = rows[0];
        if (o.user_id !== interaction.user.id && !isStaff(interaction.member))
          return interaction.editReply({ embeds: [error('Access Denied', 'Not your order.')] });
        if (['completed','cancelled'].includes(o.status))
          return interaction.editReply({ embeds: [error('Cannot Cancel', `Order is already **${o.status}**.`)] });

        await db.query(`UPDATE orders SET status='cancelled', updated_at=NOW() WHERE id=$1`, [id]);
        return interaction.editReply({ embeds: [success('Order Cancelled', `Order \`#${id.slice(0,8).toUpperCase()}\` has been cancelled.\n**Reason:** ${reason}`)] });
      }

      // ── assign ─────────────────────────────────────────────────────────
      if (sub === 'assign') {
        if (!isStaff(interaction.member)) return interaction.editReply({ embeds: [error('Access Denied', 'Staff only.')] });
        const id = interaction.options.getString('order_id');
        const booster = interaction.options.getUser('booster');
        await db.query(`UPDATE orders SET booster_id=$1, status='in_progress', updated_at=NOW() WHERE id=$2`, [booster.id, id]);
        return interaction.editReply({ embeds: [success('Booster Assigned', `<@${booster.id}> assigned to order \`#${id.slice(0,8).toUpperCase()}\``)] });
      }

      // ── complete ───────────────────────────────────────────────────────
      if (sub === 'complete') {
        if (!isBooster(interaction.member)) return interaction.editReply({ embeds: [error('Access Denied', 'Boosters only.')] });
        const id = interaction.options.getString('order_id');
        const proof = interaction.options.getString('proof') || '';
        const { rows } = await db.query(`SELECT * FROM orders WHERE id=$1`, [id]);
        if (!rows.length) return interaction.editReply({ embeds: [error('Not Found', 'Order not found.')] });
        const o = rows[0];
        if (o.booster_id !== interaction.user.id && !isStaff(interaction.member))
          return interaction.editReply({ embeds: [error('Access Denied', 'Not your order to complete.')] });

        await db.query(`UPDATE orders SET status='completed', updated_at=NOW() WHERE id=$1`, [id]);

        // DM customer
        try {
          const customer = await interaction.client.users.fetch(o.user_id);
          await customer.send({
            embeds: [success('Order Completed! 🎉',
              `Your order \`#${id.slice(0,8).toUpperCase()}\` has been completed!\n\n` +
              `**Service:** ${o.service_type}\n**Route:** ${o.from_rank} → ${o.to_rank}\n\n` +
              `Please leave a vouch using \`/vouch submit\`! ${em.STAR}`)],
          });
        } catch {}

        return interaction.editReply({ embeds: [success('Order Completed', `Order \`#${id.slice(0,8).toUpperCase()}\` marked as completed!${proof ? `\n**Proof:** ${proof}` : ''}`)] });
      }

      // ── dispute ────────────────────────────────────────────────────────
      if (sub === 'dispute') {
        const id = interaction.options.getString('order_id');
        const reason = interaction.options.getString('reason');
        const { rows } = await db.query(`SELECT * FROM orders WHERE id=$1`, [id]);
        if (!rows.length) return interaction.editReply({ embeds: [error('Not Found', 'Order not found.')] });
        if (rows[0].user_id !== interaction.user.id) return interaction.editReply({ embeds: [error('Access Denied', 'Not your order.')] });

        await db.query(`UPDATE orders SET status='disputed', updated_at=NOW() WHERE id=$1`, [id]);
        const ticketCh = await createTicket(interaction.guild, interaction.user, 'order', id);
        await ticketCh.send(`🚨 **Dispute opened for order \`#${id.slice(0,8).toUpperCase()}\`**\n**Reason:** ${reason}`);

        return interaction.editReply({ embeds: [success('Dispute Opened', `A dispute has been opened. Staff will contact you in ${ticketCh}.`)] });
      }

      // ── status ─────────────────────────────────────────────────────────
      if (sub === 'status') {
        if (!isStaff(interaction.member)) return interaction.editReply({ embeds: [error('Access Denied', 'Staff only.')] });
        const id = interaction.options.getString('order_id');
        const newStatus = interaction.options.getString('status');
        await db.query(`UPDATE orders SET status=$1, updated_at=NOW() WHERE id=$2`, [newStatus, id]);
        return interaction.editReply({ embeds: [success('Status Updated', `Order \`#${id.slice(0,8).toUpperCase()}\` → **${newStatus.toUpperCase()}**`)] });
      }

      // ── pay ────────────────────────────────────────────────────────────
      if (sub === 'pay') {
        const id = interaction.options.getString('order_id');
        const { rows } = await db.query(`SELECT * FROM orders WHERE id=$1`, [id]);
        if (!rows.length) return interaction.editReply({ embeds: [error('Not Found', 'Order not found.')] });
        const o = rows[0];
        if (o.user_id !== interaction.user.id) return interaction.editReply({ embeds: [error('Access Denied', 'Not your order.')] });
        const panel = paymentPanel(id, o.price, `${o.service_type} – ${o.from_rank} → ${o.to_rank}`);
        return interaction.editReply(panel);
      }

      // ── history ────────────────────────────────────────────────────────
      if (sub === 'history') {
        const target = interaction.options.getUser('user');
        if (target && target.id !== interaction.user.id && !isStaff(interaction.member))
          return interaction.editReply({ embeds: [error('Access Denied', 'Staff only for other users.')] });
        const userId = target?.id || interaction.user.id;
        const { rows } = await db.query(
          `SELECT * FROM orders WHERE user_id=$1 ORDER BY created_at DESC LIMIT 20`, [userId]
        );
        const embed = base(COLORS.INFO)
          .setTitle(`${em.STATS} Order History — <@${userId}>`)
          .setDescription(rows.length
            ? rows.map(o => `**#${o.id.slice(0,8).toUpperCase()}** ${o.service_type} | **€${o.price}** | ${o.status.toUpperCase()} | <t:${Math.floor(new Date(o.created_at).getTime()/1000)}:d>`).join('\n')
            : '*No orders found.*'
          );
        return interaction.editReply({ embeds: [embed] });
      }

    } catch (err) {
      console.error('[order command]', err);
      return interaction.editReply({ embeds: [error('Error', err.message || 'An unexpected error occurred.')] });
    }
  },
};
