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

        await db.query(`UPDATE orders SET payment_method=$1 WHERE id=$2`, [method, orderId]);

        // ── Apple Pay / Google Pay → Stripe Checkout ────────────────────
        if (method === 'applepay' || method === 'googlepay') {
          if (!process.env.STRIPE_SECRET_KEY) {
            return interaction.followUp({ content: '❌ Stripe is not configured. Please contact staff.', ephemeral: true });
          }

          const label = method === 'applepay' ? '🍎 Apple Pay' : '🔵 Google Pay';
          const shortId = orderId.slice(0, 8).toUpperCase();

          try {
            const stripeUtil = require('../utils/stripe');
            const webUrl = process.env.WEB_URL || `http://localhost:${process.env.PORT || 3000}`;

            const { checkoutUrl, sessionId } = await stripeUtil.createCheckoutSession({
              orderId,
              amount: o.price,
              description: `Brawl Services™ – ${o.service_type} (${o.from_rank} → ${o.to_rank})`,
              returnUrl: `${webUrl}/payment/stripe/success`,
              cancelUrl: `${webUrl}/payment/cancel?order=${shortId}`,
            });

            // Store Stripe session ID
            await db.query(
              `UPDATE orders SET payment_id=$1, payment_method=$2 WHERE id=$3`,
              [sessionId, method, orderId]
            );
            await db.query(
              `INSERT INTO payments (order_id, user_id, method, amount, status, external_id)
               VALUES ($1,$2,$3,$4,'pending',$5)
               ON CONFLICT DO NOTHING`,
              [orderId, interaction.user.id, method, o.price, sessionId]
            );

            const { ActionRowBuilder: ARB, ButtonBuilder: BB, ButtonStyle: BS } = require('discord.js');
            const payRow = new ARB().addComponents(
              new BB()
                .setLabel(`Pay with ${method === 'applepay' ? 'Apple Pay' : 'Google Pay'}`)
                .setEmoji(method === 'applepay' ? '🍎' : '🔵')
                .setStyle(BS.Link)
                .setURL(checkoutUrl)
            );

            const payEmbed = base(COLORS.PRIMARY)
              .setTitle(`${label} Checkout`)
              .setDescription(
                `**Order:** \`#${shortId}\`\n` +
                `**Amount:** **€${parseFloat(o.price).toFixed(2)}**\n\n` +
                `Click the button below to pay securely.\n` +
                `${method === 'applepay' ? '🍎 **Apple Pay** will appear automatically on Apple devices.' : '🔵 **Google Pay** will appear automatically on Android/Chrome.'}\n\n` +
                `> 🔒 *Secure checkout powered by Stripe*`
              );

            if (process.env.PAYMENT_LOG_CHANNEL_ID) {
              const logCh = interaction.guild.channels.cache.get(process.env.PAYMENT_LOG_CHANNEL_ID);
              if (logCh) logCh.send({ embeds: [base(COLORS.WARNING).setTitle(`💳 ${label} Checkout Started`).setDescription(`<@${interaction.user.id}> opened ${label} checkout for order \`#${shortId}\` — **€${o.price}**`)] });
            }

            return interaction.followUp({ embeds: [payEmbed], components: [payRow], ephemeral: true });
          } catch (err) {
            console.error('[Stripe createSession]', err.message);
            return interaction.followUp({ content: `❌ Could not create ${label} checkout: ${err.message}`, ephemeral: true });
          }
        }

        // ── PayPal → real checkout link ─────────────────────────────────
        if (method === 'paypal') {
          if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET) {
            return interaction.followUp({ content: '❌ PayPal is not configured. Please contact staff.', ephemeral: true });
          }

          try {
            const paypal = require('../utils/paypal');
            const webUrl = process.env.WEB_URL || `http://localhost:${process.env.PORT || 3000}`;
            const shortId = orderId.slice(0, 8).toUpperCase();

            const { paypalOrderId, approveUrl } = await paypal.createOrder({
              orderId,
              amount: o.price,
              description: `Brawl Services™ – ${o.service_type} (${o.from_rank} → ${o.to_rank})`,
              returnUrl: `${webUrl}/payment/success?token=${encodeURIComponent(orderId)}&paypal_order_id=PAYPAL_ORDER_ID`,
              cancelUrl: `${webUrl}/payment/cancel?order=${shortId}`,
            });

            // Store the paypal order id so we can capture it on return
            await db.query(
              `UPDATE orders SET payment_id=$1, payment_method='paypal' WHERE id=$2`,
              [paypalOrderId, orderId]
            );
            await db.query(
              `INSERT INTO payments (order_id, user_id, method, amount, status, external_id)
               VALUES ($1,$2,'paypal',$3,'pending',$4)
               ON CONFLICT DO NOTHING`,
              [orderId, interaction.user.id, o.price, paypalOrderId]
            );

            const { ActionRowBuilder: ARB, ButtonBuilder: BB, ButtonStyle: BS } = require('discord.js');
            const payRow = new ARB().addComponents(
              new BB()
                .setLabel('Pay with PayPal')
                .setEmoji('💲')
                .setStyle(BS.Link)
                .setURL(approveUrl)
            );

            const payEmbed = base(COLORS.PRIMARY)
              .setTitle(`${em.PAYPAL.startsWith('<') ? em.PAYPAL : '💲'} PayPal Checkout`)
              .setDescription(
                `**Order:** \`#${shortId}\`\n` +
                `**Amount:** **€${parseFloat(o.price).toFixed(2)}**\n\n` +
                `Click the button below to pay securely via PayPal.\n` +
                `You'll be redirected back automatically after payment.\n\n` +
                `> 🔒 *Secure checkout powered by PayPal*`
              );

            if (process.env.PAYMENT_LOG_CHANNEL_ID) {
              const logCh = interaction.guild.channels.cache.get(process.env.PAYMENT_LOG_CHANNEL_ID);
              if (logCh) logCh.send({ embeds: [base(COLORS.WARNING).setTitle(`💳 PayPal Checkout Started`).setDescription(`<@${interaction.user.id}> opened PayPal checkout for order \`#${shortId}\` — **€${o.price}**`)] });
            }

            return interaction.followUp({ embeds: [payEmbed], components: [payRow], ephemeral: true });
          } catch (err) {
            console.error('[PayPal createOrder]', err?.response?.data || err.message);
            return interaction.followUp({ content: `❌ Could not create PayPal order: ${err?.response?.data?.message || err.message}`, ephemeral: true });
          }
        }
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

      // Coaching booking buttons
      if (id === 'coaching_open_booking') {
        const { coachingStep1Panel } = require('../panels/coachingBooking');
        return interaction.editReply(coachingStep1Panel());
      }

      if (id === 'coaching_view_pricing') {
        const embed = base(COLORS.PRIMARY)
          .setTitle(`${em.COACHING} Coaching Prices`)
          .setDescription(
            `${em.STAR} **Basic (1h)** — €10\n` +
            `${em.STAR}${em.STAR} **Advanced (2h)** — €18\n` +
            `${em.STAR}${em.STAR}${em.STAR} **Pro (3h)** — €25\n\n` +
            `> All sessions include post-session feedback.`
          );
        return interaction.followUp({ embeds: [embed], ephemeral: true });
      }

      if (id === 'coaching_book_back_step1') {
        const { coachingStep1Panel } = require('../panels/coachingBooking');
        return interaction.editReply(coachingStep1Panel());
      }

      if (id.startsWith('coaching_book_back_step2_')) {
        const sessionType = id.replace('coaching_book_back_step2_', '');
        const { coachingStep2Panel } = require('../panels/coachingBooking');
        return interaction.editReply(coachingStep2Panel(sessionType));
      }

      if (id.startsWith('coaching_book_back_step3_')) {
        const parts = id.replace('coaching_book_back_step3_', '').split('_');
        const sessionType = parts[0];
        const date = parts[1];
        const { coachingStep3Panel } = require('../panels/coachingBooking');
        return interaction.editReply(coachingStep3Panel(sessionType, date));
      }

      // Confirm booking button: coaching_book_confirm_<type>_<date>_<time>
      if (id.startsWith('coaching_book_confirm_')) {
        const parts = id.replace('coaching_book_confirm_', '').split('_');
        const sessionType = parts[0];
        const date = parts[1];
        const time = parts[2];
        const { PRICING } = require('../utils/constants');
        const pricing = PRICING.coaching[sessionType];
        const { v4: uuidv4 } = require('uuid');

        const scheduledAt = new Date(`${date}T${time}:00`);
        const sessionId = uuidv4();

        await db.query(
          `INSERT INTO coaching_sessions (id, user_id, guild_id, session_type, duration_hours, price, scheduled_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [sessionId, interaction.user.id, interaction.guild.id, sessionType,
           parseInt(pricing.label.match(/\d+/)?.[0] || 1), pricing.price, scheduledAt.toISOString()]
        );

        const ticketChannel = await createTicket(interaction.guild, interaction.user, 'coaching');
        await db.query(`UPDATE coaching_sessions SET ticket_channel_id=$1 WHERE id=$2`, [ticketChannel.id, sessionId]);

        const displayDate = scheduledAt.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

        await ticketChannel.send(
          `🎓 **Coaching session booked!**\n\n` +
          `**Type:** ${pricing.label}\n` +
          `**Date:** ${displayDate}\n` +
          `**Time:** ${time}:00 CET\n` +
          `**Price:** €${pricing.price}\n\n` +
          `A coach will be assigned shortly. Please complete payment below.`
        );

        const { paymentPanel } = require('../panels');
        await ticketChannel.send(paymentPanel(sessionId, pricing.price, `Coaching – ${pricing.label} on ${displayDate} at ${time}:00`));

        if (process.env.ORDER_LOG_CHANNEL_ID) {
          const logCh = interaction.guild.channels.cache.get(process.env.ORDER_LOG_CHANNEL_ID);
          if (logCh) {
            const { claimCoachingPanel } = require('../panels');
            const { rows: [s] } = await db.query(`SELECT * FROM coaching_sessions WHERE id=$1`, [sessionId]);
            if (s) logCh.send(claimCoachingPanel(s));
          }
        }

        const { success } = require('../utils/embeds');
        return interaction.editReply({
          embeds: [success('Booking Confirmed! 🎉',
            `Your coaching session has been booked!\n\n` +
            `**Session:** ${pricing.label}\n` +
            `**Date:** ${displayDate}\n` +
            `**Time:** ${time}:00 CET\n` +
            `**Price:** **€${pricing.price}**\n\n` +
            `${em.TICKET} Your ticket: ${ticketChannel}\n\n` +
            `Complete payment in the ticket to confirm your slot!`
          )],
          components: [],
          files: [],
        });
      }
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
          const { coachingStep1Panel } = require('../panels/coachingBooking');
          return interaction.editReply(coachingStep1Panel());
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

      // Coaching booking step 1 → type selected → show date picker
      if (id === 'coaching_book_type') {
        const sessionType = interaction.values[0];
        const { coachingStep2Panel } = require('../panels/coachingBooking');
        return interaction.editReply(coachingStep2Panel(sessionType));
      }

      // Coaching booking step 2 → date selected → show time picker
      if (id.startsWith('coaching_book_date_')) {
        const sessionType = id.replace('coaching_book_date_', '');
        const date = interaction.values[0];
        const { coachingStep3Panel } = require('../panels/coachingBooking');
        return interaction.editReply(coachingStep3Panel(sessionType, date));
      }

      // Coaching booking step 3 → time selected → show confirm
      if (id.startsWith('coaching_book_time_')) {
        // customId: coaching_book_time_<type>_<date>
        const rest = id.replace('coaching_book_time_', '');
        const firstUnderscore = rest.indexOf('_');
        const sessionType = rest.slice(0, firstUnderscore);
        const date = rest.slice(firstUnderscore + 1);
        const time = interaction.values[0];
        const { coachingStep4Panel } = require('../panels/coachingBooking');
        return interaction.editReply(coachingStep4Panel(sessionType, date, time));
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
