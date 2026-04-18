// src/events/interactionCreate.js
const { Events, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const db = require('../database');
const { getEmojis, COLORS } = require('../utils/constants');
const { base, success, error } = require('../utils/embeds');
const { createTicket, closeTicket } = require('../utils/ticketManager');
const panels = require('../panels');

const APP_QUESTIONS = {
  staff:   ['What is your age and timezone?', 'Hours per week available for staff duties?', 'Previous Discord mod/staff experience?', 'Why do you want to be Staff at Brawl Services™?', 'How would you handle a customer vs booster dispute?'],
  booster: ['Current rank and highest rank reached?', 'Hours per week available for boosting?', 'Previous boosting experience?', 'Best brawlers and game modes?', 'Why do you want to boost for Brawl Services™?'],
  coach:   ['Current rank and highest rank reached?', 'Previous coaching or teaching experience?', 'Sessions per week you can take on?', 'Describe your coaching style and approach.', 'Why do you want to coach for Brawl Services™?'],
};

module.exports = {
  name: Events.InteractionCreate,

  async execute(interaction) {
    const em = getEmojis();

    // ─────────────────────────────────────────────────────────────────────────
    // SLASH COMMANDS
    // ─────────────────────────────────────────────────────────────────────────
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

    // ─────────────────────────────────────────────────────────────────────────
    // BUTTONS
    // ─────────────────────────────────────────────────────────────────────────
    if (interaction.isButton()) {
      const id = interaction.customId;

      // --- Buttons that need showModal BEFORE deferUpdate ---
      if (id === 'vouch_submit') {
        const modal = new ModalBuilder().setCustomId('modal_vouch_submit').setTitle('Leave a Vouch');
        modal.addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('vouch_rating').setLabel('Rating (1-5)').setStyle(TextInputStyle.Short).setPlaceholder('5').setMaxLength(1).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('vouch_comment').setLabel('Your review').setStyle(TextInputStyle.Paragraph).setPlaceholder('Amazing service, very fast!').setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('vouch_order').setLabel('Order ID (optional)').setStyle(TextInputStyle.Short).setRequired(false)),
        );
        return interaction.showModal(modal);
      }

      if (id === 'app_apply_staff' || id === 'app_apply_booster' || id === 'app_apply_coach') {
        const type = id.replace('app_apply_', '');
        const { rows: existing } = await db.query(
          `SELECT id FROM applications WHERE user_id=$1 AND guild_id=$2 AND type=$3 AND status='pending'`,
          [interaction.user.id, interaction.guild.id, type]
        );
        if (existing.length)
          return interaction.reply({ content: `⚠️ You already have a pending **${type}** application! You'll be DM'd with the decision.`, ephemeral: true });

        const qs = APP_QUESTIONS[type];
        const { ModalBuilder: MB, TextInputBuilder: TIB, TextInputStyle: TIS, ActionRowBuilder: ARB } = require('discord.js');
        const modal = new MB().setCustomId(`app_modal_${type}`).setTitle(`${type.charAt(0).toUpperCase() + type.slice(1)} Application`);
        modal.addComponents(
          new ARB().addComponents(new TIB().setCustomId('q1').setLabel(qs[0].slice(0, 45)).setStyle(TIS.Short).setRequired(true).setMaxLength(200)),
          new ARB().addComponents(new TIB().setCustomId('q2').setLabel(qs[1].slice(0, 45)).setStyle(TIS.Short).setRequired(true).setMaxLength(200)),
          new ARB().addComponents(new TIB().setCustomId('q3').setLabel(qs[2].slice(0, 45)).setStyle(TIS.Paragraph).setRequired(true).setMaxLength(500)),
          new ARB().addComponents(new TIB().setCustomId('q4').setLabel(qs[3].slice(0, 45)).setStyle(TIS.Paragraph).setRequired(true).setMaxLength(500)),
          new ARB().addComponents(new TIB().setCustomId('q5').setLabel(qs[4].slice(0, 45)).setStyle(TIS.Paragraph).setRequired(true).setMaxLength(500)),
        );
        return interaction.showModal(modal);
      }

      if (id.startsWith('app_decline_') && !id.startsWith('app_decline_reason_')) {
        const ownerId = process.env.OWNER_ID;
        if (ownerId && interaction.user.id !== ownerId)
          return interaction.reply({ content: `❌ Only the **server owner** can decline applications.`, ephemeral: true });
        const appId = id.replace('app_decline_', '');
        const modal = new ModalBuilder().setCustomId(`app_decline_reason_${appId}`).setTitle('Decline Reason');
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('reason').setLabel('Reason for declining (sent to applicant)').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(500).setPlaceholder('Optional — leave blank for no reason')
          )
        );
        return interaction.showModal(modal);
      }

      // --- All other buttons: deferUpdate first ---
      try {
        await interaction.deferUpdate();
      } catch {
        return;
      }

      try {
        // Panel navigation
        if (id === 'panel_main')    return interaction.editReply(panels.mainMenuPanel());
        if (id === 'panel_prices')  return interaction.editReply(panels.pricesPanel());
        if (id === 'panel_order')   return interaction.editReply(panels.orderPanel());
        if (id === 'panel_ticket')  return interaction.editReply(panels.ticketPanel());
        if (id === 'panel_vouches') return interaction.editReply(panels.vouchPanel());

        // Ticket actions
        if (id.startsWith('ticket_claim_')) {
          const channelId = id.replace('ticket_claim_', '');
          const { rows } = await db.query(`SELECT * FROM tickets WHERE channel_id=$1`, [channelId]);
          if (!rows.length) return;
          if (rows[0].claimed_by) return interaction.followUp({ content: `⚠️ Already claimed by <@${rows[0].claimed_by}>`, ephemeral: true });
          await db.query(`UPDATE tickets SET claimed_by=$1 WHERE channel_id=$2`, [interaction.user.id, channelId]);
          await interaction.channel.send({ embeds: [base(COLORS.INFO).setTitle(`${em.STAFF} Ticket Claimed`).setDescription(`${interaction.user} has claimed this ticket!`)] });
          return;
        }

        if (id.startsWith('ticket_close_')) {
          const { rows } = await db.query(`SELECT * FROM tickets WHERE channel_id=$1 AND status='open'`, [interaction.channel.id]);
          if (!rows.length) return;
          return closeTicket(interaction.channel, interaction.user.toString(), 'Closed via button');
        }

        // Claim order
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
            await user.send({ embeds: [success('Booster Assigned! ⚡', `<@${interaction.user.id}> assigned to order \`#${orderId.slice(0,8).toUpperCase()}\`!`)] });
          } catch {}
          try {
            const { ActionRowBuilder: ARB, ButtonBuilder: BB, ButtonStyle: BS } = require('discord.js');
            await interaction.message.edit({ components: [new ARB().addComponents(new BB().setCustomId(`claimed_${interaction.user.id}`).setLabel(`Claimed by ${interaction.user.username}`).setStyle(BS.Success).setDisabled(true))] });
          } catch {}
          return interaction.followUp({ content: `✅ You've claimed order \`#${orderId.slice(0,8).toUpperCase()}\`!`, ephemeral: true });
        }

        // Claim coaching
        if (id.startsWith('claim_coaching_')) {
          const sessionId = id.replace('claim_coaching_', '');
          const { rows } = await db.query(`SELECT * FROM coaching_sessions WHERE id=$1`, [sessionId]);
          if (!rows.length) return interaction.followUp({ content: '❌ Session not found.', ephemeral: true });
          if (rows[0].coach_id) return interaction.followUp({ content: `⚠️ Already claimed by <@${rows[0].coach_id}>`, ephemeral: true });
          await db.query(`UPDATE coaching_sessions SET coach_id=$1, status='in_progress' WHERE id=$2`, [interaction.user.id, sessionId]);
          return interaction.followUp({ content: `✅ You've claimed coaching session \`#${sessionId.slice(0,8).toUpperCase()}\`!`, ephemeral: true });
        }

        // Payment buttons
        if (id.startsWith('pay_')) {
          const parts = id.split('_');
          const method = parts[1];
          const orderId = parts.slice(2).join('_');
          const { rows } = await db.query(`SELECT * FROM orders WHERE id=$1`, [orderId]);
          if (!rows.length) return interaction.followUp({ content: '❌ Order not found.', ephemeral: true });
          const o = rows[0];
          if (o.user_id !== interaction.user.id) return interaction.followUp({ content: '❌ This payment is not for you.', ephemeral: true });
          await db.query(`UPDATE orders SET payment_method=$1 WHERE id=$2`, [method, orderId]);

          if (method === 'applepay' || method === 'googlepay') {
            if (!process.env.STRIPE_SECRET_KEY) return interaction.followUp({ content: '❌ Stripe not configured. Contact staff.', ephemeral: true });
            const label = method === 'applepay' ? '🍎 Apple Pay' : '🔵 Google Pay';
            const shortId = orderId.slice(0, 8).toUpperCase();
            try {
              const stripeUtil = require('../utils/stripe');
              const webUrl = process.env.WEB_URL || `http://localhost:${process.env.PORT || 3000}`;
              const { checkoutUrl, sessionId } = await stripeUtil.createCheckoutSession({ orderId, amount: o.price, description: `Brawl Services™ – ${o.service_type}`, returnUrl: `${webUrl}/payment/stripe/success`, cancelUrl: `${webUrl}/payment/cancel?order=${shortId}` });
              await db.query(`UPDATE orders SET payment_id=$1, payment_method=$2 WHERE id=$3`, [sessionId, method, orderId]);
              await db.query(`INSERT INTO payments (order_id, user_id, method, amount, status, external_id) VALUES ($1,$2,$3,$4,'pending',$5) ON CONFLICT DO NOTHING`, [orderId, interaction.user.id, method, o.price, sessionId]);
              const { ActionRowBuilder: ARB, ButtonBuilder: BB, ButtonStyle: BS } = require('discord.js');
              const payRow = new ARB().addComponents(new BB().setLabel(`Pay with ${method === 'applepay' ? 'Apple Pay' : 'Google Pay'}`).setEmoji(method === 'applepay' ? '🍎' : '🔵').setStyle(BS.Link).setURL(checkoutUrl));
              return interaction.followUp({ embeds: [base(COLORS.PRIMARY).setTitle(`${label} Checkout`).setDescription(`**Order:** \`#${shortId}\`\n**Amount:** **€${parseFloat(o.price).toFixed(2)}**\n\nClick to pay securely.\n> 🔒 *Powered by Stripe*`)], components: [payRow], ephemeral: true });
            } catch (err) {
              return interaction.followUp({ content: `❌ Could not create ${label} checkout: ${err.message}`, ephemeral: true });
            }
          }

          if (method === 'paypal') {
            if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET) return interaction.followUp({ content: '❌ PayPal not configured. Contact staff.', ephemeral: true });
            try {
              const paypal = require('../utils/paypal');
              const webUrl = process.env.WEB_URL || `http://localhost:${process.env.PORT || 3000}`;
              const shortId = orderId.slice(0, 8).toUpperCase();
              const { paypalOrderId, approveUrl } = await paypal.createOrder({ orderId, amount: o.price, description: `Brawl Services™ – ${o.service_type}`, returnUrl: `${webUrl}/payment/success`, cancelUrl: `${webUrl}/payment/cancel?order=${shortId}` });
              await db.query(`UPDATE orders SET payment_id=$1, payment_method='paypal' WHERE id=$2`, [paypalOrderId, orderId]);
              await db.query(`INSERT INTO payments (order_id, user_id, method, amount, status, external_id) VALUES ($1,$2,'paypal',$3,'pending',$4) ON CONFLICT DO NOTHING`, [orderId, interaction.user.id, o.price, paypalOrderId]);
              const { ActionRowBuilder: ARB, ButtonBuilder: BB, ButtonStyle: BS } = require('discord.js');
              const payRow = new ARB().addComponents(new BB().setLabel('Pay with PayPal').setEmoji('💲').setStyle(BS.Link).setURL(approveUrl));
              return interaction.followUp({ embeds: [base(COLORS.PRIMARY).setTitle(`💲 PayPal Checkout`).setDescription(`**Order:** \`#${shortId}\`\n**Amount:** **€${parseFloat(o.price).toFixed(2)}**\n\nClick to pay via PayPal.\n> 🔒 *Powered by PayPal*`)], components: [payRow], ephemeral: true });
            } catch (err) {
              return interaction.followUp({ content: `❌ Could not create PayPal order: ${err?.response?.data?.message || err.message}`, ephemeral: true });
            }
          }
        }

        // Staff panel buttons
        if (id === 'staff_orders') {
          const { rows } = await db.query(`SELECT * FROM orders WHERE status IN ('pending','paid','in_progress') ORDER BY created_at DESC LIMIT 10`);
          return interaction.followUp({ embeds: [base(COLORS.INFO).setTitle(`📦 Active Orders`).setDescription(rows.length ? rows.map(o => `\`#${o.id.slice(0,8).toUpperCase()}\` <@${o.user_id}> | ${o.service_type} | ${o.status.toUpperCase()}`).join('\n') : '*No active orders.*')], ephemeral: true });
        }
        if (id === 'staff_tickets') {
          const { rows } = await db.query(`SELECT * FROM tickets WHERE guild_id=$1 AND status='open' LIMIT 15`, [interaction.guild.id]);
          return interaction.followUp({ embeds: [base(COLORS.INFO).setTitle(`🎫 Open Tickets`).setDescription(rows.length ? rows.map(t => `<#${t.channel_id}> <@${t.user_id}> | ${t.category}`).join('\n') : '*No open tickets.*')], ephemeral: true });
        }
        if (id === 'staff_stats') {
          const [o, v] = await Promise.all([db.query(`SELECT COUNT(*) as total, SUM(price) FILTER(WHERE status='completed') as rev FROM orders`), db.query(`SELECT COUNT(*) as total FROM vouches`)]);
          return interaction.followUp({ embeds: [base(COLORS.SUCCESS).setTitle(`📊 Quick Stats`).addFields({ name: 'Orders', value: o.rows[0].total || '0', inline: true }, { name: 'Revenue', value: `€${parseFloat(o.rows[0].rev || 0).toFixed(2)}`, inline: true }, { name: 'Vouches', value: v.rows[0].total || '0', inline: true })], ephemeral: true });
        }
        if (id === 'staff_blacklist') {
          const { rows } = await db.query(`SELECT * FROM users WHERE banned=TRUE LIMIT 10`);
          return interaction.followUp({ embeds: [base(COLORS.ERROR).setTitle(`🚫 Banned Users`).setDescription(rows.length ? rows.map(u => `<@${u.id}> — *${u.ban_reason || 'No reason'}*`).join('\n') : '*No banned users.*')], ephemeral: true });
        }

        // Account buttons
        if (id === 'account_browse') {
          const { rows } = await db.query(`SELECT * FROM accounts WHERE status='available' ORDER BY price ASC LIMIT 10`);
          return interaction.followUp({ embeds: [base(COLORS.PRIMARY).setTitle(`🎮 Available Accounts`).setDescription(rows.length ? rows.map((a, i) => `**${i+1}.** \`#${a.id.slice(0,8).toUpperCase()}\` ${a.current_rank} | ${a.brawler_count} brawlers | €${a.price}`).join('\n') : '*No accounts available.*')], ephemeral: true });
        }
        if (id === 'account_ticket') {
          const ch = await createTicket(interaction.guild, interaction.user, 'account');
          return interaction.followUp({ content: `✅ Account enquiry ticket opened: ${ch}`, ephemeral: true });
        }

        // Application accept/pending buttons
        if (id.startsWith('app_accept_') || id.startsWith('app_pending_')) {
          const ownerId = process.env.OWNER_ID;
          if (ownerId && interaction.user.id !== ownerId)
            return interaction.followUp({ content: `❌ Only the **server owner** can accept or decline applications.`, ephemeral: true });

          const appId = id.startsWith('app_accept_') ? id.replace('app_accept_', '') : id.replace('app_pending_', '');
          const action = id.startsWith('app_accept_') ? 'accept' : 'pending';
          const { rows } = await db.query(`SELECT * FROM applications WHERE id=$1`, [appId]);
          if (!rows.length) return interaction.followUp({ content: '❌ Application not found.', ephemeral: true });
          const app = rows[0];

          if (action === 'accept') {
            await db.query(`UPDATE applications SET status='accepted', reviewer_id=$1, reviewed_at=NOW() WHERE id=$2`, [interaction.user.id, appId]);
            const roleMap = { staff: process.env.STAFF_ROLE_ID, booster: process.env.BOOSTER_ROLE_ID, coach: process.env.BOOSTER_ROLE_ID };
            const roleId = roleMap[app.type];
            if (roleId) {
              const member = await interaction.guild.members.fetch(app.user_id).catch(() => null);
              if (member) await member.roles.add(roleId).catch(() => {});
            }
            try {
              const user = await interaction.client.users.fetch(app.user_id);
              await user.send({ embeds: [base(COLORS.SUCCESS).setTitle(`✅ Application Accepted!`).setDescription(`Congratulations! Your **${app.type.toUpperCase()}** application for **Brawl Services™** has been **accepted**!\n\nWelcome to the team! 🎉`)] });
              const { applicationAcceptedPanel } = require('../panels/applications');
              await interaction.message.edit(applicationAcceptedPanel(app, user, interaction.user.tag)).catch(() => {});
            } catch {}
            return interaction.followUp({ content: `✅ Accepted! Role assigned and applicant notified.`, ephemeral: true });
          }

          if (action === 'pending') {
            await db.query(`UPDATE applications SET status='pending' WHERE id=$1`, [appId]);
            return interaction.followUp({ content: `🕐 Application marked as pending again.`, ephemeral: true });
          }
        }

        // Coaching booking buttons
        if (id === 'cbk_back_main') {
          const { coachingMainPanel } = require('../panels/coachingBooking');
          return interaction.editReply(coachingMainPanel());
        }

        if (id.startsWith('cbk_day_')) {
          const parts = id.replace('cbk_day_', '').split('_');
          const sType = parts[0];
          const dStr  = parts.slice(2).join('-');
          const { rows: booked } = await db.query(`SELECT TO_CHAR(scheduled_at AT TIME ZONE 'CET', 'HH24:MI') as time FROM coaching_sessions WHERE DATE(scheduled_at AT TIME ZONE 'CET') = $1 AND status NOT IN ('cancelled')`, [dStr]);
          const { coachingTimePanel } = require('../panels/coachingBooking');
          return interaction.followUp({ ...coachingTimePanel(sType, dStr, booked.map(r => r.time.slice(0,5))), ephemeral: true });
        }

        if (id.startsWith('cbk_prevmonth_') || id.startsWith('cbk_nextmonth_')) {
          const isPrev = id.startsWith('cbk_prevmonth_');
          const rest = id.replace(isPrev ? 'cbk_prevmonth_' : 'cbk_nextmonth_', '');
          const underscore = rest.indexOf('_');
          const sType = rest.slice(0, underscore);
          const ym    = rest.slice(underscore + 1);
          const [y, m] = ym.split('-').map(Number);
          const { rows: booked } = await db.query(`SELECT TO_CHAR(scheduled_at AT TIME ZONE 'CET', 'YYYY-MM-DD') as date FROM coaching_sessions WHERE scheduled_at >= $1 AND scheduled_at <= $2 AND status NOT IN ('cancelled')`, [new Date(y, m, 1).toISOString(), new Date(y, m + 1, 0).toISOString()]);
          const bookedDateCounts = {};
          for (const r of booked) bookedDateCounts[r.date] = (bookedDateCounts[r.date] || 0) + 1;
          const { coachingDayPanel } = require('../panels/coachingBooking');
          return interaction.editReply(coachingDayPanel(sType, ym, bookedDateCounts));
        }

        if (id.startsWith('cbk_time_')) {
          const parts = id.replace('cbk_time_', '').split('_');
          const sType = parts[0];
          const dStr  = `${parts[1]}-${parts[2]}-${parts[3]}`;
          const time  = parts[4];
          const { coachingConfirmPanel } = require('../panels/coachingBooking');
          return interaction.editReply(coachingConfirmPanel(sType, dStr, time));
        }

        if (id.startsWith('cbk_back_days_')) {
          const rest = id.replace('cbk_back_days_', '');
          const underscore = rest.indexOf('_');
          const sType = rest.slice(0, underscore);
          const ym    = rest.slice(underscore + 1);
          const [y, m] = ym.split('-').map(Number);
          const { rows: booked } = await db.query(`SELECT TO_CHAR(scheduled_at AT TIME ZONE 'CET', 'YYYY-MM-DD') as date FROM coaching_sessions WHERE scheduled_at >= $1 AND scheduled_at <= $2 AND status NOT IN ('cancelled')`, [new Date(y, m, 1).toISOString(), new Date(y, m + 1, 0).toISOString()]);
          const bookedDateCounts = {};
          for (const r of booked) bookedDateCounts[r.date] = (bookedDateCounts[r.date] || 0) + 1;
          const { coachingDayPanel } = require('../panels/coachingBooking');
          return interaction.editReply(coachingDayPanel(sType, ym, bookedDateCounts));
        }

        if (id.startsWith('cbk_back_times_')) {
          const rest = id.replace('cbk_back_times_', '');
          const underscore = rest.indexOf('_');
          const sType = rest.slice(0, underscore);
          const dStr  = rest.slice(underscore + 1);
          const { rows: booked } = await db.query(`SELECT TO_CHAR(scheduled_at AT TIME ZONE 'CET', 'HH24:MI') as time FROM coaching_sessions WHERE DATE(scheduled_at AT TIME ZONE 'CET') = $1 AND status NOT IN ('cancelled')`, [dStr]);
          const { coachingTimePanel } = require('../panels/coachingBooking');
          return interaction.editReply(coachingTimePanel(sType, dStr, booked.map(r => r.time.slice(0,5))));
        }

        if (id.startsWith('cbk_confirm_')) {
          const parts = id.replace('cbk_confirm_', '').split('_');
          const sType = parts[0];
          const dStr  = `${parts[1]}-${parts[2]}-${parts[3]}`;
          const time  = parts[4];
          const { PRICING } = require('../utils/constants');
          const pricing = PRICING.coaching[sType];
          if (!pricing) return interaction.editReply({ embeds: [error('Error', `Unknown session type: ${sType}`)], components: [], files: [] });
          const { rows: conflict } = await db.query(`SELECT id FROM coaching_sessions WHERE DATE(scheduled_at AT TIME ZONE 'CET') = $1 AND TO_CHAR(scheduled_at AT TIME ZONE 'CET', 'HH24:MI') = $2 AND status NOT IN ('cancelled')`, [dStr, time]);
          if (conflict.length) return interaction.editReply({ embeds: [error('Slot Taken', `**${time} CET on ${dStr}** was just booked! Go back and choose another slot.`)], components: [], files: [] });
          const { v4: uuidv4 } = require('uuid');
          const scheduledAt = new Date(`${dStr}T${time}:00+01:00`);
          const sessionId = uuidv4();
          await db.query(`INSERT INTO coaching_sessions (id, user_id, guild_id, session_type, duration_hours, price, scheduled_at) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [sessionId, interaction.user.id, interaction.guild.id, sType, parseInt(pricing.label.match(/\d+/)?.[0] || 1), pricing.price, scheduledAt.toISOString()]);
          const ticketChannel = await createTicket(interaction.guild, interaction.user, 'coaching');
          await db.query(`UPDATE coaching_sessions SET ticket_channel_id=$1 WHERE id=$2`, [ticketChannel.id, sessionId]);
          const displayDate = scheduledAt.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
          await ticketChannel.send(`🎓 **Coaching session booked!**\n**Type:** ${pricing.label}\n**Date:** ${displayDate}\n**Time:** ${time} CET\n**Price:** €${pricing.price}\n\nComplete payment below to confirm your slot.`);
          const { paymentPanel } = require('../panels');
          await ticketChannel.send(paymentPanel(sessionId, pricing.price, `Coaching – ${pricing.label} on ${displayDate} at ${time}`));
          if (process.env.ORDER_LOG_CHANNEL_ID) {
            const logCh = interaction.guild.channels.cache.get(process.env.ORDER_LOG_CHANNEL_ID);
            if (logCh) {
              const { claimCoachingPanel } = require('../panels');
              const { rows: [s] } = await db.query(`SELECT * FROM coaching_sessions WHERE id=$1`, [sessionId]);
              if (s) logCh.send(claimCoachingPanel(s));
            }
          }
          return interaction.editReply({ embeds: [success('Booking Confirmed! 🎉', `**Session:** ${pricing.label}\n**Date:** ${displayDate}\n**Time:** ${time} CET\n**Price:** **€${pricing.price}**\n\n${em.TICKET} Ticket: ${ticketChannel}\n\nComplete payment in your ticket to lock in the slot!`)], components: [], files: [] });
        }

      } catch (err) {
        console.error('[Button error]', id, err.message);
        await interaction.followUp({ content: `❌ Something went wrong: ${err.message}`, ephemeral: true }).catch(() => {});
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SELECT MENUS
    // ─────────────────────────────────────────────────────────────────────────
    if (interaction.isStringSelectMenu()) {
      const id = interaction.customId;
      await interaction.deferUpdate().catch(() => {});

      try {
        if (id === 'order_service_select') {
          const service = interaction.values[0];
          if (service === 'coaching') {
            const { coachingMainPanel } = require('../panels/coachingBooking');
            return interaction.editReply(coachingMainPanel());
          }
          if (service === 'buy_account') {
            const { rows } = await db.query(`SELECT * FROM accounts WHERE status='available' ORDER BY price ASC LIMIT 8`);
            return interaction.editReply(panels.buyAccountPanel(rows));
          }
          return interaction.editReply({ embeds: [base(COLORS.INFO).setTitle(`📦 Place Order`).setDescription(`Use \`/order create\` with service \`${service}\` to place your order!`)], components: [], files: [] });
        }

        if (id === 'cbk_type') {
          const sType = interaction.values[0];
          const { PRICING } = require('../utils/constants');
          const { StringSelectMenuBuilder: SSM, ActionRowBuilder: ARL } = require('discord.js');
          const pricing = PRICING.coaching[sType];
          const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
          const now = new Date();
          const monthOpts = [];
          for (let i = 0; i < 3; i++) {
            const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
            monthOpts.push({ label: `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`, value: `${d.getFullYear()}-${d.getMonth()}`, description: i === 0 ? 'Current month' : i === 1 ? 'Next month' : 'Month after next' });
          }
          const embed = base(COLORS.PRIMARY).setTitle(`📅 Pick a Month`).setDescription(`**Session:** ${pricing.label} — **€${pricing.price}**\n\nSelect a month to see the calendar.`);
          const monthSelect = new SSM().setCustomId(`cbk_showdays_${sType}`).setPlaceholder('📅 Select a month...').addOptions(monthOpts);
          return interaction.followUp({ embeds: [embed], components: [new ARL().addComponents(monthSelect)], ephemeral: true });
        }

        if (id.startsWith('cbk_showdays_')) {
          const sType = id.replace('cbk_showdays_', '');
          const ym = interaction.values[0];
          const [y, m] = ym.split('-').map(Number);
          const { rows: booked } = await db.query(`SELECT TO_CHAR(scheduled_at AT TIME ZONE 'CET', 'YYYY-MM-DD') as date FROM coaching_sessions WHERE scheduled_at >= $1 AND scheduled_at <= $2 AND status NOT IN ('cancelled')`, [new Date(y, m, 1).toISOString(), new Date(y, m + 1, 0).toISOString()]);
          const bookedDateCounts = {};
          for (const r of booked) bookedDateCounts[r.date] = (bookedDateCounts[r.date] || 0) + 1;
          const { coachingDayPanel } = require('../panels/coachingBooking');
          return interaction.editReply(coachingDayPanel(sType, ym, bookedDateCounts));
        }

        if (id === 'cbk_month') {
          return interaction.followUp({ content: `⚠️ Please select your **session type** first using the top dropdown!`, ephemeral: true });
        }

        if (id === 'ticket_category_select') {
          const category = interaction.values[0];
          const { rows: existing } = await db.query(`SELECT * FROM tickets WHERE user_id=$1 AND guild_id=$2 AND status='open' LIMIT 1`, [interaction.user.id, interaction.guild.id]);
          if (existing.length) return interaction.followUp({ content: `⚠️ You already have an open ticket: <#${existing[0].channel_id}>`, ephemeral: true });
          const ch = await createTicket(interaction.guild, interaction.user, category);
          return interaction.followUp({ content: `✅ Ticket created: ${ch}`, ephemeral: true });
        }

      } catch (err) {
        console.error('[Select error]', id, err.message);
        await interaction.followUp({ content: `❌ Something went wrong: ${err.message}`, ephemeral: true }).catch(() => {});
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // MODALS
    // ─────────────────────────────────────────────────────────────────────────
    if (interaction.isModalSubmit()) {
      try {
        // Application form
        if (interaction.customId.startsWith('app_modal_')) {
          await interaction.deferReply({ ephemeral: true });
          const type = interaction.customId.replace('app_modal_', '');
          const qs = APP_QUESTIONS[type];
          const answers = {};
          for (let i = 1; i <= 5; i++) answers[qs[i - 1]] = interaction.fields.getTextInputValue(`q${i}`);

          const { v4: uuidv4 } = require('uuid');
          const appId = uuidv4();
          const { rows: [app] } = await db.query(
            `INSERT INTO applications (id, user_id, guild_id, type, answers) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
            [appId, interaction.user.id, interaction.guild.id, type, JSON.stringify(answers)]
          );

          const appChannelId = process.env.APPLICATIONS_CHANNEL_ID;
          if (appChannelId) {
            const appCh = interaction.guild.channels.cache.get(appChannelId);
            if (appCh) {
              const { applicationReviewPanel } = require('../panels/applications');
              const msg = await appCh.send(applicationReviewPanel(app, interaction.user));
              await db.query(`UPDATE applications SET review_message_id=$1, review_channel_id=$2 WHERE id=$3`, [msg.id, appCh.id, appId]);
              try {
                const thread = await msg.startThread({ name: `${type}-app-${interaction.user.username}`.slice(0, 100), autoArchiveDuration: 10080 });
                await thread.send(`📋 Application from **${interaction.user.tag}** for **${type.toUpperCase()}**.\nStaff can discuss here. Only the owner can accept/decline using the buttons above.`);
              } catch {}
            }
          }

          const typeEmoji = { staff: '🛠️', booster: '⚡', coach: '🎓' }[type];
          return interaction.editReply({ embeds: [success('Application Submitted!',
            `Your **${typeEmoji} ${type.toUpperCase()}** application has been submitted!\n\n` +
            `**Application ID:** \`#${appId.slice(0, 8).toUpperCase()}\`\n\n` +
            `You'll be notified via DM with the decision.\nThank you for applying to **Brawl Services™**! 🙏`
          )] });
        }

        // Decline reason
        if (interaction.customId.startsWith('app_decline_reason_')) {
          await interaction.deferReply({ ephemeral: true });
          const appId = interaction.customId.replace('app_decline_reason_', '');
          const reason = interaction.fields.getTextInputValue('reason') || 'No reason provided';
          const { rows } = await db.query(`SELECT * FROM applications WHERE id=$1`, [appId]);
          if (!rows.length) return interaction.editReply({ content: '❌ Application not found.' });
          const app = rows[0];
          await db.query(`UPDATE applications SET status='declined', reviewer_id=$1, reviewer_notes=$2, reviewed_at=NOW() WHERE id=$3`, [interaction.user.id, reason, appId]);
          try {
            const user = await interaction.client.users.fetch(app.user_id);
            await user.send({ embeds: [base(COLORS.ERROR).setTitle(`❌ Application Declined`).setDescription(`Your **${app.type.toUpperCase()}** application for **Brawl Services™** has been **declined**.\n\n**Reason:** ${reason}\n\nYou may re-apply in the future. Thank you for your interest!`)] });
            if (app.review_message_id && app.review_channel_id) {
              const ch = interaction.guild.channels.cache.get(app.review_channel_id);
              const msg = ch ? await ch.messages.fetch(app.review_message_id).catch(() => null) : null;
              if (msg) {
                const { applicationDeclinedPanel } = require('../panels/applications');
                await msg.edit(applicationDeclinedPanel(app, user, interaction.user.tag, reason)).catch(() => {});
              }
            }
          } catch {}
          return interaction.editReply({ embeds: [success('Declined', `Application \`#${appId.slice(0, 8).toUpperCase()}\` declined. Applicant notified.`)] });
        }

        // Vouch
        if (interaction.customId === 'modal_vouch_submit') {
          await interaction.deferReply({ ephemeral: true });
          const rating  = parseInt(interaction.fields.getTextInputValue('vouch_rating'));
          const comment = interaction.fields.getTextInputValue('vouch_comment');
          const orderId = interaction.fields.getTextInputValue('vouch_order') || null;
          if (isNaN(rating) || rating < 1 || rating > 5)
            return interaction.editReply({ embeds: [error('Invalid Rating', 'Rating must be 1-5.')] });
          await db.query(`INSERT INTO vouches (user_id, guild_id, order_id, rating, comment) VALUES ($1,$2,$3,$4,$5)`, [interaction.user.id, interaction.guild.id, orderId, rating, comment]);
          const stars = '⭐'.repeat(rating);
          if (process.env.VOUCH_CHANNEL_ID) {
            const ch = interaction.guild.channels.cache.get(process.env.VOUCH_CHANNEL_ID);
            if (ch) ch.send({ embeds: [base(COLORS.PRIMARY).setTitle(`${em.VOUCH} New Vouch ${stars}`).setDescription(`**Customer:** ${interaction.user}\n**Rating:** ${stars} (${rating}/5)\n\n> *${comment}*`).setThumbnail(interaction.user.displayAvatarURL())] });
          }
          return interaction.editReply({ embeds: [success('Vouch Submitted!', `Thank you! Your **${rating}/5 ⭐** vouch has been submitted.`)] });
        }

      } catch (err) {
        console.error('[Modal error]', interaction.customId, err.message);
        const reply = { content: `❌ Something went wrong: ${err.message}`, ephemeral: true };
        if (interaction.deferred || interaction.replied) await interaction.editReply(reply).catch(() => {});
        else await interaction.reply(reply).catch(() => {});
      }
    }
  },
};
