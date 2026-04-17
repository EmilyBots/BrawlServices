// src/events/interactionCreate.js
const { Events, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const db = require('../database');
const { getEmojis, COLORS } = require('../utils/constants');
const { base, success, error } = require('../utils/embeds');
const { createTicket, closeTicket } = require('../utils/ticketManager');
const panels = require('../panels');

module.exports = {
  name: Events.InteractionCreate,

  async execute(interaction) {
    const em = getEmojis();

    // ── SLASH COMMANDS ──────────────────────────────────────────────────────
    if (interaction.isChatInputCommand()) {
      const command = interaction.client.commands.get(interaction.commandName);
      if (!command) return;
      try {
        await command.execute(interaction);
      } catch (err) {
        console.error(`[Command: ${interaction.commandName}]`, err);
        const reply = { embeds: [error('Error', err.message || 'An unexpected error occurred.')], ephemeral: true };
        if (interaction.replied || interaction.deferred) await interaction.followUp(reply).catch(() => {});
        else await interaction.reply(reply).catch(() => {});
      }
      return;
    }

    // ── BUTTON INTERACTIONS ─────────────────────────────────────────────────
    if (interaction.isButton()) {
      const id = interaction.customId;
      await interaction.deferUpdate().catch(() => {});

      // Panel navigation
      if (id === 'panel_main') return interaction.editReply(panels.mainMenuPanel());
      if (id === 'panel_prices') return interaction.editReply(panels.pricesPanel());
      if (id === 'panel_order') return interaction.editReply(panels.orderPanel());
      if (id === 'panel_ticket') return interaction.editReply({ ...panels.ticketPanel(), ephemeral: true });
      if (id === 'panel_vouches') {
        const { rows } = await db.query(`SELECT * FROM vouches WHERE guild_id=$1 ORDER BY created_at DESC LIMIT 5`, [interaction.guild.id]);
        return interaction.editReply(panels.vouchPanel(rows));
      }

      // Ticket actions
      if (id.startsWith('ticket_claim_')) {
        const channelId = id.replace('ticket_claim_', '');
        const { rows } = await db.query(`SELECT * FROM tickets WHERE channel_id=$1`, [channelId]);
        if (!rows.length) return;
        if (rows[0].claimed_by) {
          return interaction.followUp({ content: `⚠️ Already claimed by <@${rows[0].claimed_by}>`, ephemeral: true });
        }
        await db.query(`UPDATE tickets SET claimed_by=$1 WHERE channel_id=$2`, [interaction.user.id, channelId]);
        await interaction.channel.send({ embeds: [base(COLORS.INFO).setTitle(`${em.STAFF} Ticket Claimed`).setDescription(`${interaction.user} has claimed this ticket and will assist you shortly!`)] });
        return;
      }

      if (id.startsWith('ticket_close_')) {
        const channelId = id.replace('ticket_close_', '');
        const { rows } = await db.query(`SELECT * FROM tickets WHERE channel_id=$1 AND status='open'`, [channelId]);
        if (!rows.length) return;
        await closeTicket(interaction.channel, interaction.user.toString(), 'Closed via button');
        return;
      }

      // Claim order button (from booster panel)
      if (id.startsWith('claim_order_')) {
        const orderId = id.replace('claim_order_', '');
        const { rows } = await db.query(`SELECT * FROM orders WHERE id=$1`, [orderId]);
        if (!rows.length) return interaction.followUp({ content: '❌ Order not found.', ephemeral: true });
        const o = rows[0];
        if (o.booster_id) return interaction.followUp({ content: `⚠️ Already claimed by <@${o.booster_id}>`, ephemeral: true });

        await db.query(`UPDATE orders SET booster_id=$1, status='in_progress', updated_at=NOW() WHERE id=$2`, [interaction.user.id, orderId]);

        if (o.ticket_channel_id) {
          const ch = interaction.guild.channels.cache.get(o.ticket_channel_id);
          if (ch) ch.send(`⚡ **${interaction.user}** has claimed your order and will begin shortly!`);
        }

        try {
          const user = await interaction.client.users.fetch(o.user_id);
          await user.send({ embeds: [success('Booster Assigned! ⚡', `<@${interaction.user.id}> has been assigned to your order \`#${orderId.slice(0,8).toUpperCase()}\`!`)] });
        } catch {}

        await interaction.followUp({ content: `✅ You've claimed order \`#${orderId.slice(0,8).toUpperCase()}\`!`, ephemeral: true });
        // Update the message to disable button
        try {
          const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
          const disabledRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`claimed_by_${interaction.user.id}`).setLabel(`Claimed by ${interaction.user.username}`).setStyle(ButtonStyle.Success).setDisabled(true)
          );
          await interaction.message.edit({ components: [disabledRow] });
        } catch {}
        return;
      }

      // Claim coaching button
      if (id.startsWith('claim_coaching_')) {
        const sessionId = id.replace('claim_coaching_', '');
        const { rows } = await db.query(`SELECT * FROM coaching_sessions WHERE id=$1`, [sessionId]);
        if (!rows.length) return interaction.followUp({ content: '❌ Session not found.', ephemeral: true });
        if (rows[0].coach_id) return interaction.followUp({ content: `⚠️ Already claimed by <@${rows[0].coach_id}>`, ephemeral: true });

        await db.query(`UPDATE coaching_sessions SET coach_id=$1, status='in_progress' WHERE id=$2`, [interaction.user.id, sessionId]);
        await interaction.followUp({ content: `✅ You've claimed coaching session \`#${sessionId.slice(0,8).toUpperCase()}\`!`, ephemeral: true });
        return;
      }

      // Payment buttons
      if (id.startsWith('pay_')) {
        const parts = id.split('_');
        const method = parts[1];
        const orderId = parts.slice(2).join('_');

        const { rows } = await db.query(`SELECT * FROM orders WHERE id=$1`, [orderId]);
        if (!rows.length) return interaction.followUp({ content: '❌ Order not found.', ephemeral: true });
        const o = rows[0];

        if (o.user_id !== interaction.user.id)
          return interaction.followUp({ content: '❌ This payment is not for you.', ephemeral: true });

        // Build payment instructions
        let instructions = '';
        let emoji = '';
        if (method === 'applepay') {
          emoji = '🍎';
          instructions = `**Apple Pay**\nPlease contact a staff member to process your Apple Pay payment of **€${o.price}**.`;
        } else if (method === 'googlepay') {
          emoji = '🔵';
          instructions = `**Google Pay**\nPlease contact a staff member to process your Google Pay payment of **€${o.price}**.`;
        } else if (method === 'paypal') {
          emoji = em.PAYPAL.startsWith('<') ? em.PAYPAL : '💲';
          instructions = `**PayPal**\nPlease send **€${o.price}** to our PayPal and include your Order ID:\n\`#${orderId.slice(0,8).toUpperCase()}\`\n\nAfter sending, notify a staff member with your PayPal transaction ID.`;
        }

        await db.query(`UPDATE orders SET payment_method=$1 WHERE id=$2`, [method, orderId]);

        const payEmbed = base(COLORS.INFO)
          .setTitle(`${emoji} Payment Instructions`)
          .setDescription(
            `**Order:** \`#${orderId.slice(0,8).toUpperCase()}\`\n` +
            `**Amount:** **€${o.price}**\n\n` +
            instructions + `\n\n> Once payment is confirmed by staff, your order will begin!`
          );

        if (process.env.PAYMENT_LOG_CHANNEL_ID) {
          const logCh = interaction.guild.channels.cache.get(process.env.PAYMENT_LOG_CHANNEL_ID);
          if (logCh) logCh.send({ embeds: [base(COLORS.WARNING).setTitle(`💳 Payment Intent`).setDescription(`<@${interaction.user.id}> selected **${method}** for order \`#${orderId.slice(0,8).toUpperCase()}\` (€${o.price})`)] });
        }

        return interaction.followUp({ embeds: [payEmbed], ephemeral: true });
      }

      // Staff panel buttons
      if (id === 'staff_orders') {
        const { rows } = await db.query(`SELECT * FROM orders WHERE status IN ('pending','paid','in_progress') ORDER BY created_at DESC LIMIT 10`);
        const embed = base(COLORS.INFO).setTitle(`📦 Active Orders`)
          .setDescription(rows.length
            ? rows.map(o => `\`#${o.id.slice(0,8).toUpperCase()}\` <@${o.user_id}> | ${o.service_type} | ${o.status.toUpperCase()}`).join('\n')
            : '*No active orders.*'
          );
        return interaction.followUp({ embeds: [embed], ephemeral: true });
      }

      if (id === 'staff_tickets') {
        const { rows } = await db.query(`SELECT * FROM tickets WHERE guild_id=$1 AND status='open' LIMIT 15`, [interaction.guild.id]);
        const embed = base(COLORS.INFO).setTitle(`🎫 Open Tickets`)
          .setDescription(rows.length
            ? rows.map(t => `<#${t.channel_id}> <@${t.user_id}> | ${t.category}`).join('\n')
            : '*No open tickets.*'
          );
        return interaction.followUp({ embeds: [embed], ephemeral: true });
      }

      if (id === 'staff_stats') {
        const [o, v] = await Promise.all([
          db.query(`SELECT COUNT(*) as total, SUM(price) FILTER(WHERE status='completed') as rev FROM orders`),
          db.query(`SELECT COUNT(*) as total FROM vouches`),
        ]);
        const embed = base(COLORS.SUCCESS).setTitle(`📊 Quick Stats`)
          .addFields(
            { name: 'Total Orders', value: o.rows[0].total || '0', inline: true },
            { name: 'Revenue',      value: `€${parseFloat(o.rows[0].rev || 0).toFixed(2)}`, inline: true },
            { name: 'Vouches',      value: v.rows[0].total || '0', inline: true },
          );
        return interaction.followUp({ embeds: [embed], ephemeral: true });
      }

      if (id === 'staff_blacklist') {
        const { rows } = await db.query(`SELECT * FROM users WHERE banned=TRUE LIMIT 10`);
        const embed = base(COLORS.ERROR).setTitle(`🚫 Banned Users`)
          .setDescription(rows.length
            ? rows.map(u => `<@${u.id}> — *${u.ban_reason || 'No reason'}*`).join('\n')
            : '*No banned users.*'
          );
        return interaction.followUp({ embeds: [embed], ephemeral: true });
      }

      // Account buttons
      if (id === 'account_browse') {
        const { rows } = await db.query(`SELECT * FROM accounts WHERE status='available' ORDER BY price ASC LIMIT 10`);
        return interaction.followUp({ embeds: [base(COLORS.PRIMARY).setTitle(`🎮 Available Accounts`)
          .setDescription(rows.length
            ? rows.map((a, i) => `**${i+1}.** \`#${a.id.slice(0,8).toUpperCase()}\` ${a.current_rank} | ${a.brawler_count} brawlers | €${a.price}`).join('\n')
            : '*No accounts available.*'
          )], ephemeral: true });
      }

      if (id === 'account_ticket') {
        const ch = await createTicket(interaction.guild, interaction.user, 'account');
        return interaction.followUp({ content: `✅ Account enquiry ticket opened: ${ch}`, ephemeral: true });
      }

      // Vouch submit button
      if (id === 'vouch_submit') {
        const modal = new ModalBuilder()
          .setCustomId('modal_vouch_submit')
          .setTitle('Leave a Vouch');
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('vouch_rating').setLabel('Rating (1-5)').setStyle(TextInputStyle.Short).setPlaceholder('5').setMaxLength(1).setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('vouch_comment').setLabel('Your review').setStyle(TextInputStyle.Paragraph).setPlaceholder('Amazing service, very fast!').setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('vouch_order').setLabel('Order ID (optional)').setStyle(TextInputStyle.Short).setRequired(false)
          ),
        );
        return interaction.showModal(modal);
      }
    }

    // ── SELECT MENU INTERACTIONS ────────────────────────────────────────────
    if (interaction.isStringSelectMenu()) {
      const id = interaction.customId;
      await interaction.deferUpdate().catch(() => {});

      if (id === 'order_service_select') {
        const service = interaction.values[0];
        if (service === 'coaching') {
          return interaction.editReply({ embeds: [base(COLORS.INFO).setTitle(`🎓 Book Coaching`).setDescription(`Use \`/coaching book\` to book a coaching session!`)], components: [], files: [] });
        }
        if (service === 'buy_account') {
          const { rows } = await db.query(`SELECT * FROM accounts WHERE status='available' ORDER BY price ASC LIMIT 8`);
          return interaction.editReply(panels.buyAccountPanel(rows));
        }
        return interaction.editReply({
          embeds: [base(COLORS.INFO).setTitle(`📦 Place Order`).setDescription(`Use \`/order create\` with service \`${service}\` to complete your order!`)],
          components: [], files: [],
        });
      }

      if (id === 'ticket_category_select') {
        const category = interaction.values[0];
        const { rows: existing } = await db.query(`SELECT * FROM tickets WHERE user_id=$1 AND guild_id=$2 AND status='open' LIMIT 1`, [interaction.user.id, interaction.guild.id]);
        if (existing.length) {
          return interaction.followUp({ content: `⚠️ You already have an open ticket: <#${existing[0].channel_id}>`, ephemeral: true });
        }
        const ch = await createTicket(interaction.guild, interaction.user, category);
        return interaction.followUp({ content: `✅ Ticket created: ${ch}`, ephemeral: true });
      }
    }

    // ── MODAL SUBMISSIONS ───────────────────────────────────────────────────
    if (interaction.isModalSubmit()) {
      if (interaction.customId === 'modal_vouch_submit') {
        await interaction.deferReply({ ephemeral: true });
        const rating = parseInt(interaction.fields.getTextInputValue('vouch_rating'));
        const comment = interaction.fields.getTextInputValue('vouch_comment');
        const orderId = interaction.fields.getTextInputValue('vouch_order') || null;

        if (isNaN(rating) || rating < 1 || rating > 5) {
          return interaction.editReply({ embeds: [error('Invalid Rating', 'Rating must be 1-5.')] });
        }

        const { rows: [vouch] } = await db.query(
          `INSERT INTO vouches (user_id, guild_id, order_id, rating, comment) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
          [interaction.user.id, interaction.guild.id, orderId, rating, comment]
        );

        const stars = '⭐'.repeat(rating);
        if (process.env.VOUCH_CHANNEL_ID) {
          const ch = interaction.guild.channels.cache.get(process.env.VOUCH_CHANNEL_ID);
          if (ch) ch.send({ embeds: [base(COLORS.PRIMARY).setTitle(`${em.VOUCH} New Vouch ${stars}`).setDescription(`**Customer:** ${interaction.user}\n**Rating:** ${stars} (${rating}/5)\n\n> *${comment}*`).setThumbnail(interaction.user.displayAvatarURL())] });
        }

        return interaction.editReply({ embeds: [success('Vouch Submitted!', `Thank you! Your **${rating}/5 ⭐** vouch has been submitted.`)] });
      }
    }
  },
};
